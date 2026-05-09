// Local wallet UI server. Uses nc per request to avoid CDC-ECM TCP issues.

import { keccak256 } from "ethereum-cryptography/keccak";
import { secp256k1 } from "ethereum-cryptography/secp256k1";
import { hexToBytes, toHex } from "ethereum-cryptography/utils";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));

loadEnv(path.join(CURRENT_DIR, "secrets.env"));
loadEnv(path.join(CURRENT_DIR, ".env"));

const DEVICE_HOST = Bun.env.DEVICE_HOST ?? "10.0.0.1";
const DEVICE_PORT = Number(Bun.env.DEVICE_PORT ?? 4000);
const HOST = Bun.env.WALLET_HOST ?? "127.0.0.1";
const PORT = Number(Bun.env.WALLET_PORT ?? 3030);
const DEBUG = Bun.env.WALLET_DEBUG !== "0";
const ZEROX_BASE_URL = "https://api.0x.org";
const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";
const DEFAULT_SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

const assets = {
  "/": {
    file: new URL("./index.html", import.meta.url),
    type: "text/html; charset=utf-8",
  },
  "/styles.css": {
    file: new URL("./styles.css", import.meta.url),
    type: "text/css; charset=utf-8",
  },
  "/app.js": {
    file: new URL("./app.js", import.meta.url),
    type: "text/javascript; charset=utf-8",
  },
};

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function log(message) {
  if (!DEBUG) return;
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${message}`);
}

function truncate(text, max = 120) {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

function requireOutput(label, output) {
  if (!output) {
    throw new Error(`${label} returned empty output. Is the wallet applet uploaded?`);
  }
  return output;
}

function normalizeKeyHex(value) {
  let hex = String(value).trim().toLowerCase();
  if (hex.startsWith("0x")) {
    hex = hex.slice(2);
  }
  if (hex.length !== 64) {
    throw new Error("invalid private key length");
  }
  if (!/^[0-9a-f]+$/.test(hex)) {
    throw new Error("invalid private key hex");
  }
  return hex;
}

function deriveAddress(hexKey) {
  const priv = hexToBytes(hexKey);
  const pub = secp256k1.getPublicKey(priv, false);
  const hash = keccak256(pub.slice(1));
  const address = toHex(hash.slice(-20));
  return toChecksumAddress(address);
}

function toChecksumAddress(address) {
  const lower = address.toLowerCase();
  const hash = toHex(keccak256(new TextEncoder().encode(lower)));
  let out = "0x";
  for (let i = 0; i < lower.length; i += 1) {
    const ch = lower[i];
    if (parseInt(hash[i], 16) >= 8) {
      out += ch.toUpperCase();
    } else {
      out += ch;
    }
  }
  return out;
}

async function fetchState() {
  const rawKey = requireOutput(
    "Wallet.Key",
    await callApplet("Wallet.Key", "", { redactOutput: true }),
  );
  if (rawKey === "not_initialized") {
    return { status: "not_initialized" };
  }
  const key = normalizeKeyHex(rawKey);
  const address = deriveAddress(key);
  return { status: "ready", address };
}

function readSwapParams(url) {
  const query = url.searchParams;
  const chainId = query.get("chainId") || "1";
  const sellToken = query.get("sellToken");
  const buyToken = query.get("buyToken");
  const sellAmount = query.get("sellAmount");
  const taker = query.get("taker") || process.env.SIMBA_TAKER_ADDRESS;

  if (!sellToken || !buyToken || !sellAmount) {
    return { error: "Missing sellToken, buyToken, or sellAmount." };
  }

  if (!taker || /^0x0{40}$/i.test(taker)) {
    return { error: "Missing SIMBA_TAKER_ADDRESS. Add the generated wallet address to secrets.env." };
  }

  return { chainId, sellToken, buyToken, sellAmount, taker };
}

function isUsableAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(value || "") && !/^0x0{40}$/i.test(value);
}

function formatEtherFromWei(hexWei) {
  const wei = BigInt(hexWei || "0x0");
  const base = 10n ** 18n;
  const whole = wei / base;
  const fraction = wei % base;

  if (wei === 0n) return "0.0";
  if (fraction === 0n) return whole.toString();

  const fractionText = fraction.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}.${fractionText}`;
}

async function proxy0x(url, endpoint) {
  if (!process.env.ZEROX_API_KEY) {
    return jsonError("Missing ZEROX_API_KEY in secrets.env.", 500);
  }

  const params = readSwapParams(url);
  if (params.error) {
    return jsonError(params.error, 400);
  }

  const zeroExUrl = new URL(`${ZEROX_BASE_URL}/swap/allowance-holder/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    zeroExUrl.searchParams.set(key, value);
  }

  try {
    const zeroExResponse = await fetch(zeroExUrl, {
      headers: {
        "0x-api-key": process.env.ZEROX_API_KEY,
        "0x-version": "v2",
        "Content-Type": "application/json",
      },
    });

    const payload = await zeroExResponse.json().catch(() => ({}));
    return jsonOk(payload, zeroExResponse.status);
  } catch (error) {
    return jsonError("0x request failed.", 502, error.message);
  }
}

async function proxyCoinGeckoPrices(url) {
  if (!process.env.COINGECKO_API_KEY) {
    return jsonError("Missing COINGECKO_API_KEY in secrets.env.", 500);
  }

  const ids = url.searchParams.get("ids");
  if (!ids) {
    return jsonError("Missing ids.", 400);
  }

  const coinGeckoUrl = new URL(`${COINGECKO_BASE_URL}/simple/price`);
  coinGeckoUrl.searchParams.set("ids", ids);
  coinGeckoUrl.searchParams.set("vs_currencies", url.searchParams.get("vs_currencies") || "usd");
  coinGeckoUrl.searchParams.set("include_24hr_change", "true");
  coinGeckoUrl.searchParams.set("include_last_updated_at", "true");

  try {
    const coinGeckoResponse = await fetch(coinGeckoUrl, {
      headers: {
        "x-cg-demo-api-key": process.env.COINGECKO_API_KEY,
        "Content-Type": "application/json",
      },
    });

    const payload = await coinGeckoResponse.json().catch(() => ({}));
    return jsonOk(payload, coinGeckoResponse.status);
  } catch (error) {
    return jsonError("CoinGecko request failed.", 502, error.message);
  }
}

async function readWalletAddress() {
  try {
    const state = await fetchState();
    if (state.status === "ready" && isUsableAddress(state.address)) {
      return { connected: true, source: "device", address: state.address };
    }
  } catch {
    // Fall through to env fallback.
  }

  if (isUsableAddress(process.env.SIMBA_TAKER_ADDRESS)) {
    return { connected: true, source: "env", address: process.env.SIMBA_TAKER_ADDRESS };
  }

  return { connected: false, source: "none", address: null };
}

async function readWalletBalance() {
  const wallet = await readWalletAddress();
  if (!wallet.connected || !isUsableAddress(wallet.address)) {
    return {
      ...wallet,
      network: "sepolia",
      chainId: 11155111,
      balanceWei: "0x0",
      balanceEth: "0.0",
    };
  }

  const rpcUrl = process.env.SEPOLIA_RPC_URL || DEFAULT_SEPOLIA_RPC_URL;
  const rpcResponse = await fetch(rpcUrl, {
    method: "POST",
    signal: AbortSignal.timeout(5000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBalance",
      params: [wallet.address, "latest"],
    }),
  });
  const payload = await rpcResponse.json().catch(() => ({}));
  if (!rpcResponse.ok || payload.error || typeof payload.result !== "string") {
    throw new Error(payload.error?.message || rpcResponse.statusText || "Invalid Sepolia RPC response.");
  }

  return {
    ...wallet,
    network: "sepolia",
    chainId: 11155111,
    balanceWei: payload.result,
    balanceEth: formatEtherFromWei(payload.result),
  };
}

async function callApplet(method, input, options = {}) {
  const redactOutput = options.redactOutput === true;
  log(`bridge -> ${method} (len=${input.length}) ${truncate(input)}`);
  const req = JSON.stringify({ Method: method, Input: input }) + "\n";
  const proc = Bun.spawn(["nc", "-w", "3", DEVICE_HOST, String(DEVICE_PORT)], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(req);
  await proc.stdin.end();

  const [stdout, stderr, exit] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exit !== 0 || !stdout) {
    log(`bridge !! nc failed (exit=${exit}) ${truncate(stderr.trim())}`);
    throw new Error(stderr.trim() || `nc exited ${exit}`);
  }

  const nl = stdout.indexOf("\n");
  const reply = JSON.parse(nl >= 0 ? stdout.slice(0, nl) : stdout);
  if (reply.Error) throw new Error(reply.Error);
  const output = reply.Output ?? "";
  if (redactOutput) {
    log(`bridge <- ${method} (len=${output.length}) [redacted]`);
  } else {
    log(`bridge <- ${method} (len=${output.length}) ${truncate(output)}`);
  }
  return output;
}

function jsonOk(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function jsonError(message, status = 500, detail) {
  return Response.json(detail ? { error: message, detail } : { error: message }, { status });
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(req) {
    const url = new URL(req.url);
    log(`http ${req.method} ${url.pathname}`);

    if (req.method === "GET" && assets[url.pathname]) {
      const asset = assets[url.pathname];
      return new Response(Bun.file(asset.file), {
        headers: { "Content-Type": asset.type },
      });
    }

    try {
      if (url.pathname === "/api/swap/price" && req.method === "GET") {
        return proxy0x(url, "price");
      }

      if (url.pathname === "/api/swap/quote" && req.method === "GET") {
        return proxy0x(url, "quote");
      }

      if (url.pathname === "/api/market/prices" && req.method === "GET") {
        return proxyCoinGeckoPrices(url);
      }

      if (url.pathname === "/api/wallet/address" && req.method === "GET") {
        const wallet = await readWalletAddress();
        return jsonOk(wallet);
      }

      if (url.pathname === "/api/wallet/balance" && req.method === "GET") {
        const balance = await readWalletBalance();
        return jsonOk(balance);
      }

      if (url.pathname === "/api/status" && req.method === "GET") {
        const state = await fetchState();
        return jsonOk({ status: state.status ?? "unknown" });
      }

      if (url.pathname === "/api/init" && req.method === "POST") {
        const result = requireOutput("Wallet.Init", await callApplet("Wallet.Init", ""));
        const state = await fetchState();
        return jsonOk({ result, ...state });
      }

      if (url.pathname === "/api/rotate" && req.method === "POST") {
        const result = requireOutput("Wallet.Rotate", await callApplet("Wallet.Rotate", ""));
        const state = await fetchState();
        return jsonOk({ result, ...state });
      }

      if (url.pathname === "/api/state" && req.method === "GET") {
        const state = await fetchState();
        return jsonOk(state);
      }

      return new Response("not found", { status: 404 });
    } catch (err) {
      log(`http !! ${url.pathname} ${truncate(String(err.message ?? err))}`);
      return jsonError(err.message, 502);
    }
  },
});

console.log(`wallet UI on http://${server.hostname}:${server.port}`);
console.log(`debug logging: ${DEBUG ? "on" : "off"} (set WALLET_DEBUG=0 to disable)`);

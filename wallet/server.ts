// Local wallet UI server. Uses nc per request to avoid CDC-ECM TCP issues.

import { keccak256 } from "ethereum-cryptography/keccak";
import { secp256k1 } from "ethereum-cryptography/secp256k1";
import { hexToBytes, toHex } from "ethereum-cryptography/utils";

const DEVICE_HOST = Bun.env.DEVICE_HOST ?? "10.0.0.1";
const DEVICE_PORT = Number(Bun.env.DEVICE_PORT ?? 4000);
const HOST = Bun.env.WALLET_HOST ?? "127.0.0.1";
const PORT = Number(Bun.env.WALLET_PORT ?? 3030);
const DEBUG = Bun.env.WALLET_DEBUG !== "0";

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

function jsonOk(data) {
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}

function jsonError(message, status = 500) {
  return Response.json({ error: message }, { status });
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

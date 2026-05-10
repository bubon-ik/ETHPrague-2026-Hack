import { keccak256 } from "ethereum-cryptography/keccak";
import { secp256k1 } from "ethereum-cryptography/secp256k1";
import { ecdsaSign } from "ethereum-cryptography/secp256k1-compat";
import { hexToBytes, toHex } from "ethereum-cryptography/utils";

const DEVICE_HOST = Bun.env.DEVICE_HOST ?? "10.0.0.1";
const DEVICE_PORT = Number(Bun.env.DEVICE_PORT ?? 4000);
const DEFAULT_GAS_LIMIT = 21000n;

/** Sepolia Uniswap — plain ETH transfers revert (e.g. router: Not WETH9). */
const TRANSFER_TO_REJECT_LOWER = new Set([
  "0x3bfa4769fb09eefc5a80d6e87c3b9c650f7ae48e", // SwapRouter02
  "0xed1f6473345f45b75f8179591dd5ba1888cf2fb3", // QuoterV2
]);

const rawArgs = Bun.argv.slice(2);
if (rawArgs.length === 0 || rawArgs.includes("--help") || rawArgs.includes("-h")) {
  printUsage();
  process.exit(0);
}

const { flags, positionals } = parseArgs(rawArgs);
const command = positionals.shift();

if (!command) {
  printUsage();
  process.exit(2);
}

try {
  if (command === "transfer_to") {
    await cmdTransfer(positionals, flags);
  } else if (command === "commands") {
    await printCommands();
  } else {
    throw new Error(`unknown command: ${command}`);
  }
} catch (err) {
  const message = err?.message ?? String(err);
  console.error(`error: ${message}`);
  process.exit(1);
}

async function cmdTransfer(positionals, flags) {
  const [toRaw, amountRaw, symbolRaw] = positionals;
  if (!toRaw || !amountRaw || !symbolRaw) {
    throw new Error("usage: transfer_to <address> <amount> ETH");
  }
  if (String(symbolRaw).toUpperCase() !== "ETH") {
    throw new Error("only ETH is supported right now");
  }

  const to = normalizeAddress(toRaw);
  if (TRANSFER_TO_REJECT_LOWER.has(to.toLowerCase())) {
    throw new Error(
      `refusing transfer_to ${to}: this is the Sepolia Uniswap router or quoter, not a wallet — plain ETH reverts (Not WETH9). Use a real wallet 0x address.`,
    );
  }
  const value = parseUnits(amountRaw, 18);
  const dryRun = flags.has("dry-run");
  const gasLimit = flags.get("gas-limit") ? BigInt(flags.get("gas-limit")) : DEFAULT_GAS_LIMIT;
  const nonceOverride = flags.get("nonce");
  const chainOverride = flags.get("chain-id");
  const gasPriceOverride = flags.get("gas-price-gwei");

  const rpcUrl =
    flags.get("rpc") ??
    Bun.env.RPC_URL ??
    Bun.env.WALLET_RPC_URL ??
    "";
  if (!rpcUrl) {
    throw new Error("RPC_URL is required (or pass --rpc <url>)");
  }

  const keyHex = await fetchPrivateKey();
  const privKey = hexToBytes(keyHex);
  const from = deriveAddress(keyHex);

  const chainId = chainOverride
    ? BigInt(chainOverride)
    : BigInt(await rpc(rpcUrl, "eth_chainId", []));
  const nonce = nonceOverride
    ? BigInt(nonceOverride)
    : BigInt(await rpc(rpcUrl, "eth_getTransactionCount", [from, "pending"]));
  const gasPrice = gasPriceOverride
    ? parseUnits(gasPriceOverride, 9)
    : BigInt(await rpc(rpcUrl, "eth_gasPrice", []));

  const rawTx = await signLegacyTransfer({
    nonce,
    gasPrice,
    gasLimit,
    to,
    value,
    chainId,
    privKey,
  });
  const rawTxHex = "0x" + toHex(rawTx);
  const localHash = "0x" + toHex(keccak256(rawTx));

  console.log(`from: ${from}`);
  console.log(`to: ${to}`);
  console.log(`amount: ${amountRaw} ETH`);
  console.log(`nonce: ${nonce.toString()}`);
  console.log(`gasPriceWei: ${gasPrice.toString()}`);
  console.log(`gasLimit: ${gasLimit.toString()}`);
  console.log(`chainId: ${chainId.toString()}`);
  console.log(`txHash: ${localHash}`);

  if (dryRun) {
    console.log(`rawTx: ${rawTxHex}`);
    return;
  }

  const sentHash = await rpc(rpcUrl, "eth_sendRawTransaction", [rawTxHex]);
  console.log(`sent: ${sentHash}`);
}

async function printCommands() {
  const text = await Bun.file(new URL("./commands.md", import.meta.url)).text();
  console.log(text.trimEnd());
}

function printUsage() {
  console.log("Wallet CLI (transactions)");
  console.log("");
  console.log("Usage:");
  console.log("  bun run wallet/cli.ts transfer_to <address> <amount> ETH [options]");
  console.log("  bun run wallet/cli.ts commands");
  console.log("");
  console.log("Options:");
  console.log("  --rpc <url>           JSON-RPC endpoint (or set RPC_URL)");
  console.log("  --dry-run             build and sign only, do not broadcast");
  console.log("  --gas-limit <num>     override gas limit (default 21000)");
  console.log("  --gas-price-gwei <n>  override gas price in gwei");
  console.log("  --nonce <n>           override nonce");
  console.log("  --chain-id <id>       override chain id");
  console.log("");
  console.log("Commands list:");
  console.log("  See wallet/commands.md");
}

function parseArgs(args) {
  const flags = new Map();
  const positionals = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const [key, inlineValue] = arg.slice(2).split("=");
    if (inlineValue !== undefined) {
      flags.set(key, inlineValue);
      continue;
    }

    const next = args[i + 1];
    if (next && !next.startsWith("-")) {
      flags.set(key, next);
      i += 1;
    } else {
      flags.set(key, "true");
    }
  }

  return { flags, positionals };
}

async function fetchPrivateKey() {
  const rawKey = requireOutput(
    "Wallet.Key",
    await callApplet("Wallet.Key", "", { redactOutput: true }),
  );
  if (rawKey === "not_initialized") {
    throw new Error("wallet not initialized; run the UI or Wallet.Init first");
  }
  return normalizeKeyHex(rawKey);
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

function normalizeAddress(value) {
  let hex = String(value).trim();
  if (hex.startsWith("0x")) {
    hex = hex.slice(2);
  }
  if (!/^[0-9a-fA-F]{40}$/.test(hex)) {
    throw new Error("invalid address");
  }
  return "0x" + hex.toLowerCase();
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

async function callApplet(method, input, options = {}) {
  const redactOutput = options.redactOutput === true;
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
    throw new Error(stderr.trim() || `nc exited ${exit}`);
  }

  const nl = stdout.indexOf("\n");
  const reply = JSON.parse(nl >= 0 ? stdout.slice(0, nl) : stdout);
  if (reply.Error) throw new Error(reply.Error);
  const output = reply.Output ?? "";
  if (!redactOutput) {
    return output;
  }
  return output;
}

function requireOutput(label, output) {
  if (!output) {
    throw new Error(`${label} returned empty output. Is the wallet applet uploaded?`);
  }
  return output;
}

async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`rpc ${res.status}: ${JSON.stringify(body)}`);
  }
  if (body.error) {
    throw new Error(body.error.message || String(body.error));
  }
  return body.result;
}

function parseUnits(value, decimals) {
  const text = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error("invalid amount");
  }
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) {
    throw new Error(`too many decimal places (max ${decimals})`);
  }
  const wholePart = BigInt(whole || "0");
  const fracPart = BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  return wholePart * 10n ** BigInt(decimals) + fracPart;
}

async function signLegacyTransfer({ nonce, gasPrice, gasLimit, to, value, chainId, privKey }) {
  const toBytes = hexToBytes(to.slice(2));
  const dataBytes = new Uint8Array([]);
  const fields = [
    bigIntToBytes(nonce),
    bigIntToBytes(gasPrice),
    bigIntToBytes(gasLimit),
    toBytes,
    bigIntToBytes(value),
    dataBytes,
  ];

  const payload = rlpEncode([
    ...fields,
    bigIntToBytes(chainId),
    new Uint8Array([]),
    new Uint8Array([]),
  ]);
  const msgHash = keccak256(payload);

  const { signature, recid } = ecdsaSign(msgHash, privKey);
  if (signature.length !== 64) {
    throw new Error("unexpected signature length");
  }
  const r = bytesToBigInt(signature.slice(0, 32));
  const s = bytesToBigInt(signature.slice(32, 64));
  const v = BigInt(recid) + 35n + 2n * chainId;

  return rlpEncode([
    ...fields,
    bigIntToBytes(v),
    bigIntToBytes(r),
    bigIntToBytes(s),
  ]);
}


function bigIntToBytes(value) {
  if (value === 0n) return new Uint8Array([]);
  let hex = value.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return hexToBytes(hex);
}

function bytesToBigInt(bytes) {
  if (bytes.length === 0) return 0n;
  return BigInt("0x" + toHex(bytes));
}

function rlpEncode(value) {
  if (Array.isArray(value)) {
    const encodedItems = value.map((item) => rlpEncode(item));
    const payload = concatBytes(encodedItems);
    return concatBytes([encodeLength(payload.length, 0xc0), payload]);
  }

  if (!(value instanceof Uint8Array)) {
    throw new Error("rlp encode expects Uint8Array or array");
  }

  if (value.length === 1 && value[0] < 0x80) {
    return value;
  }

  return concatBytes([encodeLength(value.length, 0x80), value]);
}

function encodeLength(len, offset) {
  if (len <= 55) {
    return Uint8Array.of(len + offset);
  }
  const lenBytes = intToBytes(len);
  return concatBytes([
    Uint8Array.of(offset + 55 + lenBytes.length),
    lenBytes,
  ]);
}

function intToBytes(value) {
  let hex = value.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return hexToBytes(hex);
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

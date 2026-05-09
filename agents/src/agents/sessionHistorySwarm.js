/**
 * Encrypt full session history (JSON), then upload ciphertext via swarm-kv.
 * Configure with SWARM_KV_* and SESSION_HISTORY_ENCRYPTION_SECRET (see .env.example).
 *
 * Loads SwarmKV from repo `swarm_tests/swarm-kv/dist` (run `npm run build` there if missing).
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SWARM_KV_ENTRY = path.join(
  THIS_DIR,
  "../../../swarm_tests/swarm-kv/dist/index.js",
);

async function loadSwarmKV() {
  try {
    const mod = await import(pathToFileURL(SWARM_KV_ENTRY).href);
    return mod.SwarmKV;
  } catch (e) {
    throw new Error(
      `swarm-kv dist not loadable (${SWARM_KV_ENTRY}). Build swarm_tests/swarm-kv: npm install && npm run build — ${e?.message ?? e}`,
    );
  }
}

const ENC_VERSION = 1;
const ALGO = "aes-256-gcm";
const SCRYPT_SALT = "swarm-kv-session-enc-v1";
const SWARM_NAMESPACE = "wallet-agent-session";
const SWARM_KEY = "session_history";

function trimEnv(v) {
  return typeof v === "string" ? v.trim() : "";
}

/** 64 hex chars (Swarm postage batch id). */
function isPlausibleBatchId(id) {
  const h = id.replace(/^0x/i, "");
  return /^[0-9a-f]{64}$/i.test(h);
}

function isPlaceholderBatch(id) {
  const l = id.toLowerCase();
  return (
    l.includes("your_") ||
    l.includes("paste") ||
    l.includes("here") ||
    l.includes("example")
  );
}

/** `0x` + 64 hex (feed signing key). */
function isPlausiblePrivateKey(pk) {
  const t = trimEnv(pk);
  return /^0x[0-9a-f]{64}$/i.test(t) || /^[0-9a-f]{64}$/i.test(t);
}

export function resolveSwarmBeeUrl() {
  return (
    trimEnv(process.env.SWARM_KV_BEE_URL) ||
    trimEnv(process.env.BEE_URL) ||
    trimEnv(process.env.SWARM_NODE_URL)
  );
}

export function resolveSwarmBatchId() {
  const candidates = [
    trimEnv(process.env.SWARM_KV_BATCH_ID),
    trimEnv(process.env.BATCH_ID),
    trimEnv(process.env.SWARM_BATCH_ID),
  ];
  for (const c of candidates) {
    if (!c || isPlaceholderBatch(c)) continue;
    if (isPlausibleBatchId(c)) return c.startsWith("0x") ? c.slice(2) : c;
  }
  return "";
}

export function resolveSwarmPrivateKey() {
  const pk =
    trimEnv(process.env.SWARM_KV_PRIVATE_KEY) ||
    trimEnv(process.env.PRIVATE_KEY);
  if (!pk || !isPlausiblePrivateKey(pk)) return "";
  return pk.startsWith("0x") ? pk : `0x${pk}`;
}

export function resolveSessionEncryptionSecret() {
  return (
    trimEnv(process.env.SESSION_HISTORY_ENCRYPTION_SECRET) ||
    trimEnv(process.env.SWARM_KV_ENCRYPTION_SECRET)
  );
}

function missingSwarmEnvFields() {
  const missing = [];
  if (!resolveSwarmBeeUrl()) {
    missing.push(
      "Bee URL (SWARM_KV_BEE_URL or BEE_URL or SWARM_NODE_URL)",
    );
  }
  if (!resolveSwarmBatchId()) {
    missing.push(
      "Postage batch (SWARM_KV_BATCH_ID or BATCH_ID / SWARM_BATCH_ID, 64 hex)",
    );
  }
  if (!resolveSwarmPrivateKey()) {
    missing.push(
      "Feed key (SWARM_KV_PRIVATE_KEY or PRIVATE_KEY, 0x + 64 hex)",
    );
  }
  const secret = resolveSessionEncryptionSecret();
  if (!secret || secret.length < 8) {
    missing.push(
      "SESSION_HISTORY_ENCRYPTION_SECRET (or SWARM_KV_ENCRYPTION_SECRET), min 8 chars",
    );
  }
  return missing;
}

function isConfigured() {
  return missingSwarmEnvFields().length === 0;
}

/**
 * @param {string} secret User-chosen passphrase (min 8 chars).
 * @returns {Buffer} 32-byte AES key
 */
export function deriveSessionHistoryKey(secret) {
  if (typeof secret !== "string" || secret.length < 8) {
    throw new Error(
      "SESSION_HISTORY_ENCRYPTION_SECRET must be a string with at least 8 characters",
    );
  }
  return scryptSync(secret, SCRYPT_SALT, 32, { N: 16384, r: 8, p: 1 });
}

/**
 * @param {string} utf8Plaintext
 * @param {Buffer} key32
 * @returns {Buffer} v1: [version:1][iv:12][ciphertext][tag:16]
 */
export function encryptSessionHistoryV1(utf8Plaintext, key32) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key32, iv);
  const enc = Buffer.concat([
    cipher.update(utf8Plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([ENC_VERSION]), iv, enc, tag]);
}

/**
 * @param {Buffer} buf
 * @param {Buffer} key32
 * @returns {string} utf8 plaintext
 */
export function decryptSessionHistoryV1(buf, key32) {
  if (buf.length < 1 + 12 + 16 + 1) {
    throw new Error("swarm-session: ciphertext too short");
  }
  if (buf[0] !== ENC_VERSION) {
    throw new Error(`swarm-session: unknown envelope version ${buf[0]}`);
  }
  const iv = buf.subarray(1, 13);
  const tag = buf.subarray(buf.length - 16);
  const enc = buf.subarray(13, buf.length - 16);
  const decipher = createDecipheriv(ALGO, key32, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    "utf8",
  );
}

/** Serialize concurrent Swarm writes (same index feed). */
let syncChain = Promise.resolve();

/**
 * @param {unknown[]} sessionLogs Parsed session_history array (same shape as local file).
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string }>}
 */
export async function syncEncryptedSessionHistoryToSwarm(sessionLogs) {
  if (!isConfigured()) {
    const missing = missingSwarmEnvFields();
    return {
      ok: false,
      skipped: true,
      reason: `Swarm backup disabled — set: ${missing.join(", ")}`,
    };
  }

  const run = syncChain.then(async () => {
    const secret = resolveSessionEncryptionSecret();
    const key = deriveSessionHistoryKey(secret);
    const plain = JSON.stringify(sessionLogs);
    const ciphertext = encryptSessionHistoryV1(plain, key);

    const SwarmKV = await loadSwarmKV();
    const kv = new SwarmKV({
      beeUrl: resolveSwarmBeeUrl(),
      batchId: resolveSwarmBatchId(),
      privateKey: resolveSwarmPrivateKey(),
      namespace: SWARM_NAMESPACE,
    });

    await kv.put(SWARM_KEY, new Uint8Array(ciphertext));
    return { ok: true };
  });

  syncChain = run.catch(() => {});
  return run;
}

export { SWARM_KEY as SESSION_HISTORY_SWARM_KEY, SWARM_NAMESPACE };

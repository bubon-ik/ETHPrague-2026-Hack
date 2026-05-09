#!/usr/bin/env node
/**
 * Read encrypted session_history from Swarm (swarm-kv) and decrypt with
 * SESSION_HISTORY_ENCRYPTION_SECRET (same as the History Agent).
 *
 *   node agents/scripts/fetch-decrypt-session-history.mjs
 *
 * Run from repo root. Requires agents/.env (+ optional examples/.env fill)
 * and built swarm_tests/swarm-kv/dist.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

import {
  deriveSessionHistoryKey,
  decryptSessionHistoryV1,
  resolveSwarmBeeUrl,
  resolveSwarmBatchId,
  resolveSwarmPrivateKey,
  resolveSessionEncryptionSecret,
} from "../src/agents/sessionHistorySwarm.js";

const AGENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.join(AGENTS_DIR, "..");

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function loadEnvFillMissing(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const k = m[1];
    const v = m[2].replace(/^["']|["']$/g, "");
    const cur = process.env[k];
    if (cur !== undefined && String(cur).trim() !== "") continue;
    process.env[k] = v;
  }
}

loadEnv(path.join(AGENTS_DIR, ".env"));
loadEnvFillMissing(
  path.join(REPO_ROOT, "swarm_tests", "swarm-kv", "examples", ".env"),
);

const beeUrl = resolveSwarmBeeUrl();
const batchId = resolveSwarmBatchId();
const privateKey = resolveSwarmPrivateKey();
const encSecret = resolveSessionEncryptionSecret();

if (!beeUrl || !batchId || !privateKey || !encSecret || encSecret.length < 8) {
  console.error(
    "Missing env: need Bee URL, batch id, feed private key, and SESSION_HISTORY_ENCRYPTION_SECRET (≥8 chars).",
  );
  process.exit(1);
}

const swarmKvEntry = path.join(
  REPO_ROOT,
  "swarm_tests",
  "swarm-kv",
  "dist",
  "index.js",
);
const { SwarmKV } = await import(pathToFileURL(swarmKvEntry).href);

const kv = new SwarmKV({
  beeUrl,
  batchId,
  privateKey,
  namespace: "wallet-agent-session",
});

const raw = await kv.get("session_history");
if (raw === undefined) {
  console.log("No value for key session_history (missing index entry or data).");
  process.exit(2);
}

if (!(raw instanceof Uint8Array)) {
  console.log("Unexpected decoded type (expected binary ciphertext):", typeof raw);
  console.log(raw);
  process.exit(3);
}

const key = deriveSessionHistoryKey(encSecret);
const plain = decryptSessionHistoryV1(Buffer.from(raw), key);
const data = JSON.parse(plain);
console.log(JSON.stringify(data, null, 2));

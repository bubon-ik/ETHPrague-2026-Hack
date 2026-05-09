#!/usr/bin/env node
/**
 * Prints OWNER, TOPIC, and a curl command to read the encrypted session_history
 * feed from Bee. Run from repo root: node agents/scripts/print-swarm-session-feed-curl.mjs
 * (resolves bee-js from agents/node_modules).
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { PrivateKey, Topic } from "@ethersphere/bee-js";

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

const bee =
  process.env.SWARM_KV_BEE_URL?.trim() ||
  process.env.BEE_URL?.trim() ||
  "http://127.0.0.1:1633";
const raw = (
  process.env.SWARM_KV_PRIVATE_KEY ||
  process.env.PRIVATE_KEY ||
  ""
).trim();
if (!raw) {
  console.error("Missing SWARM_KV_PRIVATE_KEY or PRIVATE_KEY in agents/.env (or examples/.env).");
  process.exit(1);
}

const pk = new PrivateKey(raw.startsWith("0x") ? raw : `0x${raw}`);
const owner = pk.publicKey().address().toString();
const ns = "wallet-agent-session";
const key = "session_history";
const h = createHash("sha256").update(`${ns}\0${key}`, "utf8").digest("hex");
const topic = Topic.fromString(`kv:key:${h}`).toHex();
const base = bee.replace(/\/$/, "");

console.log("BEE=" + base);
console.log("OWNER=" + owner);
console.log("TOPIC=" + topic);
console.log("");
console.log("# Copy-paste (hex only — no placeholder words):");
console.log(`curl -sS "${base}/feeds/${owner}/${topic}" | head -c 600 && echo`);

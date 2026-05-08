/**
 * Run from package root after `npm run build`:
 *   node examples/basic.mjs
 *
 * Env: BEE_URL, BATCH_ID, PRIVATE_KEY (see .env.example)
 */
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createHash, randomBytes } from "crypto";
import { SwarmKV, POSTAGE_OPERATIONS, guessStoredKind } from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, ".env") });

const beeUrl = process.env.BEE_URL;
const batchId = process.env.BATCH_ID;
let privateKey = process.env.PRIVATE_KEY;

if (!beeUrl || !batchId) {
  console.error("Set BEE_URL and BATCH_ID in examples/.env");
  process.exit(1);
}

if (!privateKey || privateKey.length < 66) {
  privateKey = "0x" + randomBytes(32).toString("hex");
  console.warn(
    "No PRIVATE_KEY in .env — generated a one-off key (this store will not be reopenable with another key):",
    privateKey
  );
}

const kv = new SwarmKV({
  beeUrl,
  batchId,
  privateKey,
  namespace: `basic-demo-${createHash("sha256").update(privateKey).digest("hex").slice(0, 8)}`,
  onStampUse: ({ operation, byteLength }) => {
    console.log(`[postage] ${operation} upload ~${byteLength} bytes`);
  },
});

console.log("Publisher address (owner):", kv.owner.toHex());
console.log("\nPostage model:\n", POSTAGE_OPERATIONS.join("\n  • "), "\n");

// String
await kv.put("greeting", "hello from swarm-kv");
// JSON
await kv.put("config", { theme: "dark", version: 1 });
// Binary
const bytes = new TextEncoder().encode("raw-bytes-ok");
await kv.put("blob", bytes);

const g = await kv.get("greeting");
console.log("greeting:", g, `(stored kind was: ${guessStoredKind(g)})`);
console.log("config:", JSON.stringify(await kv.get("config")));
const back = await kv.get("blob");
console.log("blob:", back instanceof Uint8Array, new TextDecoder().decode(back));

const keys = await kv.keys();
console.log("keys():", keys);

let n = 0;
for await (const [k, v] of kv.entries()) {
  n++;
  console.log(`entries[${n}]:`, k, "=>", v);
}

await kv.delete("greeting");
console.log('after delete("greeting"), has:', await kv.has("greeting"), "get:", await kv.get("greeting"));

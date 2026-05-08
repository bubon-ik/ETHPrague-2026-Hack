/**
 * Example: store chat turns as JSON under a single key (append by read-modify-write)
 * or use one key per thread. This script uses one key: "main-thread".
 *
 * Run: node examples/chat-history.mjs
 */
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { randomBytes } from "crypto";
import { SwarmKV } from "../dist/index.js";

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
  console.warn("Generated PRIVATE_KEY:", privateKey);
}

const kv = new SwarmKV({
  beeUrl,
  batchId,
  privateKey,
  namespace: "wallet-agent-chat",
});

const threadKey = "thread:default";

const existing = await kv.get(threadKey);
let history = [];
if (Array.isArray(existing)) history = existing;
else if (existing !== undefined) {
  console.warn("Existing value was not an array — starting a new history.");
}

history.push({
  role: "user",
  text: "Ping swarm-kv",
  ts: new Date().toISOString(),
});
history.push({
  role: "assistant",
  text: "Pong — stored on Swarm feeds + JSON index.",
  ts: new Date().toISOString(),
});

await kv.put(threadKey, history);

console.log("Stored messages:", await kv.get(threadKey));
console.log("All keys in namespace:", await kv.keys());

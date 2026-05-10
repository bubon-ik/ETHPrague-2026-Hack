# swarm-kv

Developer-friendly **key-value storage on Ethereum Swarm**: `put(key, value)` / `get(key)` backed by content-addressed blobs, **feeds** (one mutable pointer per key), and a **listable index** for key names — without wiring Bee primitives yourself.

**Note on “manifests” (bounty wording):** Swarm’s ecosystem often describes a **manifest** as a structure that lists or routes to content. Here the **index** is a small **JSON document** (`{ "v": 1, "keys": [...] }`) stored as a chunk and pointed to by a **dedicated index feed** per namespace — same *role* as a manifest-style index (discoverable key list), implemented as JSON-on-Swarm rather than a separate high-level manifest MIME workflow.

## For judges (what to run)

1. **`cd swarm_tests/swarm-kv && npm install && npm run build && npm test`** — proves TypeScript builds and codec/topic unit tests pass (no Bee required).
2. **Examples (need Bee + postage batch):** `cd examples && npm install`, copy **`examples/.env.example`** → **`.env`**, set `BEE_URL`, `BATCH_ID`, `PRIVATE_KEY`, then **`node basic.mjs`** (types + list + iterate + delete) and optionally **`node chat-history.mjs`** (JSON document pattern).
3. **App integration** (this monorepo): see **“Used in this repository”** below — encrypted session backup uses **`SwarmKV`** with one key; that is *in addition* to the generic multi-key demo in `basic.mjs`.

## Judging criteria (how this submission maps)

| Criterion | How swarm-kv addresses it |
|-----------|---------------------------|
| **Developer experience** | README quickstart below; `examples/basic.mjs` runs in minutes if Bee + postage batch exist. |
| **API design** | Single `SwarmKV` class, small config surface, methods documented in README and JSDoc. |
| **Completeness** | `get`, `put`, `delete`, `has`, `keys`, `entries` — not only get/put. |
| **Edge cases** | Missing key → `get` returns `undefined`. Large values → `maxEncodedValueBytes` (default 4 MiB) rejects oversize `put` with a clear error. **Concurrent writes:** optional `serializeMutations` (default **on**) serializes `put`/`delete` in-process; multi-device races remain last-writer-wins on the protocol. |
| **Examples** | `examples/basic.mjs`, `examples/chat-history.mjs` — runnable after `npm run build`. |

## Requirements

- **Node.js 18+**
- A running [**Bee**](https://docs.ethswarm.org/docs/installation/bee) (`BEE_URL`, e.g. `http://127.0.0.1:1633`)
- A funded **postage batch** (from `swarm-cli stamp create` or equivalent)

## Install & build

```bash
cd swarm_tests/swarm-kv
npm install
npm run build
```

The package entry is `dist/index.js`.

## Automated tests

```bash
npm test
```

Runs `tsc` then Node’s test runner on `test/*.test.mjs` (no Bee required).

## Quickstart (≈5 minutes)

1. Copy `examples/.env.example` to `examples/.env` and set **`BEE_URL`**, **`BATCH_ID`**, **`PRIVATE_KEY`** (`0x` + 64 hex). Reuse the same key to read the same logical store later.

2. Install example deps and run the tour:

```bash
cd examples
npm install
node basic.mjs
```

You should see string, JSON, and binary round-trips, `keys()`, `entries()`, and `delete()`.

### Chat-style JSON

```bash
node chat-history.mjs
```

## API

### `new SwarmKV(config)`

| Field | Description |
|--------|-------------|
| `beeUrl` | Bee API base URL |
| `batchId` | Postage batch id for **all** uploads |
| `privateKey` | `PrivateKey` or `0x…` hex — signs feed updates (**secret**) |
| `namespace?` | Isolates keys per app (default `"default"`) |
| `feedSettleMs?` | Wait after writes before reads (default `400`) |
| `onStampUse?` | Callback `{ operation: 'value' \| 'index', byteLength }` |
| `maxEncodedValueBytes?` | Max UTF-8 size of encoded envelope (default **4 MiB**) |
| `serializeMutations?` | Serialize `put`/`delete` in this process (default **`true`**) |

### Methods

- **`put(key, value)`** — Strings, JSON-serializable values, or **`Uint8Array`**. Throws if encoded size exceeds `maxEncodedValueBytes`.
- **`get(key)`** — Decoded value or **`undefined`** if key not in index.
- **`delete(key)`** — Removes key from logical index (`false` if absent).
- **`has`**, **`keys`**, **`entries()`**

### Optional exports

- **`encodeValue` / `decodeValue`** — Wire format.
- **`topicForKvKey` / `topicForIndex`** — Topic derivation for advanced tooling.
- **`DEFAULT_MAX_ENCODED_VALUE_BYTES`**, **`POSTAGE_OPERATIONS`**

## Value encoding & size limits

Values are JSON **envelopes** (`kv`, `t`, payload). Binary is **base64** inside JSON — fine for typical KV sizes. **Very large** blobs should use raw Swarm uploads or chunking outside this library. The **`maxEncodedValueBytes`** guard prevents accidental huge `put`s.

## Postage

You supply **one** `batchId`; the library passes it to every `uploadData` / feed update. See **`POSTAGE_OPERATIONS`** and optional **`onStampUse`** for visibility.

## Architecture

1. **Per-key feed** — topic from `sha256(namespace + "\0" + key)`; each key’s value is the latest chunk reference published on that feed.
2. **Index feed** — one topic per namespace → latest JSON index `{ "v": 1, "keys": [...] }` (sorted key list for **`keys()`** and membership checks).
3. **`get`** checks index membership, then resolves the key feed and decodes the value envelope.

## Used in this repository (wallet + agent app)

This hack wires **swarm-kv** into the desktop wallet’s agent flow so chat/session history is backed up on Swarm. It is **not** part of the generic library API — it is application code that **encrypts first**, then stores **opaque binary** with `put`.

| Piece | Role |
|--------|------|
| [`wallet/server.ts`](../../wallet/server.ts) | Loads `agents/.env`, then fills missing `BEE_URL` / `BATCH_ID` / `PRIVATE_KEY` from `examples/.env` here (only keys still empty). Serves `POST /api/agent/chat`. |
| [`agents/src/agents/historyAgent.js`](../../agents/src/agents/historyAgent.js) | After each completed agent turn, appends to `agents/logs/session_history.json`, then triggers Swarm sync. |
| [`agents/src/agents/sessionHistorySwarm.js`](../../agents/src/agents/sessionHistorySwarm.js) | Builds `SwarmKV` from this package’s **`dist/index.js`**. Namespace: **`wallet-agent-session`**. Key: **`session_history`**. Value: **AES-256-GCM** ciphertext of `JSON.stringify` of the **entire** session array (not plaintext JSON on Swarm). Env resolution supports `SWARM_KV_*` aliases and `SESSION_HISTORY_ENCRYPTION_SECRET`. |
| [`agents/scripts/fetch-decrypt-session-history.mjs`](../../agents/scripts/fetch-decrypt-session-history.mjs) | Read `session_history` back through `SwarmKV.get` and decrypt with the same secret (sanity check / backup restore tooling). |
| [`agents/scripts/print-swarm-session-feed-curl.mjs`](../../agents/scripts/print-swarm-session-feed-curl.mjs) | Prints Bee **`GET /feeds/{owner}/{topic}`** for that key (opaque envelope over the wire). |

**Flow:** UI → wallet `supervisor` → `archiveSession` → local JSON file → **`syncEncryptedSessionHistoryToSwarm`** → encrypt → **`kv.put('session_history', Uint8Array)`** (full snapshot each time).

## License

MIT

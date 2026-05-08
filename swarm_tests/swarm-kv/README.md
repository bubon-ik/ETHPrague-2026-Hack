# swarm-kv

Developer-friendly **key-value storage on Ethereum Swarm**. You get a familiar `put(key, value)` / `get(key)` surface backed by content-addressed blobs, **feeds** (one mutable pointer per key), and a **JSON index file** for listing keys — without wiring Bee primitives yourself.

## Requirements

- **Node.js 18+**
- A running [**Bee**](https://docs.ethswarm.org/docs/installation/bee) node (`BEE_URL`, default `http://localhost:1633`)
- A funded **postage batch** (stamp batch id from `swarm-cli stamp create` or equivalent)

## Install & build

```bash
cd swarm-kv
npm install
npm run build
```

The compiled package lives in `dist/`. Examples load `../dist/index.js`, so **build before running examples**.

## Automated tests

Unit tests (codec + topic derivation, **no Bee node**) run with:

```bash
npm test
```

This runs `npm run build` then Node’s built-in test runner on `test/*.test.mjs`.

## Quickstart

1. Copy `examples/.env.example` to `examples/.env` and set `BEE_URL`, `BATCH_ID`, and a persistent **`PRIVATE_KEY`** (`0x` + 64 hex chars). This key owns the feeds; **reuse it** to read the same logical database later.

2. Run the demo:

```bash
cd examples
npm install
node basic.mjs
```

You should see string, JSON, and binary round-trips, `keys()`, `entries()`, and `delete()`.

### Chat-style JSON (wallet / agent)

```bash
node chat-history.mjs
```

This appends messages to a JSON array stored under one key — a pattern you can split into one key per conversation.

## API

### `new SwarmKV(config)`

| Field | Description |
|--------|-------------|
| `beeUrl` | Bee API base URL |
| `batchId` | Postage batch id used for **all** uploads (transparent forwarding to Bee) |
| `privateKey` | `PrivateKey` or `0x…` hex — signs feed updates (**keep secret**) |
| `namespace?` | Isolates topics per app / tenant (default `"default"`) |
| `feedSettleMs?` | Wait after writes before reads (default `400`) |
| `onStampUse?` | Optional callback `{ operation: 'value' \| 'index', byteLength }` for debugging |

### Methods

- **`put(key, value)`** — Stores strings, JSON-serializable values (objects, arrays, numbers, `null`, booleans), or **`Uint8Array`** binary.
- **`get(key)`** — Returns decoded value or **`undefined`** if the key is not in the index / unreadable.
- **`delete(key)`** — Removes the key from the **logical** index (does not erase historical feed updates on-chain).
- **`has(key)`**, **`keys()`**, **`entries()`** — Listing and iteration use the JSON index.

### Low-level helpers (optional)

- **`encodeValue` / `decodeValue`** — Wire format for stored blobs.
- **`topicForKvKey` / `topicForIndex`** — Topic derivation for advanced Bee tooling.

## Value encoding

All values are stored as JSON **envelopes** (`kv`, `t`, payload). Binary is embedded as **base64** inside JSON — suitable for typical KV sizes; very large blobs should use application-level chunking or raw Swarm uploads outside this library.

## Postage (transparent usage)

You supply **one** `batchId`. Every operation that touches Swarm passes it through to `bee.uploadData` / feed updates — no manual stamp threading per call.

Rough accounting:

- **`put`**: upload encoded value + feed update for that key + upload new index JSON + feed update for the index.
- **`delete`**: upload new index JSON + index feed update only.

See exported constant **`POSTAGE_OPERATIONS`** for the canonical checklist.

Use **`onStampUse`** to trace sizes during development.

## Architecture

1. **Per-key feed** — `Topic` derived from `sha256(namespace + key)` so arbitrary key strings are safe.
2. **Index feed** — One topic per namespace points at the latest JSON document `{ "v": 1, "keys": [...] }`.
3. **Reads** — `get` checks membership in the index first, then resolves the key’s feed to the value blob.

```text
put("foo", value)
  → upload(bytes) → ref
  → FeedWriter(keyTopic).upload(batchId, ref)
  → upload(index.json with "foo" in keys)
  → FeedWriter(indexTopic).upload(batchId, indexRef)
```

## Limitations

- **Concurrent writes** to the same store can race on the index (last writer wins). Serialize writes if you need strict consistency.
- **Binary size**: base64 in JSON grows payload size (~4/3); huge files need a different strategy.
- **Deletion** removes visibility via the index; old feed updates may still exist on the network.

## License

MIT

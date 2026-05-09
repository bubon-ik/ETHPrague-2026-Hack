import { Bee, PrivateKey, } from "@ethersphere/bee-js";
import { decodeValue, encodeValue, } from "./codec.js";
import { addKey, readIndexFromFeed, removeKey, } from "./index-store.js";
import { topicForIndex, topicForKvKey } from "./topics.js";
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export class SwarmKV {
    bee;
    batchId;
    privateKey;
    owner;
    namespace;
    indexTopic;
    settleMs;
    onStampUse;
    constructor(config) {
        this.bee = new Bee(config.beeUrl);
        this.batchId = config.batchId;
        this.privateKey =
            typeof config.privateKey === "string"
                ? new PrivateKey(config.privateKey)
                : config.privateKey;
        this.owner = this.privateKey.publicKey().address();
        this.namespace = config.namespace ?? "default";
        this.indexTopic = topicForIndex(this.namespace);
        this.settleMs = config.feedSettleMs ?? 400;
        this.onStampUse = config.onStampUse;
    }
    trace(op, byteLength) {
        this.onStampUse?.({ operation: op, byteLength });
    }
    async settle() {
        await sleep(this.settleMs);
    }
    async getIndex() {
        return readIndexFromFeed(this.bee, this.indexTopic, this.owner);
    }
    async saveIndex(index) {
        const payload = JSON.stringify(index);
        const bytes = new TextEncoder().encode(payload);
        this.trace("index", bytes.byteLength);
        const { reference } = await this.bee.uploadData(this.batchId, bytes);
        const writer = this.bee.makeFeedWriter(this.indexTopic, this.privateKey);
        await writer.upload(this.batchId, reference);
    }
    /**
     * Store a value. Strings, plain JSON-serializable values, and binary (`Uint8Array`) are supported.
     */
    async put(key, value) {
        const topic = topicForKvKey(this.namespace, key);
        const writer = this.bee.makeFeedWriter(topic, this.privateKey);
        const bytes = encodeValue(value);
        this.trace("value", bytes.byteLength);
        const { reference } = await this.bee.uploadData(this.batchId, bytes);
        await writer.upload(this.batchId, reference);
        const index = await this.getIndex();
        const next = { v: 1, keys: addKey(index.keys, key) };
        await this.saveIndex(next);
        await this.settle();
    }
    /**
     * Read a value. Returns `undefined` if the key is not in the index or data is missing.
     */
    async get(key) {
        const index = await this.getIndex();
        if (!index.keys.includes(key))
            return undefined;
        const topic = topicForKvKey(this.namespace, key);
        const reader = this.bee.makeFeedReader(topic, this.owner);
        let lastErr;
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                const { reference } = await reader.downloadReference();
                const file = await this.bee.downloadData(reference);
                return decodeValue(file.toUint8Array());
            }
            catch (e) {
                lastErr = e;
                await sleep(150 * (attempt + 1));
            }
        }
        throw lastErr instanceof Error
            ? lastErr
            : new Error("swarm-kv: failed to read value");
    }
    /**
     * Remove a key from the logical store (index). Does not erase old feed history on-chain.
     */
    async delete(key) {
        const index = await this.getIndex();
        if (!index.keys.includes(key))
            return false;
        const next = { v: 1, keys: removeKey(index.keys, key) };
        await this.saveIndex(next);
        await this.settle();
        return true;
    }
    /** Whether the key appears in the index. */
    async has(key) {
        const index = await this.getIndex();
        return index.keys.includes(key);
    }
    /** List keys (from the index manifest). */
    async keys() {
        const index = await this.getIndex();
        return [...index.keys];
    }
    /** Iterate key-value pairs (loads values sequentially). */
    async *entries() {
        const ks = await this.keys();
        for (const k of ks) {
            const v = await this.get(k);
            if (v !== undefined)
                yield [k, v];
        }
    }
}

import {
  Bee,
  PrivateKey,
  type BatchId,
  type EthAddress,
  type Topic,
} from "@ethersphere/bee-js";
import {
  decodeValue,
  encodeValue,
  DEFAULT_MAX_ENCODED_VALUE_BYTES,
  type DecodedValue,
} from "./codec.js";
import {
  addKey,
  readIndexFromFeed,
  removeKey,
  type IndexFileV1,
} from "./index-store.js";
import { topicForIndex, topicForKvKey } from "./topics.js";

export interface SwarmKVConfig {
  beeUrl: string;
  /**
   * Postage batch id (stamp batch). Every `put` / index update uses this batch.
   * Obtain via `swarm-cli stamp create` or your Bee tooling.
   */
  batchId: string | BatchId;
  /** Hex private key (`0x` + 64 hex) used to sign feed updates (must stay secret). */
  privateKey: string | PrivateKey;
  /**
   * Logical namespace: isolates keys and index per application / tenant.
   * @default "default"
   */
  namespace?: string;
  /**
   * Extra delay (ms) after feed writes before dependent reads (Bee indexing).
   * @default 400
   */
  feedSettleMs?: number;
  /**
   * Optional trace for debugging postage-related uploads.
   */
  onStampUse?: (info: {
    operation: "value" | "index";
    byteLength: number;
  }) => void;
  /**
   * Reject `put` when the encoded envelope exceeds this many bytes (JSON UTF-8).
   * Prevents accidentally uploading huge blobs through the JSON+binary envelope.
   * @default {@link DEFAULT_MAX_ENCODED_VALUE_BYTES}
   */
  maxEncodedValueBytes?: number;
  /**
   * When true, `put` and `delete` run one at a time in this process so concurrent
   * callers do not corrupt the shared index feed (last-writer-wins on Swarm still applies across devices).
   * @default true
   */
  serializeMutations?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Serialize async mutations; errors do not break the queue. */
function createMutationQueue(): {
  run<T>(fn: () => Promise<T>): Promise<T>;
} {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      const job = tail.then(() => fn());
      tail = job.catch(() => {});
      return job;
    },
  };
}

export class SwarmKV {
  readonly bee: Bee;
  readonly batchId: string | BatchId;
  readonly privateKey: PrivateKey;
  readonly owner: EthAddress;
  readonly namespace: string;
  private readonly indexTopic: Topic;
  private readonly settleMs: number;
  private readonly onStampUse?: SwarmKVConfig["onStampUse"];
  private readonly maxEncodedBytes: number;
  private readonly mutationQueue: ReturnType<typeof createMutationQueue>;

  constructor(config: SwarmKVConfig) {
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
    this.maxEncodedBytes =
      config.maxEncodedValueBytes ?? DEFAULT_MAX_ENCODED_VALUE_BYTES;
    const ser = config.serializeMutations;
    this.mutationQueue =
      ser === false ? { run: <T>(fn: () => Promise<T>) => fn() } : createMutationQueue();
  }

  private trace(op: "value" | "index", byteLength: number): void {
    this.onStampUse?.({ operation: op, byteLength });
  }

  private async settle(): Promise<void> {
    await sleep(this.settleMs);
  }

  private async getIndex(): Promise<IndexFileV1> {
    return readIndexFromFeed(this.bee, this.indexTopic, this.owner);
  }

  private async saveIndex(index: IndexFileV1): Promise<void> {
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
  async put(key: string, value: unknown): Promise<void> {
    return this.mutationQueue.run(async () => {
      const bytes = encodeValue(value);
      if (bytes.byteLength > this.maxEncodedBytes) {
        throw new Error(
          `swarm-kv: encoded value is ${bytes.byteLength} bytes (max ${this.maxEncodedBytes}). ` +
            "Use a smaller value, raise maxEncodedValueBytes, or store large blobs outside this KV format.",
        );
      }

      const topic = topicForKvKey(this.namespace, key);
      const writer = this.bee.makeFeedWriter(topic, this.privateKey);
      this.trace("value", bytes.byteLength);
      const { reference } = await this.bee.uploadData(this.batchId, bytes);
      await writer.upload(this.batchId, reference);

      const index = await this.getIndex();
      const next = { v: 1 as const, keys: addKey(index.keys, key) };
      await this.saveIndex(next);
      await this.settle();
    });
  }

  /**
   * Read a value. Returns `undefined` if the key is not in the index or data is missing.
   */
  async get(key: string): Promise<DecodedValue | undefined> {
    const index = await this.getIndex();
    if (!index.keys.includes(key)) return undefined;

    const topic = topicForKvKey(this.namespace, key);
    const reader = this.bee.makeFeedReader(topic, this.owner);
    let lastErr: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { reference } = await reader.downloadReference();
        const file = await this.bee.downloadData(reference);
        return decodeValue(file.toUint8Array());
      } catch (e) {
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
  async delete(key: string): Promise<boolean> {
    return this.mutationQueue.run(async () => {
      const index = await this.getIndex();
      if (!index.keys.includes(key)) return false;
      const next = { v: 1 as const, keys: removeKey(index.keys, key) };
      await this.saveIndex(next);
      await this.settle();
      return true;
    });
  }

  /** Whether the key appears in the index. */
  async has(key: string): Promise<boolean> {
    const index = await this.getIndex();
    return index.keys.includes(key);
  }

  /** List keys (from the index manifest). */
  async keys(): Promise<string[]> {
    const index = await this.getIndex();
    return [...index.keys];
  }

  /** Iterate key-value pairs (loads values sequentially). */
  async *entries(): AsyncGenerator<[string, DecodedValue]> {
    const ks = await this.keys();
    for (const k of ks) {
      const v = await this.get(k);
      if (v !== undefined) yield [k, v];
    }
  }
}

import { Bee, PrivateKey, type BatchId, type EthAddress } from "@ethersphere/bee-js";
import { type DecodedValue } from "./codec.js";
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
}
export declare class SwarmKV {
    readonly bee: Bee;
    readonly batchId: string | BatchId;
    readonly privateKey: PrivateKey;
    readonly owner: EthAddress;
    readonly namespace: string;
    private readonly indexTopic;
    private readonly settleMs;
    private readonly onStampUse?;
    constructor(config: SwarmKVConfig);
    private trace;
    private settle;
    private getIndex;
    private saveIndex;
    /**
     * Store a value. Strings, plain JSON-serializable values, and binary (`Uint8Array`) are supported.
     */
    put(key: string, value: unknown): Promise<void>;
    /**
     * Read a value. Returns `undefined` if the key is not in the index or data is missing.
     */
    get(key: string): Promise<DecodedValue | undefined>;
    /**
     * Remove a key from the logical store (index). Does not erase old feed history on-chain.
     */
    delete(key: string): Promise<boolean>;
    /** Whether the key appears in the index. */
    has(key: string): Promise<boolean>;
    /** List keys (from the index manifest). */
    keys(): Promise<string[]>;
    /** Iterate key-value pairs (loads values sequentially). */
    entries(): AsyncGenerator<[string, DecodedValue]>;
}
//# sourceMappingURL=store.d.ts.map
/**
 * On-wire format for values. Single JSON document per upload for unified decoding.
 * Binary uses base64 inside JSON (fine for typical KV sizes; document limits in README).
 */
export type StoredKind = "text" | "json" | "binary";
export type StoredEnvelope = {
    kv: 1;
    t: "text";
    v: string;
} | {
    kv: 1;
    t: "json";
    v: unknown;
} | {
    kv: 1;
    t: "binary";
    b64: string;
};
export type DecodedValue = string | unknown | Uint8Array;
export declare function encodeValue(value: unknown): Uint8Array;
export declare function decodeValue(bytes: Uint8Array): DecodedValue;
export declare function guessStoredKind(value: unknown): StoredKind;
//# sourceMappingURL=codec.d.ts.map
/**
 * What consumes postage (immutable uploads + feed updates) for this library.
 * Pass one valid **batch id** into {@link SwarmKVConfig.batchId}; the library
 * forwards it to every `bee.uploadData` used for values and index snapshots.
 */
export declare const POSTAGE_OPERATIONS: readonly ["Each put(key): one upload for the encoded value + one feed update for the key feed.", "Each put also refreshes the index: one upload for the JSON index blob + one feed update on the index feed.", "Each delete(key): one index upload + one index feed update (value feeds are not rewritten)."];
//# sourceMappingURL=postage.d.ts.map
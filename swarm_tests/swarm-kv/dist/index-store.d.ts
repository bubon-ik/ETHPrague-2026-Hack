import type { Bee } from "@ethersphere/bee-js";
import type { EthAddress, Reference, Topic } from "@ethersphere/bee-js";
export type IndexFileV1 = {
    v: 1;
    keys: string[];
};
export declare function emptyIndex(): IndexFileV1;
export declare function addKey(keys: string[], key: string): string[];
export declare function removeKey(keys: string[], key: string): string[];
export declare function loadIndexJson(bee: Bee, indexRef: Reference): Promise<IndexFileV1>;
/** Try read latest index from feed; return empty if feed does not exist yet. */
export declare function readIndexFromFeed(bee: Bee, topic: Topic, owner: EthAddress): Promise<IndexFileV1>;
//# sourceMappingURL=index-store.d.ts.map
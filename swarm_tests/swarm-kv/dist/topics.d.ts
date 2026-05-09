import { Topic } from "@ethersphere/bee-js";
/** Topics are 32-byte identifiers; long keys are hashed for stability and safety. */
export declare function topicForKvKey(namespace: string, key: string): Topic;
/** Single feed per namespace that stores the mutable pointer to the JSON index blob. */
export declare function topicForIndex(namespace: string): Topic;
//# sourceMappingURL=topics.d.ts.map
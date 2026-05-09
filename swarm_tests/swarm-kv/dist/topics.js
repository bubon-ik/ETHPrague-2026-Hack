import { createHash } from "crypto";
import { Topic } from "@ethersphere/bee-js";
/** Topics are 32-byte identifiers; long keys are hashed for stability and safety. */
export function topicForKvKey(namespace, key) {
    const composite = `${namespace}\u0000${key}`;
    const hash = createHash("sha256").update(composite, "utf8").digest("hex");
    return Topic.fromString(`kv:key:${hash}`);
}
/** Single feed per namespace that stores the mutable pointer to the JSON index blob. */
export function topicForIndex(namespace) {
    const hash = createHash("sha256")
        .update(`index\u0000${namespace}`, "utf8")
        .digest("hex");
    return Topic.fromString(`kv:idx:${hash}`);
}

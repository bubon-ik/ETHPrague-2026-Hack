export function emptyIndex() {
    return { v: 1, keys: [] };
}
export function addKey(keys, key) {
    const set = new Set(keys);
    set.add(key);
    return Array.from(set).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
export function removeKey(keys, key) {
    return keys.filter((k) => k !== key);
}
export async function loadIndexJson(bee, indexRef) {
    const bytes = await bee.downloadData(indexRef);
    const raw = bytes.toUint8Array();
    const text = new TextDecoder().decode(raw);
    const parsed = JSON.parse(text);
    if (parsed.v !== 1 || !Array.isArray(parsed.keys)) {
        throw new Error("swarm-kv: invalid index file");
    }
    return parsed;
}
/** Try read latest index from feed; return empty if feed does not exist yet. */
export async function readIndexFromFeed(bee, topic, owner) {
    const reader = bee.makeFeedReader(topic, owner);
    try {
        const { reference } = await reader.downloadReference();
        return await loadIndexJson(bee, reference);
    }
    catch {
        return emptyIndex();
    }
}

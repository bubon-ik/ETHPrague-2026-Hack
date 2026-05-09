import type { Bee } from "@ethersphere/bee-js";
import type { EthAddress, Reference, Topic } from "@ethersphere/bee-js";

export type IndexFileV1 = { v: 1; keys: string[] };

export function emptyIndex(): IndexFileV1 {
  return { v: 1, keys: [] };
}

export function addKey(keys: string[], key: string): string[] {
  const set = new Set(keys);
  set.add(key);
  return Array.from(set).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function removeKey(keys: string[], key: string): string[] {
  return keys.filter((k) => k !== key);
}

export async function loadIndexJson(
  bee: Bee,
  indexRef: Reference,
): Promise<IndexFileV1> {
  const bytes = await bee.downloadData(indexRef);
  const raw = bytes.toUint8Array();
  const text = new TextDecoder().decode(raw);
  const parsed = JSON.parse(text) as unknown;
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as { v?: unknown }).v === 1 &&
    Array.isArray((parsed as { keys?: unknown }).keys)
  ) {
    return parsed as IndexFileV1;
  }
  throw new Error("swarm-kv: invalid index file");
}

/** Try read latest index from feed; return empty if feed does not exist yet. */
export async function readIndexFromFeed(
  bee: Bee,
  topic: Topic,
  owner: EthAddress,
): Promise<IndexFileV1> {
  const reader = bee.makeFeedReader(topic, owner);
  try {
    const { reference } = await reader.downloadReference();
    return await loadIndexJson(bee, reference);
  } catch {
    return emptyIndex();
  }
}

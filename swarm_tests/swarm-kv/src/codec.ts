/**
 * On-wire format for values. Single JSON document per upload for unified decoding.
 * Binary uses base64 inside JSON (fine for typical KV sizes; see README for limits).
 */

export type StoredKind = "text" | "json" | "binary";

export type StoredEnvelope =
  | { kv: 1; t: "text"; v: string }
  | { kv: 1; t: "json"; v: unknown }
  | { kv: 1; t: "binary"; b64: string };

export type DecodedValue = string | unknown | Uint8Array;

/** Default cap for encoded payload size (envelope JSON bytes). */
export const DEFAULT_MAX_ENCODED_VALUE_BYTES = 4 * 1024 * 1024;

export function encodeValue(value: unknown): Uint8Array {
  const enc = new TextEncoder();

  if (value instanceof Uint8Array) {
    let binary = value;
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
      binary = new Uint8Array(value);
    }
    const b64 = bufferToBase64(binary);
    const envelope: StoredEnvelope = { kv: 1, t: "binary", b64 };
    return enc.encode(JSON.stringify(envelope));
  }

  if (typeof value === "string") {
    const envelope: StoredEnvelope = { kv: 1, t: "text", v: value };
    return enc.encode(JSON.stringify(envelope));
  }

  const envelope: StoredEnvelope = { kv: 1, t: "json", v: value };
  return enc.encode(JSON.stringify(envelope));
}

export function decodeValue(bytes: Uint8Array): DecodedValue {
  const text = new TextDecoder().decode(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      "swarm-kv: stored blob is not valid JSON (expected envelope format)",
    );
  }

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as { kv?: unknown }).kv === 1 &&
    typeof (parsed as { t?: unknown }).t === "string"
  ) {
    const env = parsed as StoredEnvelope;
    if (env.t === "text") return env.v;
    if (env.t === "json") return env.v;
    if (env.t === "binary") return base64ToUint8Array(env.b64);
  }

  throw new Error("swarm-kv: unknown or invalid envelope format");
}

export function guessStoredKind(value: unknown): StoredKind {
  if (value instanceof Uint8Array) return "binary";
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return "binary";
  if (typeof value === "string") return "text";
  return "json";
}

function bufferToBase64(data: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(data).toString("base64");
  }
  let s = "";
  for (let i = 0; i < data.length; i++) s += String.fromCharCode(data[i]!);
  return btoa(s);
}

function base64ToUint8Array(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

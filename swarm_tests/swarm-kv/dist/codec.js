/**
 * On-wire format for values. Single JSON document per upload for unified decoding.
 * Binary uses base64 inside JSON (fine for typical KV sizes; document limits in README).
 */
export function encodeValue(value) {
    const enc = new TextEncoder();
    if (value instanceof Uint8Array) {
        let binary = value;
        if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
            binary = new Uint8Array(value);
        }
        const b64 = bufferToBase64(binary);
        const envelope = { kv: 1, t: "binary", b64 };
        return enc.encode(JSON.stringify(envelope));
    }
    if (typeof value === "string") {
        const envelope = { kv: 1, t: "text", v: value };
        return enc.encode(JSON.stringify(envelope));
    }
    const envelope = { kv: 1, t: "json", v: value };
    return enc.encode(JSON.stringify(envelope));
}
export function decodeValue(bytes) {
    const text = new TextDecoder().decode(bytes);
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        throw new Error("swarm-kv: stored blob is not valid JSON (expected envelope format)");
    }
    if (typeof parsed === "object" &&
        parsed !== null &&
        parsed.kv === 1 &&
        typeof parsed.t === "string") {
        const env = parsed;
        if (env.t === "text")
            return env.v;
        if (env.t === "json")
            return env.v;
        if (env.t === "binary")
            return base64ToUint8Array(env.b64);
    }
    throw new Error("swarm-kv: unknown or invalid envelope format");
}
export function guessStoredKind(value) {
    if (value instanceof Uint8Array)
        return "binary";
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(value))
        return "binary";
    if (typeof value === "string")
        return "text";
    return "json";
}
function bufferToBase64(data) {
    if (typeof Buffer !== "undefined") {
        return Buffer.from(data).toString("base64");
    }
    let s = "";
    for (let i = 0; i < data.length; i++)
        s += String.fromCharCode(data[i]);
    return btoa(s);
}
function base64ToUint8Array(b64) {
    if (typeof Buffer !== "undefined") {
        return new Uint8Array(Buffer.from(b64, "base64"));
    }
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        out[i] = bin.charCodeAt(i);
    return out;
}

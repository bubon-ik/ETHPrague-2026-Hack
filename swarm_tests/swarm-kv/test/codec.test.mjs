import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeValue,
  decodeValue,
  guessStoredKind,
  DEFAULT_MAX_ENCODED_VALUE_BYTES,
} from "../dist/index.js";

test("round-trip string", () => {
  const want = "hello";
  const back = decodeValue(encodeValue(want));
  assert.equal(back, want);
  assert.equal(guessStoredKind(want), "text");
});

test("round-trip json object", () => {
  const want = { a: 1, b: [2, 3] };
  const back = decodeValue(encodeValue(want));
  assert.deepEqual(back, want);
  assert.equal(guessStoredKind(want), "json");
});

test("round-trip binary", () => {
  const want = new Uint8Array([0, 255, 1, 2]);
  const back = decodeValue(encodeValue(want));
  assert.ok(back instanceof Uint8Array);
  assert.deepEqual(Array.from(back), Array.from(want));
  assert.equal(guessStoredKind(want), "binary");
});

test("invalid blob throws", () => {
  assert.throws(() => decodeValue(new Uint8Array([1, 2, 3])));
});

test("default max encoded size constant is positive", () => {
  assert.ok(DEFAULT_MAX_ENCODED_VALUE_BYTES > 0);
});

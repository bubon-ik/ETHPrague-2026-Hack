import test from "node:test";
import assert from "node:assert/strict";
import { topicForKvKey, topicForIndex } from "../dist/index.js";

test("same namespace+key yields same topic bytes", () => {
  const a = topicForKvKey("app", "my-key");
  const b = topicForKvKey("app", "my-key");
  assert.equal(a.toHex(), b.toHex());
});

test("different keys yield different topics", () => {
  const a = topicForKvKey("app", "a");
  const b = topicForKvKey("app", "b");
  assert.notEqual(a.toHex(), b.toHex());
});

test("index topic differs from kv topic", () => {
  const idx = topicForIndex("app");
  const kv = topicForKvKey("app", "x");
  assert.notEqual(idx.toHex(), kv.toHex());
});

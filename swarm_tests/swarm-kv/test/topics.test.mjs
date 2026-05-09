import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Topic } from "@ethersphere/bee-js";
import { topicForKvKey, topicForIndex } from "../dist/index.js";

test("topicForKvKey is stable", () => {
  const t1 = topicForKvKey("ns", "foo");
  const t2 = topicForKvKey("ns", "foo");
  assert.equal(t1.toHex(), t2.toHex());
});

test("topicForKvKey matches manual hash", () => {
  const ns = "wallet-agent-session";
  const key = "session_history";
  const h = createHash("sha256").update(`${ns}\0${key}`, "utf8").digest("hex");
  const manual = Topic.fromString(`kv:key:${h}`);
  assert.equal(topicForKvKey(ns, key).toHex(), manual.toHex());
});

test("topicForIndex differs from topicForKvKey", () => {
  const a = topicForIndex("default");
  const b = topicForKvKey("default", "index");
  assert.notEqual(a.toHex(), b.toHex());
});

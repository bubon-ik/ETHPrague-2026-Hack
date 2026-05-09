const test = require("node:test");
const assert = require("node:assert/strict");

const { formatEtherFromWei } = require("./server-utils");

test("formatEtherFromWei formats Sepolia wei balances as ETH", () => {
  assert.equal(formatEtherFromWei("0x0"), "0.0");
  assert.equal(formatEtherFromWei("0xde0b6b3a7640000"), "1");
  assert.equal(formatEtherFromWei("0x2386f26fc10000"), "0.01");
  assert.equal(formatEtherFromWei("0x1"), "0.000000000000000001");
});

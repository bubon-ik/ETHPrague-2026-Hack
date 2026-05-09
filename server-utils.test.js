const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SEPOLIA_TOKENS,
  encodeUniswapExactInputSingle,
  encodeUniswapQuoteExactInputSingle,
  formatEtherFromWei,
} = require("./server-utils");

test("formatEtherFromWei formats Sepolia wei balances as ETH", () => {
  assert.equal(formatEtherFromWei("0x0"), "0.0");
  assert.equal(formatEtherFromWei("0xde0b6b3a7640000"), "1");
  assert.equal(formatEtherFromWei("0x2386f26fc10000"), "0.01");
  assert.equal(formatEtherFromWei("0x1"), "0.000000000000000001");
});

test("Sepolia swap token config uses real testnet addresses", () => {
  assert.equal(SEPOLIA_TOKENS.ETH.address, "0xfff9976782d46cc05630d1f6ebab18b2324d6b14");
  assert.equal(SEPOLIA_TOKENS.USDC.address, "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238");
  assert.equal(SEPOLIA_TOKENS.USDC.decimals, 6);
});

test("encodeUniswapQuoteExactInputSingle builds QuoterV2 calldata", () => {
  const data = encodeUniswapQuoteExactInputSingle({
    tokenIn: SEPOLIA_TOKENS.ETH.address,
    tokenOut: SEPOLIA_TOKENS.USDC.address,
    fee: 10000,
    amountIn: "1000000000000000",
  });

  assert.equal(data.slice(0, 10), "0xc6a5026a");
  assert.equal(data.length, 10 + 64 * 5);
  assert.match(data, /fff9976782d46cc05630d1f6ebab18b2324d6b14/);
  assert.match(data, /1c7d4b196cb0c7b01d743fbc6116a902379c7238/);
});

test("encodeUniswapExactInputSingle builds SwapRouter02 calldata", () => {
  const data = encodeUniswapExactInputSingle({
    tokenIn: SEPOLIA_TOKENS.ETH.address,
    tokenOut: SEPOLIA_TOKENS.USDC.address,
    fee: 10000,
    recipient: "0x000000000000000000000000000000000000dEaD",
    amountIn: "1000000000000000",
    amountOutMinimum: "1234",
  });

  assert.equal(data.slice(0, 10), "0x04e45aaf");
  assert.equal(data.length, 10 + 64 * 7);
  assert.match(data, /000000000000000000000000000000000000dead/);
});

const { keccak256 } = require("ethereum-cryptography/keccak");

const SEPOLIA_CHAIN_ID = 11155111;
const UNISWAP_SEPOLIA = {
  quoterV2: "0xed1f6473345f45b75f8179591dd5ba1888cf2fb3",
  swapRouter02: "0x3bfa4769fb09eefc5a80d6e87c3b9c650f7ae48e",
};
const SEPOLIA_TOKENS = {
  ETH: {
    symbol: "ETH",
    name: "Sepolia ETH",
    address: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
    decimals: 18,
    cgId: "ethereum",
    balance: "0.0",
  },
  USDC: {
    symbol: "USDC",
    name: "USDC Sepolia",
    address: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
    decimals: 6,
    cgId: "usd-coin",
    balance: "0.0",
  },
};
const UNISWAP_V3_DEFAULT_FEE = 10000;

function formatEtherFromWei(hexWei) {
  const wei = BigInt(hexWei || "0x0");
  const base = 10n ** 18n;
  const whole = wei / base;
  const fraction = wei % base;

  if (wei === 0n) return "0.0";
  if (fraction === 0n) return whole.toString();

  const fractionText = fraction.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}.${fractionText}`;
}

function functionSelector(signature) {
  return Buffer.from(keccak256(Buffer.from(signature))).toString("hex").slice(0, 8);
}

function cleanAddress(address) {
  const value = String(address || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(value)) {
    throw new Error(`Invalid address: ${address}`);
  }
  return value.slice(2);
}

function encodeUint(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function encodeAddress(address) {
  return cleanAddress(address).padStart(64, "0");
}

function encodeUniswapQuoteExactInputSingle(params) {
  const selector = functionSelector("quoteExactInputSingle((address,address,uint256,uint24,uint160))");
  return `0x${selector}${[
    encodeAddress(params.tokenIn),
    encodeAddress(params.tokenOut),
    encodeUint(params.amountIn),
    encodeUint(params.fee),
    encodeUint(params.sqrtPriceLimitX96 || 0),
  ].join("")}`;
}

function encodeUniswapExactInputSingle(params) {
  const selector = functionSelector("exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))");
  return `0x${selector}${[
    encodeAddress(params.tokenIn),
    encodeAddress(params.tokenOut),
    encodeUint(params.fee),
    encodeAddress(params.recipient),
    encodeUint(params.amountIn),
    encodeUint(params.amountOutMinimum),
    encodeUint(params.sqrtPriceLimitX96 || 0),
  ].join("")}`;
}

function decodeFirstUint256(hex) {
  const clean = String(hex || "").replace(/^0x/, "");
  if (clean.length < 64) {
    throw new Error("Invalid uint256 response.");
  }
  return BigInt(`0x${clean.slice(0, 64)}`).toString();
}

module.exports = {
  SEPOLIA_CHAIN_ID,
  SEPOLIA_TOKENS,
  UNISWAP_SEPOLIA,
  UNISWAP_V3_DEFAULT_FEE,
  decodeFirstUint256,
  encodeUniswapExactInputSingle,
  encodeUniswapQuoteExactInputSingle,
  formatEtherFromWei,
};

/**
 * Market Agent — quotes + human approval gate + real txs (viem + WALLET_PRIVATE_KEY).
 *
 * Flow:
 * 1. prepareMarketAction → price quote + approval_id (pending in memory, TTL).
 * 2. User confirms in chat → supervisor calls executeMarketAction with same action/payload + approval_id.
 *
 * SWAP_TOKEN: Uniswap V3 Sepolia (same router as wallet stack). Optional `recipient`
 *   sends bought tokens to another 0x (e.g. sell ETH → USDC credited to buyer wallet).
 * BUY_DOMAIN: Sepolia ENS ETHRegistrarController — commit → wait minCommitmentAge → register.
 * SEND_NATIVE: native Sepolia ETH transfer (prepare → approve → execute). `to` may be **0x** or **ENS** on Sepolia.
 */

import crypto from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  parseEther,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { normalize } from "viem/ens";
import { sepolia } from "viem/chains";

const SEPOLIA_CHAIN_ID = 11155111;

const UNISWAP_SEPOLIA = {
  quoterV2: "0xed1f6473345f45b75f8179591dd5ba1888cf2fb3",
  swapRouter02: "0x3bfa4769fb09eefc5a80d6e87c3b9c650f7ae48e",
};

const SEPOLIA_TOKENS = {
  ETH: {
    symbol: "ETH",
    address: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
    decimals: 18,
  },
  USDC: {
    symbol: "USDC",
    address: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
    decimals: 6,
  },
};

/** Sepolia ENS (see https://docs.ens.domains/learn/deployments) */
const ENS_SEPOLIA = {
  ethRegistrarController: "0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968",
  /** Default public resolver on Sepolia */
  publicResolver: "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5",
};

/** Plain ETH `sendTransaction` to these reverts (e.g. SwapRouter: "Not WETH9"). */
const SEND_NATIVE_REJECT_RECIPIENTS_LOWER = new Set(
  [
    UNISWAP_SEPOLIA.swapRouter02,
    UNISWAP_SEPOLIA.quoterV2,
  ].map((a) => getAddress(a).toLowerCase()),
);

const UNISWAP_V3_DEFAULT_FEE = 10000;
/** Prefer 0.3% — main Sepolia USDC/WETH liquidity; fall back for other pairs. */
const FEE_TIERS_TRY_ORDER = [3000, 10000, 500];
const DEFAULT_MAX_SWAP = 10;
const PENDING_TTL_MS = 15 * 60 * 1000;

const quoterV2Abi = [
  {
    name: "quoteExactInputSingle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
];

const swapRouter02Abi = [
  {
    name: "exactInputSingle",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
];

const erc20Abi = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
];

/** Minimal ETHRegistrarController ABI (Sepolia latest) */
const ensControllerAbi = [
  {
    name: "available",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "label", type: "string" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "valid",
    type: "function",
    stateMutability: "pure",
    inputs: [{ name: "label", type: "string" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "rentPrice",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "label", type: "string" },
      { name: "duration", type: "uint256" },
    ],
    outputs: [
      {
        name: "price",
        type: "tuple",
        components: [
          { name: "base", type: "uint256" },
          { name: "premium", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "minCommitmentAge",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "MIN_REGISTRATION_DURATION",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "makeCommitment",
    type: "function",
    stateMutability: "pure",
    inputs: [
      {
        name: "registration",
        type: "tuple",
        components: [
          { name: "label", type: "string" },
          { name: "owner", type: "address" },
          { name: "duration", type: "uint256" },
          { name: "secret", type: "bytes32" },
          { name: "resolver", type: "address" },
          { name: "data", type: "bytes[]" },
          { name: "reverseRecord", type: "uint8" },
          { name: "referrer", type: "bytes32" },
        ],
      },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    name: "commit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "register",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "registration",
        type: "tuple",
        components: [
          { name: "label", type: "string" },
          { name: "owner", type: "address" },
          { name: "duration", type: "uint256" },
          { name: "secret", type: "bytes32" },
          { name: "resolver", type: "address" },
          { name: "data", type: "bytes[]" },
          { name: "reverseRecord", type: "uint8" },
          { name: "referrer", type: "bytes32" },
        ],
      },
    ],
    outputs: [],
  },
];

/** @type {Map<string, object>} */
const pendingApprovals = new Map();

function pruneExpired() {
  const now = Date.now();
  for (const [id, entry] of pendingApprovals) {
    if (entry.expiresAt < now) pendingApprovals.delete(id);
  }
}

function normalizePrivateKey(raw) {
  const s = String(raw ?? "").trim().replace(/^["']|["']$/g, "");
  const hex = s.startsWith("0x") ? s.slice(2) : s;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "WALLET_PRIVATE_KEY must be 64 hex chars (optionally 0x-prefixed).",
    );
  }
  return `0x${hex.toLowerCase()}`;
}

function getSepoliaRpcUrl() {
  const url =
    process.env.SEPOLIA_RPC_URL ||
    process.env.WALLET_RPC_URL ||
    process.env.WEB3_RPC_URL;
  if (!url || url.includes("your_")) {
    throw new Error(
      "Set SEPOLIA_RPC_URL (or WALLET_RPC_URL / WEB3_RPC_URL) to a Sepolia HTTPS endpoint.",
    );
  }
  return url;
}

function maxSwapAmount() {
  const raw = process.env.MARKET_MAX_SWAP_AMOUNT;
  if (raw == null || raw === "") return DEFAULT_MAX_SWAP;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_SWAP;
  return n;
}

function decimalsForSwapToken(symbolUpper) {
  return symbolUpper === "USDC" ? SEPOLIA_TOKENS.USDC.decimals : 18;
}

function firstDefined(...xs) {
  for (const x of xs) {
    if (x != null && x !== "") return x;
  }
  return undefined;
}

/**
 * LLMs often omit `token` but mention buy side, or put amount under alternate keys.
 */
function coerceSwapPayload(raw) {
  const p =
    raw != null && typeof raw === "object" && !Array.isArray(raw)
      ? { ...raw }
      : {};

  const amount = firstDefined(
    p.amount,
    p.value,
    p.eth,
    p.sellAmount,
    p.quantity,
    p.fromAmount,
    p.size,
    p.qty,
  );

  let token =
    p.token ?? p.sellToken ?? p.fromToken ?? p.inToken ?? p.sell;
  if (typeof token === "string") token = token.trim();

  const buy = String(p.buyToken ?? p.toToken ?? p.outToken ?? "").toUpperCase();

  const recipient = firstDefined(
    p.recipient,
    p.outputRecipient,
    p.buyer,
    p.tokenRecipient,
  );

  let tokUpper = token ? String(token).toUpperCase() : "";
  if (tokUpper === "WETH") tokUpper = "ETH";
  if (!tokUpper) {
    if (buy === "USDC") tokUpper = "ETH";
    else if (buy === "ETH" || buy === "WETH") tokUpper = "USDC";
    else tokUpper = "ETH";
  }

  return { ...p, token: tokUpper, amount, recipient };
}

function assertAllowedMarketRecipient(addr, context) {
  const a = getAddress(addr);
  const zero = "0x0000000000000000000000000000000000000000";
  if (a.toLowerCase() === zero) {
    throw new Error(`${context}: zero address is not allowed.`);
  }
  if (SEND_NATIVE_REJECT_RECIPIENTS_LOWER.has(a.toLowerCase())) {
    throw new Error(
      `${context}: ${a} is the Sepolia Uniswap router or quoter — use a wallet address or swap flow.`,
    );
  }
  return a;
}

/**
 * Resolve `0x…` or ENS on **Sepolia** (forward addr record).
 */
async function resolveAddressOrEnsName(rawInput, publicClient, contextLabel) {
  const raw = String(rawInput ?? "").trim();
  if (!raw) {
    throw new Error(
      `Missing ${contextLabel}. Use a 0x address or an ENS name (e.g. name.eth).`,
    );
  }
  if (isAddress(raw)) {
    return {
      address: assertAllowedMarketRecipient(raw, contextLabel),
      ensName: null,
    };
  }
  let ensName;
  try {
    ensName = normalize(raw);
  } catch (e) {
    throw new Error(
      `Invalid ${contextLabel} "${raw}": not a valid 0x address or ENS name (${e?.message ?? e}).`,
    );
  }
  const resolved = await publicClient.getEnsAddress({ name: ensName });
  if (resolved == null) {
    throw new Error(
      `ENS "${ensName}" has no address on **Sepolia**. Set a resolver / addr record for this name on Sepolia, or use a raw 0x address.`,
    );
  }
  return {
    address: assertAllowedMarketRecipient(resolved, contextLabel),
    ensName,
  };
}

/**
 * Uniswap `exactInputSingle` `recipient` — who receives tokenOut (e.g. USDC when selling ETH).
 * @param {`0x${string}`} defaultRecipient wallet address when recipient omitted
 */
async function resolveSwapRecipientForPayload(
  rawPayload,
  defaultRecipient,
  publicClient,
) {
  const raw = coerceSwapPayload(rawPayload).recipient;
  if (raw == null || String(raw).trim() === "") {
    return { address: getAddress(defaultRecipient), ensName: null };
  }
  return resolveAddressOrEnsName(
    raw,
    publicClient,
    "swap output recipient",
  );
}

/**
 * Normalizes API / LLM input (number or string) to a decimal string and wei/units.
 * Avoids Number-only validation so values like 0.001 work reliably; numbers use
 * toFixed + trim so we never pass scientific notation into viem.
 */
function canonicalSwapAmountString(rawAmount, symbolUpper) {
  const maxDec = decimalsForSwapToken(symbolUpper);
  if (rawAmount == null || rawAmount === "") {
    throw new Error(
      "Missing swap amount. Include payload.amount (or top-level amount), e.g. 0.01 for ETH.",
    );
  }

  let s;
  if (typeof rawAmount === "number") {
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      throw new Error("amount must be a positive finite number.");
    }
    s = rawAmount.toFixed(maxDec).replace(/\.?0+$/, "");
    if (s === "" || s === "0") {
      throw new Error("amount must be positive.");
    }
  } else {
    s = String(rawAmount).trim().replace(/,/g, "").replace(/\s+/g, "");
  }

  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error(
      "amount must be a positive decimal (e.g. 0.001, 0.5, 10.25).",
    );
  }

  const frac = s.includes(".") ? s.split(".")[1] : "";
  if (frac.length > maxDec) {
    throw new Error(
      `amount has more than ${maxDec} decimal places for ${symbolUpper}.`,
    );
  }

  const units =
    maxDec === 6
      ? parseUnits(s, SEPOLIA_TOKENS.USDC.decimals)
      : parseEther(s);

  if (units <= 0n) {
    throw new Error("amount must be positive.");
  }

  return { canonicalStr: s, units };
}

async function resolveSwapPair(rawPayload, walletAddress, publicClient) {
  const wallet = getAddress(walletAddress);
  const payload = coerceSwapPayload(rawPayload);
  const symbol = String(payload?.token ?? "ETH").toUpperCase();
  const { canonicalStr, units } = canonicalSwapAmountString(
    payload?.amount,
    symbol,
  );

  const maxHuman = maxSwapAmount();
  const maxUnits =
    symbol === "USDC"
      ? parseUnits(String(maxHuman), SEPOLIA_TOKENS.USDC.decimals)
      : parseEther(String(maxHuman));

  if (units > maxUnits) {
    throw new Error(
      `amount exceeds MARKET_MAX_SWAP_AMOUNT (${maxHuman} ${symbol}).`,
    );
  }

  const { address: outputRecipient, ensName: outputRecipientEnsName } =
    await resolveSwapRecipientForPayload(rawPayload, wallet, publicClient);
  const canonicalPayload = {
    token: symbol,
    amount: canonicalStr,
    recipient: outputRecipient,
  };

  const recipientNote =
    outputRecipient.toLowerCase() === wallet.toLowerCase()
      ? ""
      : ` → ${outputRecipient}${outputRecipientEnsName ? ` (${outputRecipientEnsName})` : ""}`;

  if (symbol === "ETH") {
    return {
      label: `ETH → USDC${recipientNote}`,
      tokenIn: SEPOLIA_TOKENS.ETH,
      tokenOut: SEPOLIA_TOKENS.USDC,
      amountInWei: units,
      sellNativeEth: true,
      outputRecipient,
      outputRecipientEnsName,
      canonicalPayload,
    };
  }
  if (symbol === "USDC") {
    return {
      label: `USDC → ETH${recipientNote}`,
      tokenIn: SEPOLIA_TOKENS.USDC,
      tokenOut: SEPOLIA_TOKENS.ETH,
      amountInRaw: units,
      sellNativeEth: false,
      outputRecipient,
      outputRecipientEnsName,
      canonicalPayload,
    };
  }
  throw new Error(`Unsupported swap token "${symbol}". Use ETH or USDC.`);
}

/** Pull first output (amountOut) from QuoterV2 — viem may return array or object. */
function amountOutFromQuoteResult(result) {
  if (result == null) return undefined;
  if (typeof result === "bigint") return result;
  if (Array.isArray(result) && result.length > 0) return result[0];
  if (typeof result === "object") {
    if (typeof result.amountOut !== "undefined") return result.amountOut;
    if (typeof result[0] !== "undefined") return result[0];
    if (typeof result["0"] !== "undefined") return result["0"];
  }
  return undefined;
}

async function quoteExactInputSingle(publicClient, tokenIn, tokenOut, amountIn) {
  let lastErr;
  for (const fee of FEE_TIERS_TRY_ORDER) {
    try {
      const result = await publicClient.readContract({
        address: UNISWAP_SEPOLIA.quoterV2,
        abi: quoterV2Abi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn: tokenIn.address,
            tokenOut: tokenOut.address,
            amountIn,
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
      const amountOut = amountOutFromQuoteResult(result);
      if (amountOut != null && typeof amountOut === "bigint") {
        return { amountOut, fee };
      }
      lastErr = new Error(
        `Quoter decoded to non-bigint (fee=${fee}): ${String(result)}`,
      );
    } catch (e) {
      lastErr = e;
    }
  }
  const detail =
    lastErr?.shortMessage ?? lastErr?.message ?? String(lastErr ?? "");
  throw new Error(
    `No Uniswap V3 quote on Sepolia for this pair (tried fee tiers ${FEE_TIERS_TRY_ORDER.join(", ")}). ${detail}`,
  );
}

function sumRentPrice(raw) {
  if (raw == null) return 0n;
  if (typeof raw === "bigint") return raw;
  if (Array.isArray(raw) && raw.length >= 2) {
    return BigInt(raw[0]) + BigInt(raw[1]);
  }
  const p = raw.price ?? raw;
  const base = p.base ?? 0n;
  const premium = p.premium ?? 0n;
  return base + premium;
}

function secondsFromYears(years) {
  const y = Number(years);
  if (!Number.isFinite(y) || y <= 0) return 31536000n;
  return BigInt(Math.round(y * 365 * 24 * 60 * 60));
}

function coerceSendPayload(raw) {
  const p =
    raw != null && typeof raw === "object" && !Array.isArray(raw)
      ? { ...raw }
      : {};
  const to = firstDefined(p.to, p.recipient, p.address, p.destination);
  const amount = firstDefined(
    p.amount,
    p.value,
    p.eth,
    p.sendAmount,
    p.quantity,
  );
  return { ...p, to, amount };
}

/**
 * @returns {{ checksummedTo: `0x${string}`, canonicalAmount: string, valueWei: bigint, ensName: string | null }}
 */
async function parseSendNativePayloadAsync(rawPayload, publicClient) {
  const p = coerceSendPayload(rawPayload);
  const rawTo = p.to;
  if (rawTo == null || String(rawTo).trim() === "") {
    throw new Error(
      "Missing recipient. Use payload.to (0x or ENS), or recipient / address.",
    );
  }

  const resolved = await resolveAddressOrEnsName(
    rawTo,
    publicClient,
    "send recipient (to)",
  );
  const checksummedTo = resolved.address;
  const ensName = resolved.ensName ?? null;

  const { canonicalStr, units } = canonicalSwapAmountString(p.amount, "ETH");
  const maxHuman = maxSwapAmount();
  const maxWei = parseEther(String(maxHuman));
  if (units > maxWei) {
    throw new Error(
      `amount exceeds MARKET_MAX_SWAP_AMOUNT (${maxHuman} ETH) for native sends.`,
    );
  }

  return {
    checksummedTo,
    canonicalAmount: canonicalStr,
    valueWei: units,
    ensName,
  };
}

function parseEnsLabel(domainInput) {
  const normalized = normalize(String(domainInput ?? "").trim());
  const parts = normalized.split(".");
  if (parts.length !== 2 || parts[1] !== "eth" || !parts[0]) {
    throw new Error(
      "Only second-level .eth names are supported (e.g. myname.eth).",
    );
  }
  return { canonicalName: normalized, label: parts[0] };
}

function randomBytes32() {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  let hex = "0x";
  for (let i = 0; i < buf.length; i += 1) hex += buf[i].toString(16).padStart(2, "0");
  return /** @type {`0x${string}`} */ (hex);
}

function buildClients() {
  const pk = normalizePrivateKey(process.env.WALLET_PRIVATE_KEY);
  const account = privateKeyToAccount(pk);
  const transport = http(getSepoliaRpcUrl());
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport,
  });
  return { account, publicClient, walletClient };
}

async function payloadMatchesPending(pending, action, payload, publicClient) {
  if (pending.action !== action) return false;
  if (action === "SWAP_TOKEN") {
    try {
      const a = coerceSwapPayload(payload);
      const b = coerceSwapPayload(pending.payload);
      const symA = String(a.token ?? "ETH").toUpperCase();
      const symB = String(b.token ?? "ETH").toUpperCase();
      if (symA !== symB) return false;
      const ca = canonicalSwapAmountString(a.amount, symA);
      const cb = canonicalSwapAmountString(b.amount, symB);
      if (ca.units !== cb.units) return false;
      const recPrepared = pending.payload.recipient;
      if (!recPrepared) return false;
      const { address: recIncoming } = await resolveSwapRecipientForPayload(
        payload,
        recPrepared,
        publicClient,
      );
      return recIncoming === getAddress(recPrepared);
    } catch {
      return false;
    }
  }
  if (action === "BUY_DOMAIN") {
    try {
      const a = parseEnsLabel(payload.domain).canonicalName;
      const b = parseEnsLabel(pending.payload.domain).canonicalName;
      return a === b;
    } catch {
      return false;
    }
  }
  if (action === "SEND_NATIVE") {
    try {
      const a = await parseSendNativePayloadAsync(payload, publicClient);
      const b = await parseSendNativePayloadAsync(pending.payload, publicClient);
      return (
        a.checksummedTo === b.checksummedTo &&
        a.valueWei === b.valueWei
      );
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Price check only — stores pending approval in memory.
 * @param {string} action BUY_DOMAIN | SWAP_TOKEN | SEND_NATIVE
 * @param {object} payload
 * @param {number} [durationYears] registration length for ENS (default 1)
 */
export async function prepareMarketAction(action, payload, durationYears = 1) {
  pruneExpired();
  console.log(`\n[Market Agent prepare]: action=${action}`, payload);

  if (action === "SWAP_TOKEN") {
    const pk = normalizePrivateKey(process.env.WALLET_PRIVATE_KEY);
    const account = privateKeyToAccount(pk);
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(getSepoliaRpcUrl()),
    });
    const pair = await resolveSwapPair(payload, account.address, publicClient);
    const amountIn = pair.amountInWei ?? pair.amountInRaw;
    const { amountOut: quotedOut, fee: swapFee } = await quoteExactInputSingle(
      publicClient,
      pair.tokenIn,
      pair.tokenOut,
      amountIn,
    );

    const approvalId = crypto.randomUUID();
    const expiresAt = Date.now() + PENDING_TTL_MS;
    const createdAt = Date.now();
    pendingApprovals.set(approvalId, {
      action,
      payload: pair.canonicalPayload,
      expiresAt,
      createdAt,
      swap: {
        pair,
        quotedOut,
        fee: swapFee,
      },
    });

    return {
      status: "QUOTE_READY",
      approval_id: approvalId,
      chainId: SEPOLIA_CHAIN_ID,
      action: "SWAP_TOKEN",
      pair: pair.label,
      sellAmount: pair.canonicalPayload.amount,
      sellToken: pair.canonicalPayload.token,
      output_recipient: pair.outputRecipient,
      ...(pair.outputRecipientEnsName
        ? { recipient_ens_name: pair.outputRecipientEnsName }
        : {}),
      output_is_self:
        pair.outputRecipient.toLowerCase() === account.address.toLowerCase(),
      uniswap_fee_tier: swapFee,
      estimatedAmountOutRaw: quotedOut.toString(),
      expires_at: new Date(expiresAt).toISOString(),
      note:
        "Tell the user the quote (sell side, estimated output, who receives tokens). After they approve, call execute_market_action with the same action, payload (token, amount, recipient if any), and approval_id.",
    };
  }

  if (action === "BUY_DOMAIN") {
    const { account, publicClient } = buildClients();
    const net = await publicClient.getChainId();
    if (net !== SEPOLIA_CHAIN_ID) {
      throw new Error(`RPC chainId ${net}; expected Sepolia (${SEPOLIA_CHAIN_ID}).`);
    }

    const { canonicalName, label } = parseEnsLabel(payload.domain);
    const valid = await publicClient.readContract({
      address: ENS_SEPOLIA.ethRegistrarController,
      abi: ensControllerAbi,
      functionName: "valid",
      args: [label],
    });
    if (!valid) {
      return {
        status: "ERROR",
        reason: "INVALID_LABEL",
        domain: canonicalName,
      };
    }

    const isAvailable = await publicClient.readContract({
      address: ENS_SEPOLIA.ethRegistrarController,
      abi: ensControllerAbi,
      functionName: "available",
      args: [label],
    });
    if (!isAvailable) {
      return {
        status: "NOT_AVAILABLE",
        domain: canonicalName,
        note: "Name is already registered on Sepolia.",
      };
    }

    const minDur = await publicClient.readContract({
      address: ENS_SEPOLIA.ethRegistrarController,
      abi: ensControllerAbi,
      functionName: "MIN_REGISTRATION_DURATION",
    });

    let duration = secondsFromYears(durationYears);
    if (duration < minDur) duration = minDur;

    const priceStruct = await publicClient.readContract({
      address: ENS_SEPOLIA.ethRegistrarController,
      abi: ensControllerAbi,
      functionName: "rentPrice",
      args: [label, duration],
    });

    const rentWei = sumRentPrice(priceStruct);
    const secret = randomBytes32();
    const referrerZero =
      "0x0000000000000000000000000000000000000000000000000000000000000000";

    /** @type {const} */
    const registration = {
      label,
      owner: account.address,
      duration,
      secret,
      resolver: ENS_SEPOLIA.publicResolver,
      data: [],
      reverseRecord: 1,
      referrer: referrerZero,
    };

    const commitment = await publicClient.readContract({
      address: ENS_SEPOLIA.ethRegistrarController,
      abi: ensControllerAbi,
      functionName: "makeCommitment",
      args: [registration],
    });

    const minCommitmentAge = await publicClient.readContract({
      address: ENS_SEPOLIA.ethRegistrarController,
      abi: ensControllerAbi,
      functionName: "minCommitmentAge",
    });

    const approvalId = crypto.randomUUID();
    const expiresAt = Date.now() + PENDING_TTL_MS;
    const createdAt = Date.now();

    pendingApprovals.set(approvalId, {
      action,
      payload: { domain: canonicalName },
      expiresAt,
      createdAt,
      ens: {
        registration,
        commitment,
        rentWei,
        label,
        minCommitmentAgeSeconds: Number(minCommitmentAge),
      },
    });

    return {
      status: "QUOTE_READY",
      approval_id: approvalId,
      chainId: SEPOLIA_CHAIN_ID,
      network: "Sepolia ENS",
      action: "BUY_DOMAIN",
      domain: canonicalName,
      durationSeconds: duration.toString(),
      registrationFeeWei: rentWei.toString(),
      estimatedWaitAfterCommitSeconds: Number(minCommitmentAge),
      note:
        "Registration uses commit → wait → register on-chain. Ask the user to confirm; after approval you must call execute_market_action with this approval_id (the server will wait on-chain between steps).",
    };
  }

  if (action === "SEND_NATIVE") {
    try {
      const { account, publicClient } = buildClients();
      const net = await publicClient.getChainId();
      if (net !== SEPOLIA_CHAIN_ID) {
        throw new Error(`RPC chainId ${net}; expected Sepolia (${SEPOLIA_CHAIN_ID}).`);
      }

      const { checksummedTo, canonicalAmount, valueWei, ensName } =
        await parseSendNativePayloadAsync(payload, publicClient);
      if (checksummedTo.toLowerCase() === account.address.toLowerCase()) {
        return {
          status: "ERROR",
          reason: "SELF_RECIPIENT",
          message: "Recipient is the same as the wallet address; refusing send.",
        };
      }

      const approvalId = crypto.randomUUID();
      const expiresAt = Date.now() + PENDING_TTL_MS;
      const createdAt = Date.now();
      const canonicalPayload = { to: checksummedTo, amount: canonicalAmount };

      pendingApprovals.set(approvalId, {
        action,
        payload: canonicalPayload,
        expiresAt,
        createdAt,
        send: {
          to: checksummedTo,
          valueWei,
          ensName,
        },
      });

      return {
        status: "QUOTE_READY",
        approval_id: approvalId,
        chainId: SEPOLIA_CHAIN_ID,
        action: "SEND_NATIVE",
        to: checksummedTo,
        ...(ensName ? { ens_name: ensName } : {}),
        amountEth: canonicalAmount,
        valueWei: valueWei.toString(),
        expires_at: new Date(expiresAt).toISOString(),
        note:
          "Native Sepolia ETH transfer (not mainnet). Recipient may be 0x or ENS (resolved on Sepolia). Show to + amount and ask the user to confirm; then execute_market_action with the same action, payload, and approval_id.",
      };
    } catch (e) {
      return {
        status: "ERROR",
        reason: "SEND_PREPARE_FAILED",
        message: e?.shortMessage ?? e?.message ?? String(e),
      };
    }
  }

  return { status: "FAIL", reason: "Unknown action" };
}

/**
 * Executes after user approval — validates approval_id + matching payload.
 */
export async function executeMarketAction(action, payload, approvalId) {
  pruneExpired();
  console.log(`\n[Market Agent execute]: approvalId=${approvalId} action=${action}`);

  const pending = pendingApprovals.get(approvalId);
  if (!pending || pending.expiresAt < Date.now()) {
    return {
      status: "FAIL",
      reason: "INVALID_OR_EXPIRED_APPROVAL",
      detail: "Run prepare_market_action again to get a fresh quote and approval_id.",
    };
  }

  const { publicClient } = buildClients();
  if (!(await payloadMatchesPending(pending, action, payload, publicClient))) {
    return {
      status: "FAIL",
      reason: "PAYLOAD_MISMATCH",
      detail: "action/payload must match the prepared quote exactly.",
    };
  }

  pendingApprovals.delete(approvalId);

  if (action === "SWAP_TOKEN") {
    return executeSwapFromPending(pending);
  }
  if (action === "BUY_DOMAIN") {
    return executeEnsRegisterFromPending(pending);
  }
  if (action === "SEND_NATIVE") {
    return executeSendNativeFromPending(pending);
  }

  return { status: "FAIL", reason: "Unknown action" };
}

async function executeSendNativeFromPending(pending) {
  try {
    const { account, publicClient, walletClient } = buildClients();
    const net = await publicClient.getChainId();
    if (net !== SEPOLIA_CHAIN_ID) {
      throw new Error(`RPC chainId ${net}; expected Sepolia (${SEPOLIA_CHAIN_ID}).`);
    }

    const to = pending.send.to;
    const value = pending.send.valueWei;
    if (to.toLowerCase() === account.address.toLowerCase()) {
      return {
        status: "FAIL",
        reason: "SELF_RECIPIENT",
        message: "Recipient is the wallet itself.",
      };
    }

    const hash = await walletClient.sendTransaction({
      account,
      chain: sepolia,
      to,
      value,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      return {
        status: "FAIL",
        reason: "TX_REVERTED",
        transactionHash: hash,
        message: "Send transaction reverted on-chain.",
      };
    }

    return {
      status: "SUCCESS",
      action: "SEND_NATIVE",
      message: `Sent ${pending.payload.amount} ETH (Sepolia) to ${to}`,
      transactionHash: hash,
    };
  } catch (e) {
    let detail = e?.shortMessage ?? e?.message ?? String(e);
    if (/Not WETH9/i.test(detail)) {
      detail +=
        " Recipient is likely the Uniswap V3 SwapRouter on Sepolia — it does not accept wallet-to-wallet ETH. Send to an EOA address or use SWAP_TOKEN.";
    }
    return {
      status: "FAIL",
      reason: "SEND_EXEC_FAILED",
      detail,
    };
  }
}

async function executeSwapFromPending(pending) {
  try {
    const { account, publicClient, walletClient } = buildClients();
    const net = await publicClient.getChainId();
    if (net !== SEPOLIA_CHAIN_ID) {
      throw new Error(`RPC chainId ${net}; expected Sepolia (${SEPOLIA_CHAIN_ID}).`);
    }

    const pair = pending.swap.pair;
    const quotedOut = pending.swap.quotedOut;
    const swapFee = pending.swap.fee ?? UNISWAP_V3_DEFAULT_FEE;
    const amountIn = pair.amountInWei ?? pair.amountInRaw;
    const amountOutMinimum = (quotedOut * 9950n) / 10000n;

    const swapArgs = {
      tokenIn: pair.tokenIn.address,
      tokenOut: pair.tokenOut.address,
      fee: swapFee,
      recipient: pair.outputRecipient,
      amountIn,
      amountOutMinimum,
      sqrtPriceLimitX96: 0n,
    };

    if (!pair.sellNativeEth) {
      const approveHash = await walletClient.writeContract({
        address: pair.tokenIn.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [UNISWAP_SEPOLIA.swapRouter02, amountIn],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
    }

    const swapHash = await walletClient.writeContract({
      address: UNISWAP_SEPOLIA.swapRouter02,
      abi: swapRouter02Abi,
      functionName: "exactInputSingle",
      args: [swapArgs],
      value: pair.sellNativeEth ? amountIn : 0n,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: swapHash,
    });

    const ok = receipt.status === "success";
    const toOther =
      pair.outputRecipient.toLowerCase() !== account.address.toLowerCase();
    const msg = ok
      ? toOther
        ? `Swap confirmed: ${pair.label}; output tokens sent to ${pair.outputRecipient} (tx ${swapHash})`
        : `Swap confirmed: ${pair.label} (tx ${swapHash})`
      : `Swap reverted on-chain (tx ${swapHash})`;
    return {
      status: ok ? "SUCCESS" : "FAIL",
      transactionHash: swapHash,
      chainId: SEPOLIA_CHAIN_ID,
      pair: pair.label,
      output_recipient: pair.outputRecipient,
      blockNumber: receipt.blockNumber?.toString() ?? null,
      message: msg,
    };
  } catch (error) {
    const msg =
      error?.shortMessage ??
      error?.message ??
      error?.cause?.message ??
      String(error);
    console.error("[Market Agent swap Error]:", msg);
    return {
      status: "FAIL",
      reason: "TRANSACTION_FAILED",
      detail: msg,
    };
  }
}

async function executeEnsRegisterFromPending(pending) {
  try {
    const { publicClient, walletClient } = buildClients();
    const ens = pending.ens;
    const registration = ens.registration;
    const commitment = ens.commitment;
    const rentWei = ens.rentWei;
    const waitSec = ens.minCommitmentAgeSeconds ?? 60;

    const commitHash = await walletClient.writeContract({
      address: ENS_SEPOLIA.ethRegistrarController,
      abi: ensControllerAbi,
      functionName: "commit",
      args: [commitment],
    });

    const commitReceipt = await publicClient.waitForTransactionReceipt({
      hash: commitHash,
    });
    if (commitReceipt.status !== "success") {
      return {
        status: "FAIL",
        reason: "COMMIT_REVERTED",
        transactionHash: commitHash,
      };
    }

    await new Promise((r) => setTimeout(r, waitSec * 1000));

    const registerHash = await walletClient.writeContract({
      address: ENS_SEPOLIA.ethRegistrarController,
      abi: ensControllerAbi,
      functionName: "register",
      args: [registration],
      value: rentWei,
    });

    const regReceipt = await publicClient.waitForTransactionReceipt({
      hash: registerHash,
    });

    const ok = regReceipt.status === "success";
    return {
      status: ok ? "SUCCESS" : "FAIL",
      chainId: SEPOLIA_CHAIN_ID,
      commitTransactionHash: commitHash,
      registerTransactionHash: registerHash,
      domain: pending.payload.domain,
      message: ok
        ? `ENS registration submitted on Sepolia for ${pending.payload.domain} (register tx ${registerHash})`
        : `Register tx failed or reverted (tx ${registerHash})`,
    };
  } catch (error) {
    const msg =
      error?.shortMessage ??
      error?.message ??
      error?.cause?.message ??
      String(error);
    console.error("[Market Agent ENS Error]:", msg);
    return {
      status: "FAIL",
      reason: "ENS_TRANSACTION_FAILED",
      detail: msg,
    };
  }
}

export function isBareConfirmationMessage(text) {
  const t = String(text ?? "").trim();
  if (!t || t.length > 160) return false;
  if (
    /^(confirm|confirmation|yes|yep|yeah|ok|okay|proceed|approve|approved|go ahead|do it|execute|swap it|sure|please)(\s+please)?\.?!?$/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/^(y|✓|✅)(\s+please)?\.?!?$/i.test(t)) return true;
  if (/^i\s+(confirm|approve|agree|accept)(\s+it)?\.?!?$/i.test(t)) return true;
  return false;
}

function getLatestPendingEntry() {
  pruneExpired();
  let bestId = null;
  let bestEntry = null;
  let bestT = -1;
  for (const [id, entry] of pendingApprovals) {
    const t = entry.createdAt ?? 0;
    if (t >= bestT) {
      bestT = t;
      bestId = id;
      bestEntry = entry;
    }
  }
  if (!bestId || !bestEntry) return null;
  return { approvalId: bestId, entry: bestEntry };
}

/**
 * Used when the UI sends no chat history (or user only types "confirm"):
 * run execute on the most recently prepared quote.
 */
export async function executeLatestPendingIfConfirmed(text) {
  if (!isBareConfirmationMessage(text)) return null;
  const latest = getLatestPendingEntry();
  if (!latest) return null;
  return executeMarketAction(
    latest.entry.action,
    latest.entry.payload,
    latest.approvalId,
  );
}

export function formatExecuteResultForChat(result) {
  if (result == null || typeof result !== "object") {
    return String(result ?? "");
  }
  if (result.status === "SUCCESS") {
    const lines = [];
    if (result.message) lines.push(result.message);
    if (result.transactionHash) lines.push(`Tx: ${result.transactionHash}`);
    if (result.commitTransactionHash) {
      lines.push(`commit tx: ${result.commitTransactionHash}`);
    }
    if (result.registerTransactionHash) {
      lines.push(`register tx: ${result.registerTransactionHash}`);
    }
    return lines.join("\n") || JSON.stringify(result);
  }
  const parts = [result.reason, result.detail, result.message].filter(Boolean);
  return parts.length ? `Failed: ${parts.join(" — ")}` : JSON.stringify(result);
}

/** @deprecated Use prepareMarketAction + executeMarketAction */
export async function executeTransaction(action, payload) {
  return {
    status: "FAIL",
    reason: "USE_APPROVAL_FLOW",
    message:
      "Direct execution is disabled. Call prepare_market_action for a quote, ask the user to approve, then execute_market_action with approval_id.",
    action,
    payload,
  };
}

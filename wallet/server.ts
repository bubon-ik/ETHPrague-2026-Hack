// Local wallet UI server. Uses nc per request to avoid CDC-ECM TCP issues.

import { keccak256 } from "ethereum-cryptography/keccak";
import { secp256k1 } from "ethereum-cryptography/secp256k1";
import { ecdsaSign } from "ethereum-cryptography/secp256k1-compat";
import { hexToBytes, toHex } from "ethereum-cryptography/utils";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));

loadEnv(path.join(CURRENT_DIR, "secrets.env"));
loadEnv(path.join(CURRENT_DIR, ".env"));
loadEnv(path.join(CURRENT_DIR, "..", "agents", ".env"));
/** Fill only unset/empty keys (e.g. BEE_URL / BATCH_ID from swarm-kv examples). */
loadEnvFillMissing(
  path.join(CURRENT_DIR, "..", "swarm_tests", "swarm-kv", "examples", ".env"),
);

const DEVICE_HOST = Bun.env.DEVICE_HOST ?? "10.0.0.1";
const DEVICE_PORT = Number(Bun.env.DEVICE_PORT ?? 4000);
const HOST = Bun.env.WALLET_HOST ?? "127.0.0.1";
const PORT = Number(Bun.env.WALLET_PORT ?? 3030);
const DEBUG = Bun.env.WALLET_DEBUG !== "0";
const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";
const DEFAULT_SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
const SEPOLIA_CHAIN_ID = 11155111;
const UNISWAP_SEPOLIA = {
  quoterV2: "0xed1f6473345f45b75f8179591dd5ba1888cf2fb3",
  swapRouter02: "0x3bfa4769fb09eefc5a80d6e87c3b9c650f7ae48e",
};
const SEPOLIA_TOKENS = {
  WETH: {
    symbol: "WETH",
    address: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
  },
  USDC: {
    symbol: "USDC",
    address: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
  },
};
const UNISWAP_V3_DEFAULT_FEE = 10000;
const CLI_PATH = path.join(CURRENT_DIR, "cli.ts");
const COMMANDS_PATH = path.join(CURRENT_DIR, "commands.md");

const assets = {
  "/": {
    file: new URL("./index.html", import.meta.url),
    type: "text/html; charset=utf-8",
  },
  "/styles.css": {
    file: new URL("./styles.css", import.meta.url),
    type: "text/css; charset=utf-8",
  },
  "/app.js": {
    file: new URL("./app.js", import.meta.url),
    type: "text/javascript; charset=utf-8",
  },
};

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function loadEnvFillMissing(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const cur = process.env[key];
    if (cur !== undefined && String(cur).trim() !== "") continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function log(message) {
  if (!DEBUG) return;
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${message}`);
}

function truncate(text, max = 120) {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

function requireOutput(label, output) {
  if (!output) {
    throw new Error(`${label} returned empty output. Is the wallet applet uploaded?`);
  }
  return output;
}

function normalizeKeyHex(value) {
  let hex = String(value).trim().toLowerCase();
  if (hex.startsWith("0x")) {
    hex = hex.slice(2);
  }
  if (hex.length !== 64) {
    throw new Error("invalid private key length");
  }
  if (!/^[0-9a-f]+$/.test(hex)) {
    throw new Error("invalid private key hex");
  }
  return hex;
}

function deriveAddress(hexKey) {
  const priv = hexToBytes(hexKey);
  const pub = secp256k1.getPublicKey(priv, false);
  const hash = keccak256(pub.slice(1));
  const address = toHex(hash.slice(-20));
  return toChecksumAddress(address);
}

function toChecksumAddress(address) {
  const lower = address.toLowerCase();
  const hash = toHex(keccak256(new TextEncoder().encode(lower)));
  let out = "0x";
  for (let i = 0; i < lower.length; i += 1) {
    const ch = lower[i];
    if (parseInt(hash[i], 16) >= 8) {
      out += ch.toUpperCase();
    } else {
      out += ch;
    }
  }
  return out;
}

async function fetchState() {
  const key = await fetchPrivateKey();
  if (!key) {
    return { status: "not_initialized" };
  }
  const address = deriveAddress(key);
  return { status: "ready", address };
}

async function fetchPrivateKey() {
  const rawKey = requireOutput(
    "Wallet.Key",
    await callApplet("Wallet.Key", "", { redactOutput: true }),
  );
  if (rawKey === "not_initialized") {
    return null;
  }
  return normalizeKeyHex(rawKey);
}

function readSwapParams(url) {
  const query = url.searchParams;
  const chainId = Number(query.get("chainId") || SEPOLIA_CHAIN_ID);
  const sellToken = query.get("sellToken");
  const buyToken = query.get("buyToken");
  const sellAmount = query.get("sellAmount");
  const taker = query.get("taker") || process.env.SIMBA_TAKER_ADDRESS;
  const sellNative = query.get("sellNative") === "1";
  const buyNative = query.get("buyNative") === "1";

  if (chainId !== SEPOLIA_CHAIN_ID) {
    return { error: "Only Sepolia swaps are supported." };
  }

  if (!sellToken || !buyToken || !sellAmount) {
    return { error: "Missing sellToken, buyToken, or sellAmount." };
  }

  if (!findSepoliaToken(sellToken) || !findSepoliaToken(buyToken)) {
    return { error: "Unsupported Sepolia token pair." };
  }

  return { chainId, sellToken, buyToken, sellAmount, taker, sellNative, buyNative, fee: Number(query.get("fee") || UNISWAP_V3_DEFAULT_FEE) };
}

function isUsableAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(value || "") && !/^0x0{40}$/i.test(value);
}

function formatEtherFromWei(hexWei) {
  return formatUnits(hexWei, 18);
}

function formatUnits(value, decimals) {
  const units = BigInt(value || "0x0");
  const base = 10n ** BigInt(decimals);
  const whole = units / base;
  const fraction = units % base;

  if (units === 0n) return "0.0";
  if (fraction === 0n) return whole.toString();

  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fractionText}`;
}

function functionSelector(signature) {
  return toHex(keccak256(new TextEncoder().encode(signature))).slice(0, 8);
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

function encodeErc20BalanceOf(address) {
  const selector = functionSelector("balanceOf(address)");
  return `0x${selector}${encodeAddress(address)}`;
}

function encodeErc20Allowance(owner, spender) {
  const selector = functionSelector("allowance(address,address)");
  return `0x${selector}${encodeAddress(owner)}${encodeAddress(spender)}`;
}

function encodeErc20Approve(spender, amount) {
  const selector = functionSelector("approve(address,uint256)");
  return `0x${selector}${encodeAddress(spender)}${encodeUint(amount)}`;
}

function encodeWethDeposit() {
  return `0x${functionSelector("deposit()")}`;
}

function encodeWethWithdraw(amount) {
  return `0x${functionSelector("withdraw(uint256)")}${encodeUint(amount)}`;
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
  if (clean.length < 64) throw new Error("Invalid uint256 response.");
  return BigInt(`0x${clean.slice(0, 64)}`).toString();
}

function findSepoliaToken(address) {
  const normalized = String(address || "").toLowerCase();
  return Object.values(SEPOLIA_TOKENS).find((token) => token.address.toLowerCase() === normalized);
}

function isNativeWrapperOperation(params) {
  const sellToken = findSepoliaToken(params.sellToken);
  const buyToken = findSepoliaToken(params.buyToken);
  return Boolean(
    sellToken?.symbol === "WETH" &&
    buyToken?.symbol === "WETH" &&
    params.sellNative !== params.buyNative
  );
}

function toRpcQuantity(value) {
  return `0x${BigInt(value).toString(16)}`;
}

function hexQuantityToBigInt(value) {
  return BigInt(value || "0x0");
}

async function callSepoliaRpc(method, params) {
  const rpcResponse = await fetch(process.env.SEPOLIA_RPC_URL || DEFAULT_SEPOLIA_RPC_URL, {
    method: "POST",
    signal: AbortSignal.timeout(5000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const payload = await rpcResponse.json().catch(() => ({}));
  if (!rpcResponse.ok || payload.error) {
    throw new Error(payload.error?.message || rpcResponse.statusText || "Sepolia RPC request failed.");
  }
  return payload.result;
}

async function buildUniswapQuoteResponse(params, endpoint) {
  if (isNativeWrapperOperation(params)) {
    const unwrap = !params.sellNative && params.buyNative;
    const response = {
      chainId: String(SEPOLIA_CHAIN_ID),
      source: unwrap ? "WETH.unwrap" : "WETH.wrap",
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellAmount: params.sellAmount,
      buyAmount: params.sellAmount,
      fee: 0,
    };

    if (endpoint === "quote" || endpoint === "execute") {
      response.transaction = {
        chainId: SEPOLIA_CHAIN_ID,
        from: params.taker,
        to: SEPOLIA_TOKENS.WETH.address,
        data: unwrap ? encodeWethWithdraw(params.sellAmount) : encodeWethDeposit(),
        value: unwrap ? "0x0" : toRpcQuantity(params.sellAmount),
      };
      response.minBuyAmount = params.sellAmount;
    }

    return response;
  }

  const data = encodeUniswapQuoteExactInputSingle({
    tokenIn: params.sellToken,
    tokenOut: params.buyToken,
    fee: params.fee,
    amountIn: params.sellAmount,
  });
  const result = await callSepoliaRpc("eth_call", [{ to: UNISWAP_SEPOLIA.quoterV2, data }, "latest"]);
  const buyAmount = decodeFirstUint256(result);
  const response = {
    chainId: String(SEPOLIA_CHAIN_ID),
    source: "Uniswap V3 Sepolia",
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount,
    buyAmount,
    fee: params.fee,
  };

  if (endpoint === "quote" || endpoint === "execute") {
    const amountOutMinimum = (BigInt(buyAmount) * 9950n) / 10000n;
    const txData = encodeUniswapExactInputSingle({
      tokenIn: params.sellToken,
      tokenOut: params.buyToken,
      fee: params.fee,
      recipient: params.taker,
      amountIn: params.sellAmount,
      amountOutMinimum,
    });
    const sellToken = findSepoliaToken(params.sellToken);
    response.transaction = {
      chainId: SEPOLIA_CHAIN_ID,
      from: params.taker,
      to: UNISWAP_SEPOLIA.swapRouter02,
      data: txData,
      value: params.sellNative ? toRpcQuantity(params.sellAmount) : "0x0",
    };
    response.minBuyAmount = amountOutMinimum.toString();
  }

  return response;
}

async function proxyUniswap(url, endpoint) {
  const params = readSwapParams(url);
  if (params.error) {
    return jsonError(params.error, 400);
  }

  try {
    if (endpoint === "quote" && !isUsableAddress(params.taker)) {
      const wallet = await readWalletAddress();
      if (wallet.connected && isUsableAddress(wallet.address)) {
        params.taker = wallet.address;
      }
    }

    if (endpoint === "quote" && !isUsableAddress(params.taker)) {
      return jsonError("Initialize the wallet before requesting a swap quote.", 400);
    }

    return jsonOk(await buildUniswapQuoteResponse(params, endpoint));
  } catch (error) {
    return jsonError("Uniswap Sepolia request failed.", 502, error.message);
  }
}

async function executeUniswap(url) {
  const params = readSwapParams(url);
  if (params.error) {
    return jsonError(params.error, 400);
  }

  try {
    const keyHex = await fetchPrivateKey();
    if (!keyHex) {
      return jsonError("Initialize the wallet before executing a swap.", 400);
    }

    const from = deriveAddress(keyHex);
    params.taker = from;

    const quote = await buildUniswapQuoteResponse(params, "execute");
    const tx = quote.transaction;
    const dryRun = url.searchParams.get("dryRun") === "1";
    const sellToken = findSepoliaToken(params.sellToken);
    const privKey = hexToBytes(keyHex);

    if (!params.sellNative && !isNativeWrapperOperation(params)) {
      const approval = await ensureTokenApproval({
        token: sellToken,
        owner: from,
        spender: UNISWAP_SEPOLIA.swapRouter02,
        amount: BigInt(params.sellAmount),
        privKey,
        dryRun,
      });
      if (approval) {
        quote.approval = approval;
        if (dryRun && approval.required) {
          quote.execution = {
            from,
            dryRun,
            approvalRequired: true,
          };
          return jsonOk(quote);
        }
      }
    }

    const gasPrice = hexQuantityToBigInt(await callSepoliaRpc("eth_gasPrice", []));
    const nonce = hexQuantityToBigInt(await callSepoliaRpc("eth_getTransactionCount", [from, "pending"]));
    const estimatedGas = hexQuantityToBigInt(await callSepoliaRpc("eth_estimateGas", [{
      from,
      to: tx.to,
      data: tx.data,
      value: tx.value,
    }]));
    const gasLimit = (estimatedGas * 120n) / 100n;
    const rawTx = await signLegacyTransaction({
      nonce,
      gasPrice,
      gasLimit,
      to: tx.to,
      value: hexQuantityToBigInt(tx.value),
      data: tx.data,
      chainId: BigInt(SEPOLIA_CHAIN_ID),
      privKey,
    });
    const rawTxHex = "0x" + toHex(rawTx);
    const txHash = "0x" + toHex(keccak256(rawTx));

    if (!dryRun) {
      const rpcResult = await callSepoliaRpc("eth_sendRawTransaction", [rawTxHex]);
      const submittedHash = isTxHash(rpcResult) ? rpcResult : txHash;
      const receipt = await waitForTransactionReceipt(submittedHash);
      if (!receipt) {
        throw new Error(`transaction was not mined on Sepolia after submit: ${submittedHash}`);
      }
      if (receipt.status !== "0x1") {
        throw new Error(`transaction reverted on Sepolia: ${submittedHash}`);
      }
      quote.sent = submittedHash;
      quote.onchain = {
        hash: submittedHash,
        blockNumber: receipt.blockNumber,
      };
    }

    quote.execution = {
      from,
      nonce: nonce.toString(),
      gasPriceWei: gasPrice.toString(),
      gasLimit: gasLimit.toString(),
      txHash,
      dryRun,
    };

    return jsonOk(quote);
  } catch (error) {
    return jsonError("Uniswap Sepolia execution failed.", 502, error.message);
  }
}

function readApprovalParams(url) {
  const query = url.searchParams;
  const token = findSepoliaToken(query.get("token"));
  const amount = query.get("amount");

  if (!token) {
    return { error: "Approval is only needed for ERC-20 tokens." };
  }
  if (!amount) {
    return { error: "Missing approval amount." };
  }

  return { token, amount: BigInt(amount), spender: UNISWAP_SEPOLIA.swapRouter02 };
}

async function readTokenApproval(url) {
  const params = readApprovalParams(url);
  if (params.error) {
    return jsonError(params.error, 400);
  }

  try {
    const wallet = await readWalletAddress();
    if (!wallet.connected || !isUsableAddress(wallet.address)) {
      return jsonError("Initialize the wallet before checking approval.", 400);
    }

    const allowance = await readTokenAllowance(params.token, wallet.address, params.spender);
    return jsonOk({
      token: params.token.symbol,
      owner: wallet.address,
      spender: params.spender,
      allowance: allowance.toString(),
      amount: params.amount.toString(),
      approved: allowance >= params.amount,
    });
  } catch (error) {
    return jsonError("Approval check failed.", 502, error.message);
  }
}

async function approveToken(url) {
  const params = readApprovalParams(url);
  if (params.error) {
    return jsonError(params.error, 400);
  }

  try {
    const keyHex = await fetchPrivateKey();
    if (!keyHex) {
      return jsonError("Initialize the wallet before approving tokens.", 400);
    }

    const owner = deriveAddress(keyHex);
    const approval = await ensureTokenApproval({
      token: params.token,
      owner,
      spender: params.spender,
      amount: params.amount,
      privKey: hexToBytes(keyHex),
      dryRun: false,
    });

    return jsonOk({
      token: params.token.symbol,
      owner,
      spender: params.spender,
      amount: params.amount.toString(),
      approved: true,
      approval,
    });
  } catch (error) {
    return jsonError("Approval transaction failed.", 502, error.message);
  }
}

async function ensureTokenApproval({ token, owner, spender, amount, privKey, dryRun }) {
  const allowance = await readTokenAllowance(token, owner, spender);
  if (allowance >= amount) {
    return null;
  }

  const gasPrice = hexQuantityToBigInt(await callSepoliaRpc("eth_gasPrice", []));
  const nonce = hexQuantityToBigInt(await callSepoliaRpc("eth_getTransactionCount", [owner, "pending"]));
  const data = encodeErc20Approve(spender, amount);
  const estimatedGas = hexQuantityToBigInt(await callSepoliaRpc("eth_estimateGas", [{
    from: owner,
    to: token.address,
    data,
    value: "0x0",
  }]));
  const gasLimit = (estimatedGas * 120n) / 100n;
  const rawTx = await signLegacyTransaction({
    nonce,
    gasPrice,
    gasLimit,
    to: token.address,
    value: 0n,
    data,
    chainId: BigInt(SEPOLIA_CHAIN_ID),
    privKey,
  });
  const rawTxHex = "0x" + toHex(rawTx);
  const txHash = "0x" + toHex(keccak256(rawTx));

  const approval = {
    token: token.symbol,
    spender,
    amount: amount.toString(),
    txHash,
    dryRun,
    required: true,
  };

  if (dryRun) {
    return approval;
  }

  const rpcResult = await callSepoliaRpc("eth_sendRawTransaction", [rawTxHex]);
  const submittedHash = isTxHash(rpcResult) ? rpcResult : txHash;
  const receipt = await waitForTransactionReceipt(submittedHash);
  if (!receipt) {
    throw new Error(`approval transaction was not mined on Sepolia: ${submittedHash}`);
  }
  if (receipt.status !== "0x1") {
    throw new Error(`approval transaction reverted on Sepolia: ${submittedHash}`);
  }

  approval.txHash = submittedHash;
  approval.blockNumber = receipt.blockNumber;
  return approval;
}

async function readTokenAllowance(token, owner, spender) {
  const allowanceRaw = await callSepoliaRpc("eth_call", [{
    to: token.address,
    data: encodeErc20Allowance(owner, spender),
  }, "latest"]);
  return BigInt(allowanceRaw || "0x0");
}

function isTxHash(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(String(value || ""));
}

async function waitForTransactionReceipt(hash) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const receipt = await callSepoliaRpc("eth_getTransactionReceipt", [hash]);
    if (receipt) return receipt;
    await sleep(2000);
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function proxyCoinGeckoPrices(url) {
  if (!process.env.COINGECKO_API_KEY) {
    return jsonError("Missing COINGECKO_API_KEY in secrets.env.", 500);
  }

  const ids = url.searchParams.get("ids");
  if (!ids) {
    return jsonError("Missing ids.", 400);
  }

  const coinGeckoUrl = new URL(`${COINGECKO_BASE_URL}/simple/price`);
  coinGeckoUrl.searchParams.set("ids", ids);
  coinGeckoUrl.searchParams.set("vs_currencies", url.searchParams.get("vs_currencies") || "usd");
  coinGeckoUrl.searchParams.set("include_24hr_change", "true");
  coinGeckoUrl.searchParams.set("include_last_updated_at", "true");

  try {
    const coinGeckoResponse = await fetch(coinGeckoUrl, {
      headers: {
        "x-cg-demo-api-key": process.env.COINGECKO_API_KEY,
        "Content-Type": "application/json",
      },
    });

    const payload = await coinGeckoResponse.json().catch(() => ({}));
    return jsonOk(payload, coinGeckoResponse.status);
  } catch (error) {
    return jsonError("CoinGecko request failed.", 502, error.message);
  }
}

async function readWalletAddress() {
  try {
    const state = await fetchState();
    if (state.status === "ready" && isUsableAddress(state.address)) {
      return { connected: true, source: "device", address: state.address };
    }
  } catch {
    // Fall through to env fallback.
  }

  if (isUsableAddress(process.env.SIMBA_TAKER_ADDRESS)) {
    return { connected: true, source: "env", address: process.env.SIMBA_TAKER_ADDRESS };
  }

  return { connected: false, source: "none", address: null };
}

async function readWalletBalance() {
  const wallet = await readWalletAddress();
  if (!wallet.connected || !isUsableAddress(wallet.address)) {
    return {
      ...wallet,
      network: "sepolia",
      chainId: 11155111,
      balanceWei: "0x0",
      balanceEth: "0.0",
    };
  }

  const balanceWei = await callSepoliaRpc("eth_getBalance", [wallet.address, "latest"]);
  const wethBalanceRaw = await callSepoliaRpc("eth_call", [{
    to: SEPOLIA_TOKENS.WETH.address,
    data: encodeErc20BalanceOf(wallet.address),
  }, "latest"]);
  const usdcBalanceRaw = await callSepoliaRpc("eth_call", [{
    to: SEPOLIA_TOKENS.USDC.address,
    data: encodeErc20BalanceOf(wallet.address),
  }, "latest"]);

  return {
    ...wallet,
    network: "sepolia",
    chainId: SEPOLIA_CHAIN_ID,
    balanceWei,
    balanceEth: formatEtherFromWei(balanceWei),
    tokenBalances: {
      ETH: formatEtherFromWei(balanceWei),
      WETH: formatUnits(wethBalanceRaw, 18),
      USDC: formatUnits(usdcBalanceRaw, 6),
    },
  };
}

function loadCommandCatalog() {
  if (!fs.existsSync(COMMANDS_PATH)) return "";
  return fs.readFileSync(COMMANDS_PATH, "utf8");
}

async function runCliCommand(commandText) {
  const text = String(commandText ?? "").trim();
  if (!text) {
    throw new Error("command is empty");
  }

  const parts = text.split(/\s+/);
  const command = parts[0];
  if (!command) {
    throw new Error("command is empty");
  }
  if (command !== "transfer_to" && command !== "commands") {
    throw new Error(`unknown command: ${command}`);
  }

  const proc = Bun.spawn([process.execPath, CLI_PATH, ...parts], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: process.env,
  });

  const [stdout, stderr, exit] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  const output = stdout.trim();
  if (exit !== 0) {
    const errorText = stderr.trim() || output || `cli exited ${exit}`;
    throw new Error(errorText);
  }

  return output || "cli: ok";
}

async function callApplet(method, input, options = {}) {
  const redactOutput = options.redactOutput === true;
  log(`bridge -> ${method} (len=${input.length}) ${truncate(input)}`);
  const req = JSON.stringify({ Method: method, Input: input }) + "\n";
  const proc = Bun.spawn(["nc", "-w", "3", DEVICE_HOST, String(DEVICE_PORT)], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(req);
  await proc.stdin.end();

  const [stdout, stderr, exit] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exit !== 0 || !stdout) {
    log(`bridge !! nc failed (exit=${exit}) ${truncate(stderr.trim())}`);
    throw new Error(stderr.trim() || `nc exited ${exit}`);
  }

  const nl = stdout.indexOf("\n");
  const reply = JSON.parse(nl >= 0 ? stdout.slice(0, nl) : stdout);
  if (reply.Error) throw new Error(reply.Error);
  const output = reply.Output ?? "";
  if (redactOutput) {
    log(`bridge <- ${method} (len=${output.length}) [redacted]`);
  } else {
    log(`bridge <- ${method} (len=${output.length}) ${truncate(output)}`);
  }
  return output;
}

function jsonOk(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function jsonError(message, status = 500, detail) {
  return Response.json(detail ? { error: message, detail } : { error: message }, { status });
}

/** Lazy-loaded multi-agent supervisor (`/agents`). Depends on `npm install` inside `agents/`. */
let supervisorAgent = null;
async function getSupervisorAgent() {
  if (supervisorAgent) return supervisorAgent;
  const apiKey = Bun.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "your_openai_api_key_here") {
    throw new Error(
      "OPENAI_API_KEY not set. Add it to agents/.env or export it in the shell.",
    );
  }
  const mod = await import("../agents/src/supervisor.js");
  supervisorAgent = new mod.SupervisorAgent(apiKey);
  return supervisorAgent;
}

async function signLegacyTransaction({ nonce, gasPrice, gasLimit, to, value, data, chainId, privKey }) {
  const fields = [
    bigIntToBytes(nonce),
    bigIntToBytes(gasPrice),
    bigIntToBytes(gasLimit),
    hexToBytes(to.slice(2)),
    bigIntToBytes(value),
    hexToBytes(String(data || "0x").replace(/^0x/, "")),
  ];

  const payload = rlpEncode([
    ...fields,
    bigIntToBytes(chainId),
    new Uint8Array([]),
    new Uint8Array([]),
  ]);
  const msgHash = keccak256(payload);

  const { signature, recid } = ecdsaSign(msgHash, privKey);
  if (signature.length !== 64) {
    throw new Error("unexpected signature length");
  }
  const r = bytesToBigInt(signature.slice(0, 32));
  const s = bytesToBigInt(signature.slice(32, 64));
  const v = BigInt(recid) + 35n + 2n * chainId;

  return rlpEncode([
    ...fields,
    bigIntToBytes(v),
    bigIntToBytes(r),
    bigIntToBytes(s),
  ]);
}

function bigIntToBytes(value) {
  if (value === 0n) return new Uint8Array([]);
  let hex = value.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return hexToBytes(hex);
}

function bytesToBigInt(bytes) {
  if (bytes.length === 0) return 0n;
  return BigInt("0x" + toHex(bytes));
}

function rlpEncode(value) {
  if (Array.isArray(value)) {
    const encodedItems = value.map((item) => rlpEncode(item));
    const payload = concatBytes(encodedItems);
    return concatBytes([encodeLength(payload.length, 0xc0), payload]);
  }

  if (!(value instanceof Uint8Array)) {
    throw new Error("rlp encode expects Uint8Array or array");
  }

  if (value.length === 1 && value[0] < 0x80) {
    return value;
  }

  return concatBytes([encodeLength(value.length, 0x80), value]);
}

function encodeLength(len, offset) {
  if (len <= 55) {
    return Uint8Array.of(len + offset);
  }
  const lenBytes = intToBytes(len);
  return concatBytes([
    Uint8Array.of(offset + 55 + lenBytes.length),
    lenBytes,
  ]);
}

function intToBytes(value) {
  let hex = value.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return hexToBytes(hex);
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(req) {
    const url = new URL(req.url);
    log(`http ${req.method} ${url.pathname}`);

    if (req.method === "GET" && assets[url.pathname]) {
      const asset = assets[url.pathname];
      return new Response(Bun.file(asset.file), {
        headers: {
          "Content-Type": asset.type,
          "Cache-Control": "no-store",
        },
      });
    }

    try {
      if (url.pathname === "/api/swap/price" && req.method === "GET") {
        return proxyUniswap(url, "price");
      }

      if (url.pathname === "/api/swap/quote" && req.method === "GET") {
        return proxyUniswap(url, "quote");
      }

      if (url.pathname === "/api/swap/execute" && req.method === "POST") {
        return executeUniswap(url);
      }

      if (url.pathname === "/api/token/approval" && req.method === "GET") {
        return readTokenApproval(url);
      }

      if (url.pathname === "/api/token/approve" && req.method === "POST") {
        return approveToken(url);
      }

      if (url.pathname === "/api/market/prices" && req.method === "GET") {
        return proxyCoinGeckoPrices(url);
      }

      if (url.pathname === "/api/cli/commands" && req.method === "GET") {
        const commands = loadCommandCatalog();
        if (!commands) {
          return jsonError("commands not found", 404);
        }
        return jsonOk({ commands });
      }

      if (url.pathname === "/api/cli" && req.method === "POST") {
        const payload = await req.json().catch(() => ({}));
        const output = await runCliCommand(payload.command);
        return jsonOk({ output });
      }

      if (url.pathname === "/api/agent/chat" && req.method === "POST") {
        const payload = await req.json().catch(() => ({}));
        const message = typeof payload.message === "string" ? payload.message.trim() : "";
        if (!message) {
          return jsonError("missing message", 400);
        }
        const supervisor = await getSupervisorAgent();
        const reply = await supervisor.handleRequest(message);
        return jsonOk({ reply: reply ?? "" });
      }

      if (url.pathname === "/api/wallet/address" && req.method === "GET") {
        const wallet = await readWalletAddress();
        return jsonOk(wallet);
      }

      if (url.pathname === "/api/wallet/balance" && req.method === "GET") {
        const balance = await readWalletBalance();
        return jsonOk(balance);
      }

      if (url.pathname === "/api/status" && req.method === "GET") {
        const state = await fetchState();
        return jsonOk({ status: state.status ?? "unknown" });
      }

      if (url.pathname === "/api/init" && req.method === "POST") {
        const result = requireOutput("Wallet.Init", await callApplet("Wallet.Init", ""));
        const state = await fetchState();
        return jsonOk({ result, ...state });
      }

      if (url.pathname === "/api/rotate" && req.method === "POST") {
        const result = requireOutput("Wallet.Rotate", await callApplet("Wallet.Rotate", ""));
        const state = await fetchState();
        return jsonOk({ result, ...state });
      }

      if (url.pathname === "/api/state" && req.method === "GET") {
        const state = await fetchState();
        return jsonOk(state);
      }

      return new Response("not found", { status: 404 });
    } catch (err) {
      log(`http !! ${url.pathname} ${truncate(String(err.message ?? err))}`);
      return jsonError(err.message, 502);
    }
  },
});

console.log(`wallet UI on http://${server.hostname}:${server.port}`);
console.log(`debug logging: ${DEBUG ? "on" : "off"} (set WALLET_DEBUG=0 to disable)`);

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const {
  SEPOLIA_CHAIN_ID,
  SEPOLIA_TOKENS,
  UNISWAP_SEPOLIA,
  UNISWAP_V3_DEFAULT_FEE,
  decodeFirstUint256,
  encodeUniswapExactInputSingle,
  encodeUniswapQuoteExactInputSingle,
  formatEtherFromWei
} = require("./server-utils");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT || 4173);
const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";
const DEFAULT_SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

loadEnv(path.join(ROOT, ".env"));

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

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function contentType(filePath) {
  const ext = path.extname(filePath);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function serveStatic(reqUrl, res) {
  if (!fs.existsSync(DIST)) {
    sendText(res, 503, "Build missing. Run npm run build before npm start, or use npm run dev for Vite.");
    return;
  }

  const requestedPath = reqUrl.pathname === "/" ? "/index.html" : reqUrl.pathname;
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(DIST, safePath);

  if (!filePath.startsWith(DIST)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, "index.html");
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

function isUsableAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(value || "") && !/^0x0{40}$/i.test(value);
}

function readUniswapSwapParams(reqUrl) {
  const query = reqUrl.searchParams;
  const chainId = Number(query.get("chainId") || SEPOLIA_CHAIN_ID);
  const sellToken = query.get("sellToken");
  const buyToken = query.get("buyToken");
  const sellAmount = query.get("sellAmount");
  const taker = query.get("taker") || process.env.SIMBA_TAKER_ADDRESS;

  if (chainId !== SEPOLIA_CHAIN_ID) {
    return { error: "Only Sepolia swaps are supported.", status: 400 };
  }

  if (!sellToken || !buyToken || !sellAmount) {
    return { error: "Missing sellToken, buyToken, or sellAmount.", status: 400 };
  }

  if (!findSepoliaToken(sellToken) || !findSepoliaToken(buyToken)) {
    return { error: "Unsupported Sepolia token pair.", status: 400 };
  }

  if (!taker || /^0x0{40}$/i.test(taker)) {
    return { error: "Missing SIMBA_TAKER_ADDRESS. Add the generated wallet address to .env.", status: 400 };
  }

  return {
    chainId,
    sellToken,
    buyToken,
    sellAmount,
    taker,
    fee: Number(query.get("fee") || UNISWAP_V3_DEFAULT_FEE)
  };
}

function findSepoliaToken(address) {
  const normalized = String(address || "").toLowerCase();
  return Object.values(SEPOLIA_TOKENS).find((token) => token.address.toLowerCase() === normalized);
}

function toRpcQuantity(value) {
  return `0x${BigInt(value).toString(16)}`;
}

function getSepoliaRpcUrl() {
  return process.env.SEPOLIA_RPC_URL || DEFAULT_SEPOLIA_RPC_URL;
}

async function callSepoliaRpc(method, params) {
  const rpcResponse = await fetch(getSepoliaRpcUrl(), {
    method: "POST",
    signal: AbortSignal.timeout(5000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  const payload = await rpcResponse.json().catch(() => ({}));
  if (!rpcResponse.ok || payload.error) {
    throw new Error(payload.error?.message || rpcResponse.statusText || "Sepolia RPC request failed.");
  }
  return payload.result;
}

async function quoteUniswap(params) {
  const data = encodeUniswapQuoteExactInputSingle({
    tokenIn: params.sellToken,
    tokenOut: params.buyToken,
    fee: params.fee,
    amountIn: params.sellAmount
  });
  const result = await callSepoliaRpc("eth_call", [{ to: UNISWAP_SEPOLIA.quoterV2, data }, "latest"]);
  return decodeFirstUint256(result);
}

async function proxyUniswap(reqUrl, res, endpoint) {
  const params = readUniswapSwapParams(reqUrl);
  if (params.error) {
    sendJson(res, params.status || 400, { error: params.error });
    return;
  }

  try {
    const buyAmount = await quoteUniswap(params);
    const response = {
      chainId: String(SEPOLIA_CHAIN_ID),
      source: "Uniswap V3 Sepolia",
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellAmount: params.sellAmount,
      buyAmount,
      fee: params.fee
    };

    if (endpoint === "quote") {
      const amountOutMinimum = (BigInt(buyAmount) * 9950n) / 10000n;
      const data = encodeUniswapExactInputSingle({
        tokenIn: params.sellToken,
        tokenOut: params.buyToken,
        fee: params.fee,
        recipient: params.taker,
        amountIn: params.sellAmount,
        amountOutMinimum
      });
      const sellToken = findSepoliaToken(params.sellToken);
      response.transaction = {
        chainId: SEPOLIA_CHAIN_ID,
        from: params.taker,
        to: UNISWAP_SEPOLIA.swapRouter02,
        data,
        value: sellToken?.symbol === "ETH" ? toRpcQuantity(params.sellAmount) : "0x0"
      };
      response.minBuyAmount = amountOutMinimum.toString();
    }

    sendJson(res, 200, response);
  } catch (error) {
    sendJson(res, 502, { error: "Uniswap Sepolia request failed.", detail: error.message });
  }
}

async function proxyCoinGeckoPrices(reqUrl, res) {
  if (!process.env.COINGECKO_API_KEY) {
    sendJson(res, 500, { error: "Missing COINGECKO_API_KEY in .env." });
    return;
  }

  const ids = reqUrl.searchParams.get("ids");
  if (!ids) {
    sendJson(res, 400, { error: "Missing ids." });
    return;
  }

  const coinGeckoUrl = new URL(`${COINGECKO_BASE_URL}/simple/price`);
  coinGeckoUrl.searchParams.set("ids", ids);
  coinGeckoUrl.searchParams.set("vs_currencies", reqUrl.searchParams.get("vs_currencies") || "usd");
  coinGeckoUrl.searchParams.set("include_24hr_change", "true");
  coinGeckoUrl.searchParams.set("include_last_updated_at", "true");

  try {
    const coinGeckoResponse = await fetch(coinGeckoUrl, {
      headers: {
        "x-cg-demo-api-key": process.env.COINGECKO_API_KEY,
        "Content-Type": "application/json"
      }
    });

    const payload = await coinGeckoResponse.json().catch(() => ({}));
    sendJson(res, coinGeckoResponse.status, payload);
  } catch (error) {
    sendJson(res, 502, { error: "CoinGecko request failed.", detail: error.message });
  }
}

async function getWalletSnapshot() {
  const walletApiUrl = process.env.WALLET_API_URL || "http://127.0.0.1:3030/api/state";
  try {
    const walletResponse = await fetch(walletApiUrl, {
      signal: AbortSignal.timeout(1800),
      headers: { "Accept": "application/json" }
    });
    const payload = await walletResponse.json().catch(() => ({}));
    if (walletResponse.ok && isUsableAddress(payload.address)) {
      return {
        connected: true,
        source: "space-computer",
        address: payload.address
      };
    }
  } catch {
    // Fall back to .env below while the Space Computer wallet service is offline.
  }

  if (isUsableAddress(process.env.SIMBA_TAKER_ADDRESS)) {
    return {
      connected: true,
      source: "env",
      address: process.env.SIMBA_TAKER_ADDRESS
    };
  }

  return {
    connected: false,
    source: "none",
    address: null
  };
}

async function readWalletAddress(res) {
  sendJson(res, 200, await getWalletSnapshot());
}

async function readWalletBalance(res) {
  const wallet = await getWalletSnapshot();
  if (!wallet.connected || !isUsableAddress(wallet.address)) {
    sendJson(res, 200, {
      ...wallet,
      network: "sepolia",
      chainId: 11155111,
      balanceWei: "0x0",
      balanceEth: "0.0"
    });
    return;
  }

  try {
    const balanceWei = await callSepoliaRpc("eth_getBalance", [wallet.address, "latest"]);

    sendJson(res, 200, {
      ...wallet,
      network: "sepolia",
      chainId: SEPOLIA_CHAIN_ID,
      balanceWei,
      balanceEth: formatEtherFromWei(balanceWei)
    });
  } catch (error) {
    sendJson(res, 502, { error: "Sepolia balance request failed.", detail: error.message });
  }
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method !== "GET") {
    sendText(res, 405, "Method not allowed");
    return;
  }

  if (reqUrl.pathname === "/api/swap/price") {
    proxyUniswap(reqUrl, res, "price");
    return;
  }

  if (reqUrl.pathname === "/api/swap/quote") {
    proxyUniswap(reqUrl, res, "quote");
    return;
  }

  if (reqUrl.pathname === "/api/market/prices") {
    proxyCoinGeckoPrices(reqUrl, res);
    return;
  }

  if (reqUrl.pathname === "/api/wallet/address") {
    readWalletAddress(res);
    return;
  }

  if (reqUrl.pathname === "/api/wallet/balance") {
    readWalletBalance(res);
    return;
  }

  serveStatic(reqUrl, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Simba Agent local server: http://localhost:${PORT}`);
});

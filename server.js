import http from "http";
import fs from "fs";
import path from "path";
import { URL, fileURLToPath } from "url";

// Boot firmware mocks for the agent
import './firmware/mock/wallet.js';
import './firmware/mock/rpc.js';
import './firmware/mock/price.js';
import './firmware/mock/ens.js';
import './firmware/mock/history.js';
import './firmware/mock/ui.js';

import { router } from './src/agent/router.js';
import { ContextManager } from './src/agent/context.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const ZEROX_BASE_URL = "https://api.0x.org";
const PUBLIC_FILES = new Set(["/", "/index.html", "/swap.html", "/send.html", "/agent.html"]);

const agentContext = new ContextManager();

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

function serveStatic(reqUrl, res) {
  const pathname = reqUrl.pathname === "/" ? "/index.html" : reqUrl.pathname;
  if (!PUBLIC_FILES.has(pathname)) {
    sendText(res, 404, "Not found");
    return;
  }

  const filePath = path.join(ROOT, pathname);
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

function readSwapParams(reqUrl) {
  const query = reqUrl.searchParams;
  const chainId = query.get("chainId") || "1";
  const sellToken = query.get("sellToken");
  const buyToken = query.get("buyToken");
  const sellAmount = query.get("sellAmount");
  const taker = query.get("taker") || process.env.SIMBA_TAKER_ADDRESS;

  if (!sellToken || !buyToken || !sellAmount) {
    return { error: "Missing sellToken, buyToken, or sellAmount." };
  }

  if (!taker || /^0x0{40}$/i.test(taker)) {
    return { error: "Missing SIMBA_TAKER_ADDRESS. Add the generated wallet address to .env." };
  }

  return { chainId, sellToken, buyToken, sellAmount, taker };
}

async function proxy0x(reqUrl, res, endpoint) {
  if (!process.env.ZEROX_API_KEY) {
    sendJson(res, 500, { error: "Missing ZEROX_API_KEY in .env." });
    return;
  }

  const params = readSwapParams(reqUrl);
  if (params.error) {
    sendJson(res, 400, params);
    return;
  }

  const zeroExUrl = new URL(`${ZEROX_BASE_URL}/swap/allowance-holder/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    zeroExUrl.searchParams.set(key, value);
  }

  try {
    const zeroExResponse = await fetch(zeroExUrl, {
      headers: {
        "0x-api-key": process.env.ZEROX_API_KEY,
        "0x-version": "v2",
        "Content-Type": "application/json"
      }
    });

    const payload = await zeroExResponse.json().catch(() => ({}));
    sendJson(res, zeroExResponse.status, payload);
  } catch (error) {
    sendJson(res, 502, { error: "0x request failed.", detail: error.message });
  }
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  if (reqUrl.pathname === "/api/agent" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const { prompt } = JSON.parse(body);
        const result = await router.dispatch(prompt, agentContext);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: "Invalid request body" });
      }
    });
    return;
  }

  if (req.method !== "GET") {
    sendText(res, 405, "Method not allowed");
    return;
  }

  if (reqUrl.pathname === "/api/swap/price") {
    proxy0x(reqUrl, res, "price");
    return;
  }

  if (reqUrl.pathname === "/api/swap/quote") {
    proxy0x(reqUrl, res, "quote");
    return;
  }

  serveStatic(reqUrl, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Simba Agent local server: http://localhost:${PORT}`);
});

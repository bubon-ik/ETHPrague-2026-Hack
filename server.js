const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT || 4173);
const ZEROX_BASE_URL = "https://api.0x.org";

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

const WALLET_PENDING = "wallet.pending";

const TOKENS = {
  ETH: { symbol: "ETH", name: "Wrapped Ether", usd: 3200, cgId: "ethereum", balance: "2.4815", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
  USDC: { symbol: "USDC", name: "USD Coin", usd: 1, cgId: "usd-coin", balance: "1 240.00", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  USDT: { symbol: "USDT", name: "Tether", usd: 1, cgId: "tether", balance: "980.50", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  DAI: { symbol: "DAI", name: "Dai", usd: 1, cgId: "dai", balance: "412.10", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
  WBTC: { symbol: "WBTC", name: "Wrapped BTC", usd: 64000, cgId: "wrapped-bitcoin", balance: "0.0182", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
  ARB: { symbol: "ARB", name: "Arbitrum", usd: 0.92, cgId: "arbitrum", balance: "320.00", address: "0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1", decimals: 18 },
  OP: { symbol: "OP", name: "Optimism", usd: 1.85, cgId: "optimism", balance: "210.00", address: "0x4200000000000000000000000000000000000042", decimals: 18 },
  MATIC: { symbol: "MATIC", name: "Polygon", usd: 0.78, cgId: "polygon-ecosystem-token", balance: "1 020.00", address: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", decimals: 18 },
};

const MARKET_IDS = Object.values(TOKENS).map((token) => token.cgId).join(",");

const pages = {
  home: document.getElementById("page-home"),
  send: document.getElementById("page-send"),
  cli: document.getElementById("page-cli"),
  agent: document.getElementById("page-agent"),
  swap: document.getElementById("page-swap"),
};

const homeStatus = document.getElementById("home-status");
const homeStatusText = document.getElementById("home-status-text");
const walletAddressEl = document.getElementById("wallet-address");
const statusWalletAddressEl = document.getElementById("status-wallet-address");
const initBtn = document.getElementById("initBtn");
const rotateBtn = document.getElementById("rotateBtn");
const walletAlertEl = document.getElementById("wallet-alert");
const sendToInput = document.getElementById("send-to");
const sendAmountInput = document.getElementById("send-amount");
const sendSubmitBtn = document.getElementById("send-submit");
const sendStatusEl = document.getElementById("send-status");
const cliInput = document.getElementById("cli-input");
const cliRunBtn = document.getElementById("cli-run");
const cliOutputEl = document.getElementById("cli-output");
const cliCommandsEl = document.getElementById("cli-commands");

const swapEls = {
  fromAmount: document.getElementById("from-amount"),
  toAmount: document.getElementById("to-amount"),
  fromSymbol: document.getElementById("from-symbol"),
  toSymbol: document.getElementById("to-symbol"),
  fromBalance: document.getElementById("from-balance"),
  toBalance: document.getElementById("to-balance"),
  swapRate: document.getElementById("swap-rate"),
  swap24h: document.getElementById("swap-24h"),
  marketStatus: document.getElementById("swap-market-status"),
  status: document.getElementById("swap-status"),
  submit: document.getElementById("swap-submit"),
  switchTokens: document.getElementById("swap-switch"),
  fromToken: document.getElementById("from-token"),
  toToken: document.getElementById("to-token"),
  tokenModal: document.getElementById("token-modal"),
  tokenModalList: document.getElementById("token-modal-list"),
  tokenModalClose: document.getElementById("token-modal-close"),
};

const swapState = {
  from: "ETH",
  to: "USDC",
  amount: "",
  output: "",
  status: "",
  marketStatus: "market.price: loading",
  marketPrices: {},
  picker: null,
};

const agentSuggestions = [
  "Analyze wallet security",
  "Check token contract",
  "Generate a safe swap route",
  "Scan for phishing",
];

let walletTimer = 0;
let swapPriceTimer = 0;
let marketTimer = 0;

function fmt(n) {
  if (!Number.isFinite(n)) return "0.0";
  if (n === 0) return "0.0";
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function cleanAmount(value) {
  const [head, ...tail] = value.replace(/[^0-9.]/g, "").split(".");
  return tail.length ? `${head}.${tail.join("")}` : head;
}

function amountToUnits(value, decimals) {
  const clean = cleanAmount(value);
  if (!clean) return "0";
  const [whole, fraction = ""] = clean.split(".");
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  return (BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0")).toString();
}

function formatWalletAddress(address) {
  if (!address) return WALLET_PENDING;
  return address;
}

function showWalletAlert(message) {
  if (!walletAlertEl) return;
  walletAlertEl.textContent = message || "";
}

function unitsToAmount(value, decimals) {
  const units = BigInt(value || "0");
  const base = 10n ** BigInt(decimals);
  const whole = units / base;
  const fraction = units % base;
  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}

function formatChange(value) {
  if (!Number.isFinite(value)) return "loading";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function readRoute() {
  return window.location.pathname.replace(/^\/+/, "").replace(/\.html$/, "") || "home";
}

function applyRoute(route) {
  Object.entries(pages).forEach(([key, el]) => {
    if (!el) return;
    el.classList.toggle("is-hidden", key !== route);
  });
  if (homeStatus) {
    homeStatus.classList.toggle("is-hidden", route !== "home");
  }
}

function navigate(route) {
  const path = route === "home" ? "/" : `/${route}`;
  window.history.pushState({}, "", path);
  applyRoute(route);
}

function bindRoutes() {
  document.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.getAttribute("data-route");
      if (next) navigate(next);
    });
  });
}

function bindWalletActions() {
  if (initBtn) {
    initBtn.addEventListener("click", () => runWalletAction("/api/init", "Init", initBtn));
  }
  if (rotateBtn) {
    rotateBtn.addEventListener("click", () => runWalletAction("/api/rotate", "Rotate", rotateBtn));
  }
}

function initMatrix() {
  const canvas = document.getElementById("matrix");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const bits = ["0", "1"];
  let width = 0;
  let height = 0;
  let columns = [];
  let fontSize = 22;
  let frameId = 0;

  function reset() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    fontSize = width < 700 ? 17 : 22;
    const count = Math.ceil(width / fontSize) + 4;
    columns = Array.from({ length: count }, (_, index) => ({
      x: index * fontSize,
      y: -height + Math.random() * height * 2.4,
      speed: 2.6 + Math.random() * 4.3,
      length: 16 + Math.floor(Math.random() * 32),
      fade: 0.58 + Math.random() * 0.42,
    }));
  }

  function draw() {
    ctx.fillStyle = "rgba(5, 9, 6, 0.105)";
    ctx.fillRect(0, 0, width, height);
    ctx.font = `${fontSize}px "SF Mono", "JetBrains Mono", Consolas, monospace`;
    ctx.textAlign = "center";

    for (const column of columns) {
      for (let i = 0; i < column.length; i += 1) {
        const char = bits[(Math.random() * bits.length) | 0];
        const y = column.y + i * fontSize;
        const alpha = Math.max(0, 1 - i / column.length) * column.fade;
        const isHead = i === 0;
        ctx.fillStyle = isHead ? "rgba(231, 255, 235, 0.86)" : `rgba(100, 214, 123, ${alpha})`;
        ctx.shadowColor = "#64d67b";
        ctx.shadowBlur = isHead ? 10 : 4;
        ctx.fillText(char, column.x, y);
      }

      column.y -= column.speed;
      if (column.y + column.length * fontSize < -fontSize) {
        column.y = height + Math.random() * height * 0.4;
        column.speed = 2.6 + Math.random() * 4.3;
        column.length = 16 + Math.floor(Math.random() * 32);
        column.fade = 0.58 + Math.random() * 0.42;
      }
    }

    frameId = requestAnimationFrame(draw);
  }

  reset();
  draw();
  window.addEventListener("resize", reset);
  window.addEventListener("beforeunload", () => cancelAnimationFrame(frameId));
}

function setWalletAddress(address, connected) {
  const label = formatWalletAddress(address);
  if (walletAddressEl) {
    walletAddressEl.textContent = label;
    walletAddressEl.classList.toggle("is-pending", !connected);
  }
  if (statusWalletAddressEl) {
    statusWalletAddressEl.textContent = label;
  }
  if (homeStatusText) {
    homeStatusText.textContent = connected ? "online" : "offline";
  }
}

async function loadWalletAddress() {
  try {
    const response = await fetch("/api/wallet/address");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || response.statusText);
    setWalletAddress(payload.address, Boolean(payload.connected));
  } catch {
    setWalletAddress(null, false);
  }
}

async function runWalletAction(path, label, button) {
  if (button) button.disabled = true;
  showWalletAlert("");
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok) throw new Error(payload.error || response.statusText);
    showWalletAlert(`${label}: ${payload.result || "ok"}`);
    await loadWalletAddress();
  } catch (error) {
    showWalletAlert(error.message || "request failed");
  } finally {
    if (button) button.disabled = false;
  }
}

function startWalletPolling() {
  loadWalletAddress();
  walletTimer = window.setInterval(loadWalletAddress, 5000);
}

function setOutput(el, message) {
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("is-visible", Boolean(message));
}

function setSendStatus(message) {
  setOutput(sendStatusEl, message);
}

function setCliOutput(message) {
  setOutput(cliOutputEl, message);
}

async function runCli(command) {
  const response = await fetch("/api/cli", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) throw new Error(payload.error || response.statusText);
  return payload.output || "cli: ok";
}

function buildTransferCommand() {
  if (!sendToInput || !sendAmountInput) return "";
  const to = sendToInput.value.trim();
  const amount = sendAmountInput.value.trim();

  if (!to) throw new Error("send.to: enter a recipient address");
  if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
    throw new Error("send.to: invalid address");
  }
  if (!amount) throw new Error("send.amount: enter an amount");
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error("send.amount: invalid amount");
  }

  return `transfer_to ${to} ${amount} ETH`;
}

function initSend() {
  if (!sendToInput || !sendAmountInput || !sendSubmitBtn || !sendStatusEl) return;
  const clear = () => setSendStatus("");
  sendToInput.addEventListener("input", clear);
  sendAmountInput.addEventListener("input", clear);
  sendAmountInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendSubmitBtn.click();
    }
  });

  sendSubmitBtn.addEventListener("click", async () => {
    sendSubmitBtn.disabled = true;
    setSendStatus("send.run: executing...");
    try {
      const command = buildTransferCommand();
      const output = await runCli(command);
      setSendStatus(output);
    } catch (error) {
      setSendStatus(`send.error: ${error.message || "request failed"}`);
    } finally {
      sendSubmitBtn.disabled = false;
    }
  });
}

async function loadCliCommands() {
  if (!cliCommandsEl) return;
  try {
    const response = await fetch("/api/cli/commands");
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok) throw new Error(payload.error || response.statusText);
    cliCommandsEl.textContent = payload.commands || "no commands";
  } catch (error) {
    cliCommandsEl.textContent = `commands: ${error.message || "unavailable"}`;
  }
}

function initCli() {
  if (!cliInput || !cliRunBtn || !cliOutputEl) return;
  cliInput.addEventListener("input", () => setCliOutput(""));
  cliInput.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      cliRunBtn.click();
    }
  });
  cliRunBtn.addEventListener("click", async () => {
    const command = cliInput.value.trim();
    if (!command) {
      setCliOutput("cli.input: enter a command");
      return;
    }
    cliRunBtn.disabled = true;
    setCliOutput("cli.run: executing...");
    try {
      const output = await runCli(command);
      setCliOutput(output);
    } catch (error) {
      setCliOutput(`cli.error: ${error.message || "request failed"}`);
    } finally {
      cliRunBtn.disabled = false;
    }
  });
  loadCliCommands();
}

function updateMockOutput() {
  const fromToken = TOKENS[swapState.from];
  const toToken = TOKENS[swapState.to];
  const fromUsd = swapState.marketPrices[fromToken.cgId]?.usd ?? fromToken.usd;
  const toUsd = swapState.marketPrices[toToken.cgId]?.usd ?? toToken.usd;
  const raw = parseFloat(swapState.amount || "");
  if (!Number.isFinite(raw) || raw <= 0) {
    swapState.output = "";
    return;
  }
  swapState.output = fmt((raw * fromUsd) / toUsd);
}

function renderSwap() {
  const fromToken = TOKENS[swapState.from];
  const toToken = TOKENS[swapState.to];
  const fromUsd = swapState.marketPrices[fromToken.cgId]?.usd ?? fromToken.usd;
  const toUsd = swapState.marketPrices[toToken.cgId]?.usd ?? toToken.usd;
  const fromChange = swapState.marketPrices[fromToken.cgId]?.usd_24h_change;

  if (swapEls.fromBalance) swapEls.fromBalance.textContent = fromToken.balance;
  if (swapEls.toBalance) swapEls.toBalance.textContent = toToken.balance;
  if (swapEls.fromSymbol) swapEls.fromSymbol.textContent = fromToken.symbol;
  if (swapEls.toSymbol) swapEls.toSymbol.textContent = toToken.symbol;
  if (swapEls.fromAmount) swapEls.fromAmount.value = swapState.amount;
  if (swapEls.toAmount) swapEls.toAmount.value = swapState.output;
  if (swapEls.swapRate) swapEls.swapRate.textContent = `1 ${fromToken.symbol} \u2248 ${fmt(fromUsd / toUsd)} ${toToken.symbol}`;
  if (swapEls.swap24h) swapEls.swap24h.textContent = formatChange(fromChange);
  if (swapEls.marketStatus) swapEls.marketStatus.textContent = swapState.marketStatus;
  if (swapEls.status) {
    swapEls.status.textContent = swapState.status;
    swapEls.status.classList.toggle("is-visible", Boolean(swapState.status));
  }
}

function scheduleLivePrice() {
  if (swapPriceTimer) window.clearTimeout(swapPriceTimer);
  if (!swapState.amount) return;
  const amount = swapState.amount;
  const fromToken = TOKENS[swapState.from];
  const toToken = TOKENS[swapState.to];
  swapPriceTimer = window.setTimeout(async () => {
    try {
      const price = await request0x("price", fromToken, toToken, amount);
      if (price.buyAmount) {
        swapState.output = fmt(Number(unitsToAmount(price.buyAmount, toToken.decimals)));
      }
      swapState.status = "0x.price: live route ready";
    } catch (error) {
      swapState.status = `0x.price: ${error.message}; using mock route`;
    }
    renderSwap();
  }, 450);
}

function openTokenModal(target) {
  if (!swapEls.tokenModal || !swapEls.tokenModalList) return;
  swapState.picker = target;
  const blocked = target === "from" ? swapState.to : swapState.from;
  swapEls.tokenModalList.textContent = "";
  Object.values(TOKENS)
    .filter((token) => token.symbol !== blocked)
    .forEach((token) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "token-option";
      button.innerHTML = `
        <span class="token-icon"></span>
        <span class="symbol">${token.symbol}</span>
        <span class="name">${token.name}</span>
      `;
      button.addEventListener("click", () => chooseToken(target, token.symbol));
      swapEls.tokenModalList.appendChild(button);
    });
  swapEls.tokenModal.hidden = false;
}

function closeTokenModal() {
  if (!swapEls.tokenModal) return;
  swapEls.tokenModal.hidden = true;
  swapState.picker = null;
}

function chooseToken(target, symbol) {
  if (target === "from") swapState.from = symbol;
  if (target === "to") swapState.to = symbol;
  swapState.status = "";
  updateMockOutput();
  renderSwap();
  scheduleLivePrice();
  closeTokenModal();
}

function switchTokens() {
  const prev = swapState.from;
  swapState.from = swapState.to;
  swapState.to = prev;
  swapState.status = "";
  updateMockOutput();
  renderSwap();
  scheduleLivePrice();
}

async function submitSwap() {
  if (!swapState.amount) {
    swapState.status = "swap.input: enter an amount to continue";
    renderSwap();
    return;
  }
  swapState.status = "0x.quote: requesting transaction data";
  renderSwap();
  try {
    await request0x("quote", TOKENS[swapState.from], TOKENS[swapState.to], swapState.amount);
    swapState.status = `0x.quote: ready ${fmt(Number(swapState.amount))} ${swapState.from} \u2192 ${swapState.output} ${swapState.to}`;
  } catch (error) {
    swapState.status = `0x.quote: ${error.message}`;
  }
  renderSwap();
}

async function loadMarketPrices() {
  try {
    const prices = await requestMarketPrices();
    swapState.marketPrices = prices;
    swapState.marketStatus = "market.price: CoinGecko live";
  } catch (error) {
    swapState.marketStatus = `market.price: ${error.message}`;
  }
  updateMockOutput();
  renderSwap();
}

function initSwap() {
  if (!swapEls.fromAmount || !swapEls.toAmount) return;
  swapEls.fromAmount.addEventListener("input", (event) => {
    swapState.amount = cleanAmount(event.target.value);
    swapState.status = "";
    updateMockOutput();
    renderSwap();
    scheduleLivePrice();
  });
  if (swapEls.fromToken) swapEls.fromToken.addEventListener("click", () => openTokenModal("from"));
  if (swapEls.toToken) swapEls.toToken.addEventListener("click", () => openTokenModal("to"));
  if (swapEls.switchTokens) swapEls.switchTokens.addEventListener("click", switchTokens);
  if (swapEls.submit) swapEls.submit.addEventListener("click", submitSwap);
  if (swapEls.tokenModal) {
    swapEls.tokenModal.addEventListener("click", (event) => {
      if (event.target === swapEls.tokenModal) closeTokenModal();
    });
  }
  if (swapEls.tokenModalClose) swapEls.tokenModalClose.addEventListener("click", closeTokenModal);

  renderSwap();
  loadMarketPrices();
  marketTimer = window.setInterval(loadMarketPrices, 60000);
}

function initAgent() {
  const promptEl = document.getElementById("agent-prompt");
  const sendEl = document.getElementById("agent-send");
  const responseEl = document.getElementById("agent-response");
  const suggestionsEl = document.getElementById("agent-suggestions");
  if (!promptEl || !sendEl || !responseEl || !suggestionsEl) return;

  const setResponse = (text) => {
    responseEl.textContent = text;
    responseEl.classList.toggle("is-visible", Boolean(text));
  };

  promptEl.addEventListener("input", () => setResponse(""));
  sendEl.addEventListener("click", () => {
    const text = promptEl.value.trim();
    setResponse(text ? "agent.request: queued for API connection" : "agent.input: waiting for a request");
  });

  suggestionsEl.textContent = "";
  agentSuggestions.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = item;
    button.addEventListener("click", () => {
      promptEl.value = item;
      setResponse("");
      promptEl.focus();
    });
    suggestionsEl.appendChild(button);
  });
}

async function request0x(endpoint, fromToken, toToken, amount) {
  const params = new URLSearchParams({
    chainId: "1",
    sellToken: fromToken.address,
    buyToken: toToken.address,
    sellAmount: amountToUnits(amount, fromToken.decimals),
  });
  const response = await fetch(`/api/swap/${endpoint}?${params.toString()}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || payload.message || "0x quote failed");
  return payload;
}

async function requestMarketPrices() {
  const params = new URLSearchParams({ ids: MARKET_IDS });
  const response = await fetch(`/api/market/prices?${params.toString()}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || payload.message || "CoinGecko price failed");
  return payload;
}

function initApp() {
  initMatrix();
  bindRoutes();
  bindWalletActions();
  initSend();
  initCli();
  initAgent();
  initSwap();
  startWalletPolling();
  applyRoute(readRoute());
  window.addEventListener("popstate", () => applyRoute(readRoute()));
}

initApp();

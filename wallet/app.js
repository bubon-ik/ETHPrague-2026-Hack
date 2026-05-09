const WALLET_PENDING = "wallet.pending";

const TOKENS = {
  ETH: { symbol: "ETH", name: "Sepolia ETH", usd: 3200, cgId: "ethereum", balance: "0.0", address: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14", decimals: 18, native: true },
  WETH: { symbol: "WETH", name: "Wrapped ETH Sepolia", usd: 3200, cgId: "ethereum", balance: "0.0", address: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14", decimals: 18 },
  USDC: { symbol: "USDC", name: "USDC Sepolia", usd: 1, cgId: "usd-coin", balance: "0.0", address: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238", decimals: 6 },
};

const MARKET_IDS = Array.from(new Set(Object.values(TOKENS).map((token) => token.cgId))).join(",");

const pages = {
  home: document.getElementById("page-home"),
  send: document.getElementById("page-send"),
  settings: document.getElementById("page-settings"),
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

const swapEls = {
  fromAmount: document.getElementById("from-amount"),
  toAmount: document.getElementById("to-amount"),
  fromSymbol: document.getElementById("from-symbol"),
  toSymbol: document.getElementById("to-symbol"),
  fromBalance: document.getElementById("from-balance"),
  fromBalanceMax: document.getElementById("from-balance-max"),
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
  balances: { ETH: TOKENS.ETH.balance, WETH: TOKENS.WETH.balance, USDC: TOKENS.USDC.balance },
  picker: null,
};

function isNativeWrapperPair(fromSymbol, toSymbol) {
  const fromToken = TOKENS[fromSymbol];
  const toToken = TOKENS[toSymbol];
  return Boolean(
    fromToken &&
    toToken &&
    fromToken.address.toLowerCase() === toToken.address.toLowerCase() &&
    fromToken.native !== toToken.native
  );
}

const agentSuggestions = [
  "Analyze wallet security",
  "Check token contract",
  "Generate a safe swap route",
  "Scan for phishing",
];

let walletTimer = 0;
let swapPriceTimer = 0;
let marketTimer = 0;
let currentWalletAddress = null;

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

function normalizeAddress(value) {
  if (!value) return null;
  let text = String(value).trim();
  if (text.startsWith("0x")) {
    text = text.slice(2);
  }
  if (!/^[0-9a-fA-F]{40}$/.test(text)) return null;
  return `0x${text.toLowerCase()}`;
}

function extractAddresses(text) {
  const matches = String(text || "").match(/0x[a-fA-F0-9]{40}/g) || [];
  return matches.map(normalizeAddress).filter(Boolean);
}

function formatTokenBalance(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.0";
  if (n === 0) return "0.0";
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 8 });
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
  currentWalletAddress = connected ? normalizeAddress(address) : null;
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

function formatFetchError(error) {
  const msg = error?.message || String(error);
  if (typeof location !== "undefined" && location.protocol === "file:") {
    return "This page was opened as a local file. Start the wallet server and open the printed URL: bun run wallet-ui";
  }
  if (
    msg === "Failed to fetch" ||
    msg === "Load failed" ||
    error?.name === "TypeError"
  ) {
    return "Cannot reach the wallet server. From the project root run: bun run wallet-ui — then open http://127.0.0.1:3030 (same machine). If the server is already running, check the port in the terminal.";
  }
  return msg;
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

  try {
    const balance = await requestWalletBalance();
    swapState.balances.ETH = formatTokenBalance(balance.tokenBalances?.ETH ?? balance.balanceEth);
    swapState.balances.WETH = formatTokenBalance(balance.tokenBalances?.WETH);
    swapState.balances.USDC = formatTokenBalance(balance.tokenBalances?.USDC);
    renderSwap();
  } catch {
    swapState.balances.ETH = "0.0";
    swapState.balances.WETH = "0.0";
    swapState.balances.USDC = "0.0";
    renderSwap();
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
    showWalletAlert(formatFetchError(error));
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
      await loadWalletAddress();
    } catch (error) {
      setSendStatus(`send.error: ${error.message || "request failed"}`);
    } finally {
      sendSubmitBtn.disabled = false;
    }
  });
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

  if (swapEls.fromBalance) swapEls.fromBalance.textContent = swapState.balances[fromToken.symbol] ?? fromToken.balance;
  if (swapEls.toBalance) swapEls.toBalance.textContent = swapState.balances[toToken.symbol] ?? toToken.balance;
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
      const price = await requestSwap("price", fromToken, toToken, amount);
      if (price.buyAmount) {
        swapState.output = fmt(Number(unitsToAmount(price.buyAmount, toToken.decimals)));
      }
      swapState.status = `${price.source || "Uniswap.price"}: Sepolia route ready`;
    } catch (error) {
      swapState.status = `Uniswap.price: ${error.message}; using estimate`;
    }
    renderSwap();
  }, 450);
}

function openTokenModal(target) {
  if (!swapEls.tokenModal || !swapEls.tokenModalList) return;
  swapState.picker = target;
  const blocked = target === "from" ? swapState.to : swapState.from;
  const blockedToken = TOKENS[blocked];
  swapEls.tokenModalList.textContent = "";
  Object.values(TOKENS)
    .filter((token) => token.symbol !== blocked)
    .filter((token) => target !== "to" || !token.native || isNativeWrapperPair(blocked, token.symbol))
    .filter((token) => token.address.toLowerCase() !== blockedToken.address.toLowerCase() || isNativeWrapperPair(blocked, token.symbol))
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
  swapState.to = TOKENS[prev]?.native ? "WETH" : prev;
  swapState.status = "";
  updateMockOutput();
  renderSwap();
  scheduleLivePrice();
}

function fillMaxFromBalance() {
  const fromToken = TOKENS[swapState.from];
  const balance = swapState.balances[fromToken.symbol] ?? fromToken.balance;
  if (!balance || balance === "0.0") return;
  swapState.amount = cleanAmount(balance);
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
  swapState.status = "swap: signing and broadcasting Sepolia transaction";
  renderSwap();
  try {
    const fromToken = TOKENS[swapState.from];
    const toToken = TOKENS[swapState.to];
    if (!fromToken.native && !isNativeWrapperPair(swapState.from, swapState.to)) {
      const amountUnits = amountToUnits(swapState.amount, fromToken.decimals);
      const approval = await requestTokenApproval(fromToken, amountUnits, "GET");
      if (!approval.approved) {
        swapState.status = `Uniswap.approval: approving ${fromToken.symbol}`;
        renderSwap();
        await requestTokenApproval(fromToken, amountUnits, "POST");
        swapState.status = `Uniswap.approval: ${fromToken.symbol} approved`;
        renderSwap();
      }
    }
    const result = await requestSwap("execute", TOKENS[swapState.from], TOKENS[swapState.to], swapState.amount, "POST");
    swapState.status = `${result.source || "Uniswap.swap"}: onchain ${shortHash(result.onchain?.hash || result.sent)} · ${fmt(Number(swapState.amount))} ${swapState.from} -> ${fmt(Number(unitsToAmount(result.buyAmount, toToken.decimals)))} ${swapState.to}`;
    await loadWalletAddress();
  } catch (error) {
    swapState.status = `Uniswap.swap: ${error.message}`;
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
  if (swapEls.fromBalanceMax) swapEls.fromBalanceMax.addEventListener("click", fillMaxFromBalance);
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
  const threadEl = document.getElementById("agent-thread");
  const inputEl = document.getElementById("agent-input");
  const sendEl = document.getElementById("agent-send");
  if (!threadEl || !inputEl || !sendEl) return;

  /** OpenAI-style turns for `/api/agent/chat` so "confirm" keeps quote context. */
  const agentHistory = [];

  const addMessage = (role, text) => {
    const item = document.createElement("div");
    item.className = `chat-message ${role}`;
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.textContent = text;
    item.appendChild(bubble);
    threadEl.appendChild(item);
    threadEl.scrollTop = threadEl.scrollHeight;
  };

  const handleSend = async () => {
    const text = inputEl.value.trim();
    if (!text) return;
    addMessage("user", text);
    inputEl.value = "";

    const commandName = text.split(/\s+/)[0];
    if (commandName === "transfer_to" || commandName === "commands") {
      addMessage("assistant", "agent: running command...");
      try {
        const output = await runCli(text);
        addMessage("assistant", output || "cli: ok");
        await loadWalletAddress();
      } catch (error) {
        addMessage("assistant", `cli.error: ${error.message || "request failed"}`);
      }
      return;
    }

    try {
      addMessage("assistant", "Simba: thinking…");
      const historyForApi = agentHistory.slice();
      agentHistory.push({ role: "user", content: text });
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: historyForApi }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || payload.detail || `HTTP ${response.status}`);
      }
      threadEl.querySelector(".chat-message:last-child .chat-bubble")?.parentElement?.remove();
      const replyText = payload.reply?.trim() ? payload.reply : "Simba: (no text reply)";
      addMessage("assistant", replyText);
      agentHistory.push({ role: "assistant", content: replyText });
    } catch (error) {
      threadEl.querySelector(".chat-message:last-child .chat-bubble")?.parentElement?.remove();
      addMessage("assistant", `agent.error: ${error.message || "request failed"}`);
    }
  };

  sendEl.addEventListener("click", handleSend);
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  });

  if (!threadEl.dataset.ready) {
    addMessage("assistant", "Simba online. Ask me anything or run transfer_to to send ETH.");
    threadEl.dataset.ready = "true";
  }
}

async function requestSwap(endpoint, fromToken, toToken, amount, method = "GET") {
  const params = new URLSearchParams({
    chainId: "11155111",
    sellToken: fromToken.address,
    buyToken: toToken.address,
    sellAmount: amountToUnits(amount, fromToken.decimals),
    sellNative: fromToken.native ? "1" : "0",
    buyNative: toToken.native ? "1" : "0",
  });
  const response = await fetch(`/api/swap/${endpoint}?${params.toString()}`, { method });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail || payload.error || payload.message || "Uniswap request failed");
  return payload;
}

async function requestTokenApproval(token, amountUnits, method) {
  const params = new URLSearchParams({
    token: token.address,
    amount: amountUnits,
  });
  const response = await fetch(`/api/token/${method === "GET" ? "approval" : "approve"}?${params.toString()}`, { method });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail || payload.error || payload.message || "Approval request failed");
  return payload;
}

function shortHash(value) {
  if (!value) return "pending";
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

async function requestMarketPrices() {
  const params = new URLSearchParams({ ids: MARKET_IDS });
  const response = await fetch(`/api/market/prices?${params.toString()}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || payload.message || "CoinGecko price failed");
  return payload;
}

async function requestWalletBalance() {
  const response = await fetch("/api/wallet/balance");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || payload.message || "Sepolia balance failed");
  return payload;
}

function initApp() {
  initMatrix();
  bindRoutes();
  bindWalletActions();
  initSend();
  initAgent();
  initSwap();
  startWalletPolling();
  applyRoute(readRoute());
  window.addEventListener("popstate", () => applyRoute(readRoute()));
}

initApp();

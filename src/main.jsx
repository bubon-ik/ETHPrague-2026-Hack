import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const WALLET_PENDING = "wallet.pending";

const TOKENS = {
  ETH: { symbol: "ETH", name: "Sepolia ETH", usd: 3200, cgId: "ethereum", balance: "0.0", address: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14", decimals: 18 },
  USDC: { symbol: "USDC", name: "USDC Sepolia", usd: 1, cgId: "usd-coin", balance: "0.0", address: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238", decimals: 6 }
};

const MARKET_IDS = Object.values(TOKENS).map((token) => token.cgId).join(",");

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

function formatTokenBalance(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.0";
  if (n === 0) return "0.0";
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function unitsToAmount(value, decimals) {
  const units = BigInt(value || "0");
  const base = 10n ** BigInt(decimals);
  const whole = units / base;
  const fraction = units % base;
  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}

function useRoute() {
  const readRoute = () => window.location.pathname.replace(/^\/+/, "").replace(/\.html$/, "") || "home";
  const [route, setRoute] = useState(readRoute);

  const navigate = (nextRoute) => {
    const path = nextRoute === "home" ? "/" : `/${nextRoute}`;
    window.history.pushState({}, "", path);
    setRoute(readRoute());
  };

  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return [route, navigate];
}

function MatrixBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
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
        fade: 0.58 + Math.random() * 0.42
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
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", reset);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="matrix-glow" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <div className="frame" aria-hidden="true" />
      <div className="side-rail" aria-hidden="true">binary ascent</div>
    </>
  );
}

function Shell({ children }) {
  return (
    <>
      <MatrixBackground />
      <Satellite />
      {children}
    </>
  );
}

function Satellite() {
  return (
    <div className="satellite" aria-hidden="true">
      <div className="satellite-orbit">
        <span className="satellite-pulse" />
      </div>
      <div className="satellite-body">
        <span className="satellite-core" />
        <span className="satellite-panel panel-left" />
        <span className="satellite-panel panel-right" />
        <span className="satellite-antenna" />
      </div>
    </div>
  );
}

function HomePage({ navigate }) {
  const [wallet, setWallet] = useState({ connected: false, address: null, source: "loading" });
  const walletAddress = formatWalletAddress(wallet.address);

  useEffect(() => {
    let cancelled = false;

    async function loadWalletAddress() {
      try {
        const response = await fetch("/api/wallet/address");
        const payload = await response.json();
        if (!cancelled) setWallet(payload);
      } catch {
        if (!cancelled) setWallet({ connected: false, address: null, source: "offline" });
      }
    }

    loadWalletAddress();
    const interval = window.setInterval(loadWalletAddress, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <Shell>
      <main className="home-main">
        <section className="hero">
          <div className="kicker"><span className="dot" /> AI powered satellite wallet</div>
          <h1>Simba<br />Agent</h1>
          <p className="subtitle">A cinematic first screen for an AI-powered crypto agent: dark, sharp, and alive with moving binary code.</p>
          <div className="actions">
            <button onClick={() => navigate("swap")}>Swap</button>
            <button className="secondary" onClick={() => navigate("agent")}>Agent</button>
            <button className="secondary" onClick={() => navigate("send")}>Send</button>
          </div>
        </section>
        <section className="visual-panel" aria-label="Generated wallet state">
          <div className="wallet-shell">
            <p className={`wallet-address ${wallet.connected ? "" : "is-pending"}`}>{walletAddress}</p>
          </div>
        </section>
      </main>
      <aside className="status">
        <div>status: online</div>
        <div>Network: EVM</div>
        <div>wallet: {walletAddress}</div>
        <div>agent.mode: autonomous</div>
      </aside>
    </Shell>
  );
}

function BackLink({ navigate }) {
  return <button className="back-link" type="button" onClick={() => navigate("home")}>← Back</button>;
}

function SendPage({ navigate }) {
  return (
    <Shell>
      <main className="center-main">
        <div className="send-shell">
          <div className="send-label">Enter recipient address</div>
          <input className="send-input" placeholder="0x... or ENS name" autoComplete="off" spellCheck="false" />
          <BackLink navigate={navigate} />
        </div>
      </main>
    </Shell>
  );
}

function AgentPage({ navigate }) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([
    {
      id: "intro",
      role: "agent",
      text: "Simba Agent online. Ask me to inspect a wallet, prepare a swap, or explain a token route."
    }
  ]);
  const messagesRef = useRef(null);

  const submit = () => {
    const text = prompt.trim();
    if (!text) return;

    const nextMessages = [
      ...messages,
      { id: `user-${Date.now()}`, role: "user", text },
      {
        id: `agent-${Date.now()}`,
        role: "agent",
        text: "agent.request: queued for API connection"
      }
    ];
    setMessages(nextMessages);
    setPrompt("");
  };

  const handlePromptKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  useEffect(() => {
    const node = messagesRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  return (
    <Shell>
      <main className="center-main">
        <div className="agent-shell">
          <div className="agent-head">
            <div className="agent-sub">Autonomous Web3 Security Agent</div>
            <h1 className="agent-title">Simba Agent</h1>
          </div>
          <div className="agent-chat-window">
            <div ref={messagesRef} className="agent-messages" aria-live="polite">
              {messages.map((message) => (
                <div key={message.id} className={`message-row ${message.role === "user" ? "is-user" : "is-agent"}`}>
                  <div className="message-bubble">
                    <span className="message-role">{message.role === "user" ? "You" : "Simba"}</span>
                    <p>{message.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="chat-box">
              <textarea
                className="chat-input"
                placeholder="Message Simba Agent"
                rows="1"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handlePromptKeyDown}
              />
              <button className="chat-send" type="button" aria-label="Send" onClick={submit}>→</button>
            </div>
          </div>
          <BackLink navigate={navigate} />
        </div>
      </main>
    </Shell>
  );
}

function SwapPage({ navigate }) {
  const [from, setFrom] = useState("ETH");
  const [to, setTo] = useState("USDC");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");
  const [marketStatus, setMarketStatus] = useState("market.price: loading");
  const [marketPrices, setMarketPrices] = useState({});
  const [picker, setPicker] = useState(null);
  const [ethBalance, setEthBalance] = useState(TOKENS.ETH.balance);

  const balances = useMemo(() => ({ ETH: ethBalance }), [ethBalance]);
  const fromToken = TOKENS[from];
  const toToken = TOKENS[to];
  const fromUsd = marketPrices[fromToken.cgId]?.usd || fromToken.usd;
  const toUsd = marketPrices[toToken.cgId]?.usd || toToken.usd;
  const fromChange = marketPrices[fromToken.cgId]?.usd_24h_change;
  const mockOutput = useMemo(() => {
    const raw = parseFloat(amount || "");
    if (!Number.isFinite(raw) || raw <= 0) return "";
    return fmt((raw * fromUsd) / toUsd);
  }, [amount, fromUsd, toUsd]);
  const [output, setOutput] = useState("");

  useEffect(() => {
    setOutput(mockOutput);
  }, [mockOutput]);

  useEffect(() => {
    let cancelled = false;

    async function loadMarketPrices() {
      try {
        const prices = await requestMarketPrices();
        if (cancelled) return;
        setMarketPrices(prices);
        setMarketStatus("market.price: CoinGecko live");
      } catch (error) {
        if (cancelled) return;
        setMarketStatus(`market.price: ${error.message}`);
      }
    }

    loadMarketPrices();
    const interval = window.setInterval(loadMarketPrices, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSepoliaBalance() {
      try {
        const balance = await requestWalletBalance();
        if (cancelled) return;
        setEthBalance(formatTokenBalance(balance.balanceEth));
      } catch {
        if (!cancelled) setEthBalance("0.0");
      }
    }

    loadSepoliaBalance();
    const interval = window.setInterval(loadSepoliaBalance, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!amount) return undefined;
    const timer = setTimeout(async () => {
      try {
        const price = await requestSwap("price", fromToken, toToken, amount);
        if (price.buyAmount) setOutput(fmt(Number(unitsToAmount(price.buyAmount, toToken.decimals))));
      setStatus("Uniswap.price: Sepolia route ready");
    } catch (error) {
      setStatus(`Uniswap.price: ${error.message}; using estimate`);
    }
    }, 450);
    return () => clearTimeout(timer);
  }, [amount, fromToken, toToken]);

  const chooseToken = (target, symbol) => {
    if (target === "from") setFrom(symbol);
    if (target === "to") setTo(symbol);
    setPicker(null);
    setStatus("");
  };

  const switchTokens = () => {
    setFrom(to);
    setTo(from);
    setStatus("");
  };

  const submitSwap = async () => {
    if (!amount) {
      setStatus("swap.input: enter an amount to continue");
      return;
    }
    setStatus("Uniswap.quote: requesting Sepolia transaction data");
    try {
      const quote = await requestSwap("quote", fromToken, toToken, amount);
      setStatus(`Uniswap.quote: tx ready ${fmt(Number(amount))} ${from} -> ${fmt(Number(unitsToAmount(quote.buyAmount, toToken.decimals)))} ${to}`);
    } catch (error) {
      setStatus(`Uniswap.quote: ${error.message}`);
    }
  };

  return (
    <Shell>
      <main className="center-main">
        <div className="swap-shell">
          <div className="swap-head">
            <div className="swap-sub">Token Exchange</div>
            <h1 className="swap-title">Swap</h1>
          </div>
          <div className="swap-card">
            <SwapLeg label="From" token={fromToken} amount={amount} balance={balances[from]} editable onAmountChange={(value) => { setAmount(cleanAmount(value)); setStatus(""); }} onPick={() => setPicker("from")} />
            <button className="swap-arrow" type="button" aria-label="Switch tokens" onClick={switchTokens}>↓</button>
            <SwapLeg label="To" token={toToken} amount={output} balance={balances[to]} onPick={() => setPicker("to")} />
            <div className="swap-meta">
              <div className="swap-meta-row"><span>Rate</span><strong>1 {from} ≈ {fmt(fromUsd / toUsd)} {to}</strong></div>
              <div className="swap-meta-row"><span>Slippage</span><strong>0.5%</strong></div>
              <div className="swap-meta-row"><span>24h</span><strong>{formatChange(fromChange)}</strong></div>
            </div>
            <button className="swap-cta" type="button" onClick={submitSwap}>Swap tokens</button>
            <div className="swap-market-status">{marketStatus}</div>
            <div className={`swap-status ${status ? "is-visible" : ""}`}>{status}</div>
          </div>
          <BackLink navigate={navigate} />
        </div>
      </main>
      {picker && <TokenModal target={picker} from={from} to={to} onPick={chooseToken} onClose={() => setPicker(null)} />}
    </Shell>
  );
}

function formatChange(value) {
  if (!Number.isFinite(value)) return "loading";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function SwapLeg({ label, token, amount, balance, editable = false, onAmountChange, onPick }) {
  const visibleBalance = balance ?? token.balance;

  return (
    <div className="leg">
      <div className="leg-row">
        <span className="leg-label">{label}</span>
        <span className="leg-balance">Balance: <strong>{visibleBalance}</strong></span>
      </div>
      <div className="leg-input-row">
        <input className="amount-input" inputMode="decimal" placeholder="0.0" value={amount} readOnly={!editable} onChange={(event) => onAmountChange?.(event.target.value)} />
        <button className="token-pill" type="button" onClick={onPick}>
          <span className="token-icon" />
          <span className="token-symbol">{token.symbol}</span>
          <span className="token-caret">▾</span>
        </button>
      </div>
    </div>
  );
}

function TokenModal({ target, from, to, onPick, onClose }) {
  const blocked = target === "from" ? to : from;
  return (
    <div className="token-modal is-open" onClick={onClose}>
      <div className="token-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="token-modal-head">
          <span>Select token</span>
          <button className="token-modal-close" type="button" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="token-modal-list">
          {Object.values(TOKENS).filter((token) => token.symbol !== blocked).map((token) => (
            <button key={token.symbol} className="token-option" type="button" onClick={() => onPick(target, token.symbol)}>
              <span className="token-icon" />
              <span className="symbol">{token.symbol}</span>
              <span className="name">{token.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

async function requestSwap(endpoint, fromToken, toToken, amount) {
  const params = new URLSearchParams({
    chainId: "11155111",
    sellToken: fromToken.address,
    buyToken: toToken.address,
    sellAmount: amountToUnits(amount, fromToken.decimals)
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

async function requestWalletBalance() {
  const response = await fetch("/api/wallet/balance");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || payload.message || "Sepolia balance failed");
  return payload;
}

function App() {
  const [route, navigate] = useRoute();
  if (route === "swap") return <SwapPage navigate={navigate} />;
  if (route === "send") return <SendPage navigate={navigate} />;
  if (route === "agent") return <AgentPage navigate={navigate} />;
  return <HomePage navigate={navigate} />;
}

createRoot(document.getElementById("root")).render(<App />);

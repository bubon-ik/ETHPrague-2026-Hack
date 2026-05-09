import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const WALLET_ADDRESS = "0x7A3e...91C2";

const TOKENS = {
  ETH: { symbol: "ETH", name: "Wrapped Ether", usd: 3200, cgId: "ethereum", balance: "2.4815", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
  USDC: { symbol: "USDC", name: "USD Coin", usd: 1, cgId: "usd-coin", balance: "1 240.00", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  USDT: { symbol: "USDT", name: "Tether", usd: 1, cgId: "tether", balance: "980.50", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  DAI: { symbol: "DAI", name: "Dai", usd: 1, cgId: "dai", balance: "412.10", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
  WBTC: { symbol: "WBTC", name: "Wrapped BTC", usd: 64000, cgId: "wrapped-bitcoin", balance: "0.0182", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
  ARB: { symbol: "ARB", name: "Arbitrum", usd: 0.92, cgId: "arbitrum", balance: "320.00", address: "0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1", decimals: 18 },
  OP: { symbol: "OP", name: "Optimism", usd: 1.85, cgId: "optimism", balance: "210.00", address: "0x4200000000000000000000000000000000000042", decimals: 18 },
  MATIC: { symbol: "MATIC", name: "Polygon", usd: 0.78, cgId: "polygon-ecosystem-token", balance: "1 020.00", address: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", decimals: 18 }
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
  return (
    <Shell>
      <main className="home-main">
        <section className="hero">
          <div className="kicker"><span className="dot" /> Web3 autonomous security agent</div>
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
            <p className="wallet-address">{WALLET_ADDRESS}</p>
          </div>
        </section>
      </main>
      <aside className="status">
        <div>status: online</div>
        <div>Network: EVM</div>
        <div>wallet: {WALLET_ADDRESS}</div>
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
  const [response, setResponse] = useState("");
  const suggestions = ["Analyze wallet security", "Check token contract", "Generate a safe swap route", "Scan for phishing"];

  const submit = () => {
    setResponse(prompt.trim() ? "agent.request: queued for API connection" : "agent.input: waiting for a request");
  };

  return (
    <Shell>
      <main className="center-main">
        <div className="agent-shell">
          <div className="agent-head">
            <div className="agent-sub">Autonomous Web3 Security Agent</div>
            <h1 className="agent-title">Simba Agent</h1>
          </div>
          <div className="chat-box">
            <textarea
              className="chat-input"
              placeholder="What can Simba do for you?"
              rows="1"
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                setResponse("");
              }}
            />
            <button className="chat-send" type="button" aria-label="Send" onClick={submit}>→</button>
          </div>
          <div className="suggestions">
            {suggestions.map((item) => (
              <button key={item} className="chip" type="button" onClick={() => { setPrompt(item); setResponse(""); }}>
                {item}
              </button>
            ))}
          </div>
          <div className={`agent-response ${response ? "is-visible" : ""}`} aria-live="polite">{response}</div>
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
    if (!amount) return undefined;
    const timer = setTimeout(async () => {
      try {
        const price = await request0x("price", fromToken, toToken, amount);
        if (price.buyAmount) setOutput(fmt(Number(unitsToAmount(price.buyAmount, toToken.decimals))));
        setStatus("0x.price: live route ready");
      } catch (error) {
        setStatus(`0x.price: ${error.message}; using mock route`);
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
    setStatus("0x.quote: requesting transaction data");
    try {
      await request0x("quote", fromToken, toToken, amount);
      setStatus(`0x.quote: ready ${fmt(Number(amount))} ${from} → ${output} ${to}`);
    } catch (error) {
      setStatus(`0x.quote: ${error.message}`);
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
            <SwapLeg label="From" token={fromToken} amount={amount} editable onAmountChange={(value) => { setAmount(cleanAmount(value)); setStatus(""); }} onPick={() => setPicker("from")} />
            <button className="swap-arrow" type="button" aria-label="Switch tokens" onClick={switchTokens}>↓</button>
            <SwapLeg label="To" token={toToken} amount={output} onPick={() => setPicker("to")} />
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

function SwapLeg({ label, token, amount, editable = false, onAmountChange, onPick }) {
  return (
    <div className="leg">
      <div className="leg-row">
        <span className="leg-label">{label}</span>
        <span className="leg-balance">Balance: <strong>{token.balance}</strong></span>
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

async function request0x(endpoint, fromToken, toToken, amount) {
  const params = new URLSearchParams({
    chainId: "1",
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

function App() {
  const [route, navigate] = useRoute();
  if (route === "swap") return <SwapPage navigate={navigate} />;
  if (route === "send") return <SendPage navigate={navigate} />;
  if (route === "agent") return <AgentPage navigate={navigate} />;
  return <HomePage navigate={navigate} />;
}

createRoot(document.getElementById("root")).render(<App />);

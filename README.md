# HardWallet AI Agent — Vault

> **ETH Prague 2026 Hackathon Project**  
> On-device AI agent embedded inside a hardware cryptocurrency wallet.

## 🔐 Overview

**Vault** is a privacy-first AI agent that runs entirely on-device inside a hardware wallet's embedded JavaScript runtime. It provides natural language interaction for:

- 💸 **Transaction execution** — send, swap, buy crypto with full security checks
- 🔷 **ENS domain management** — search, register, renew, transfer
- ⏱️ **Conditional automation** — "If ETH < $1000, buy 5 ETH"
- 📊 **Portfolio analytics** — real-time balances, market data, gas insights

**Zero data exfiltration. Non-custodial by design. Physical button confirmation required.**

---

## 🏗️ Architecture

```
src/
├── agent/          # Conversation loop, intent routing, context management
├── actions/        # Transaction handlers (send, swap, buy, ENS)
├── automation/     # Conditional rule parser, scheduler, encrypted storage
├── rpc/            # Firmware RPC wrapper and Ethereum helpers
├── price/          # Oracle wrapper and in-memory price cache
├── ui/             # Display renderer and UI components
├── security/       # Input validation, gas limits, audit log
└── utils/          # Formatters, logger, constants
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full system design.

---

## 🚀 Getting Started

```bash
# Install dev dependencies (linting + testing only)
npm install

# Run in mock/dev mode (uses firmware/mock/ APIs)
npm run dev

# Run tests
npm test

# Lint
npm run lint
```

---

## 🔒 Security Model

- Private keys **never** leave the HSM — all signing via `wallet.sign()`
- **No raw network access** — only firmware-provided RPC APIs
- Every state-changing action requires physical button confirmation via `ui.confirm()`
- All user data stays on-device (no cloud sync, no analytics)

See [docs/SECURITY.md](docs/SECURITY.md) for full threat model.

---

## 📚 Documentation

| Document | Description |
|---|---|
| [PROMPT.md](PROMPT.md) | Agent superprompt — identity, capabilities, formats |
| [CLAUDE.md](CLAUDE.md) | AI assistant coding rules and conventions |
| [SKILL.md](SKILL.md) | Detailed skill breakdowns with examples |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design & data flow |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model & guarantees |
| [docs/API.md](docs/API.md) | Firmware API reference |
| [docs/EXAMPLES.md](docs/EXAMPLES.md) | Worked conversation examples |

---

## 🧪 Runtime

- **Engine:** QuickJS / Duktape (embedded JavaScript, ES2022)
- **Chains:** Ethereum Mainnet, Base, Arbitrum, Optimism, Polygon
- **Display:** 128×64 OLED or e-ink + physical buttons
- **Signing:** Secure Enclave + HSM

---

*Built for ETH Prague 2026 · On-device AI · Zero data exfiltration · Non-custodial by design*

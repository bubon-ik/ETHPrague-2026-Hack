# HardWallet AI Agent — Vault (on GoTEE)

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
├── llm/            # OpenRouter / LLM client integration
└── utils/          # Formatters, logger, constants
```

Vault runs on top of the **GoTEE** Trusted Execution Environment.

---

## 🚀 Getting Started

### Backend / Agent (Node.js)

```bash
# Install dev dependencies
npm install

# Run in mock/dev mode
npm run dev

# Run interactive agent REPL
npm run agent

# Run real-case scenarios
npm run scenario        # Mocked
npm run scenario:real   # Live LLM (requires .env)
```

### UI / Front (Bun)

```bash
# Start UI server
npm run ui:start

# Upload applet
npm run ui:upload
```

---

## 🔒 Security Model

- Private keys **never** leave the HSM — all signing via `wallet.sign()`
- **No raw network access** — only firmware-provided RPC APIs
- Every state-changing action requires physical button confirmation via `ui.confirm()`
- All user data stays on-device (no cloud sync, no analytics)

---

## 🛠️ Hardware Platform (GoTEE Rust)

Vault utilizes the ARM TrustZone **Secure World** on a [USB Armory MK II](https://github.com/usbarmory/usbarmory/wiki).

### Prerequisites
- USB Armory MK II + microSD card
- Docker
- Rust
- [Bun](https://bun.sh/)

### Quick Start (Hardware)
1. Build flashable image: `./docker/build.sh`
2. Flash SD card: `./scripts/flash-sd.sh /dev/diskN`
3. Talk to applet: `printf '{"Method":"Echo","Input":"hi"}\n' | nc 10.0.0.1 4000`

See the **GoTEE Rust Starter** section below for more details.

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

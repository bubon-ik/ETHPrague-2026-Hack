# 🏗️ Architecture — Vault AI Agent

> **ETH Prague 2026** | HardWallet AI Agent v1.0.0

---

## System Overview

Vault is a fully on-device AI agent embedded inside a hardware wallet. All computation, storage, and logic execution happens within the hardware security module (HSM) — no data leaves the device.

```
┌─────────────────────────────────────────────────────────┐
│                    Hardware Wallet                        │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │            Vault AI Agent (JavaScript)            │    │
│  │                                                    │    │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │    │
│  │  │  Agent   │  │ Actions  │  │  Automation    │  │    │
│  │  │  Core    │→ │ Handlers │  │  Scheduler     │  │    │
│  │  │ index.js │  │ send/    │  │  parser.js     │  │    │
│  │  │ router.js│  │ swap/    │  │  scheduler.js  │  │    │
│  │  │ context.js  │ buy/ens  │  │  conditions/   │  │    │
│  │  └──────────┘  └──────────┘  └────────────────┘  │    │
│  │         ↕              ↕              ↕            │    │
│  │  ┌──────────────────────────────────────────────┐ │    │
│  │  │              Security Layer                   │ │    │
│  │  │    validator.js  limits.js  audit.js          │ │    │
│  │  └──────────────────────────────────────────────┘ │    │
│  │         ↕              ↕              ↕            │    │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │    │
│  │  │  RPC     │  │  Price   │  │      UI         │  │    │
│  │  │  Client  │  │  Oracle  │  │  Renderer       │  │    │
│  │  └──────────┘  └──────────┘  └────────────────┘  │    │
│  └────────────────────────┬─────────────────────────┘    │
│                           │ Firmware API calls            │
│  ┌────────────────────────▼─────────────────────────┐    │
│  │              Firmware API Layer                    │    │
│  │  wallet.sign()  rpc.call()  price.get()           │    │
│  │  ens.*()        history.get()  scheduler.set()    │    │
│  │  ui.render()    ui.confirm()                      │    │
│  └────────────────────────┬─────────────────────────┘    │
│                           │                               │
│  ┌────────────────────────▼─────────────────────────┐    │
│  │           Hardware Security Module (HSM)           │    │
│  │   Private keys (never exposed) + Secure Enclave   │    │
│  └───────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## Data Flow: Transaction Request

```
User Input (NL)
      │
      ▼
agent/router.js
  classify() → intent string
      │
      ▼
actions/send.js (or swap/buy/ens/*)
  1. Parse message → extract params
  2. security/validator.js → validate all inputs
  3. rpc/eth.js → get balance, gas price, estimate gas
  4. price/oracle.js → get USD values
  5. security/limits.js → gas ratio check, rate limit
  6. agent/prompts/transaction.js → build preview string
  7. ui.render() → display preview on OLED
  8. ui.confirm() → wait for physical button press
  9. wallet.sign(tx) → HSM signs transaction
 10. security/audit.js → log event locally
      │
      ▼
Response text → agent/context.js → ui.render(chat)
```

---

## Data Flow: Automation Rule

```
User: "If ETH < $1000, buy 5 ETH"
      │
      ▼
agent/router.js → INTENTS.AUTO_CREATE
      │
      ▼
automation/parser.js
  parseRule() → structured rule object
      │
      ▼
agent/prompts/automation.js
  buildRuleSummary() → plain English display
      │
      ▼
ui.confirm() → user approves
      │
      ▼
automation/store.js
  saveRule() → encrypted local storage
      │
      ▼
[Later, at scheduled interval or boot]
      │
      ▼
automation/scheduler.js
  checkPendingConditions()
    → automation/conditions/price.js
    → compare(currentPrice, op, threshold)
    → triggered? → ui.confirm() → dispatch action
```

---

## Module Map

| Module | Type | Depends On |
|---|---|---|
| `agent/index.js` | Orchestrator | router, context, init, firmware |
| `agent/router.js` | Dispatcher | All handlers, constants |
| `agent/context.js` | State | constants |
| `actions/send.js` | Handler | validator, limits, audit, rpc, price, prompts |
| `actions/swap.js` | Handler | validator, limits, audit, rpc, price, prompts |
| `actions/buy.js` | Handler | validator, limits, audit, price, prompts |
| `actions/ens/search.js` | Handler | validator, limits, audit, rpc, prompts |
| `automation/parser.js` | Parser | prompts, store |
| `automation/scheduler.js` | Scheduler | conditions, store |
| `security/validator.js` | Cross-cutting | utils |
| `rpc/client.js` | Firmware bridge | firmware `rpc` |
| `price/oracle.js` | Firmware bridge | firmware `price`, cache |

---

## Runtime Constraints

| Constraint | Value |
|---|---|
| JS Engine | QuickJS / Duktape (ES2022) |
| Module system | ES Modules |
| Max context messages | 20 |
| Max automation rules | 10 |
| Sign attempts / minute | 5 |
| Price cache TTL | 60 seconds |
| Supported chains | Ethereum, Base, Arbitrum, Optimism, Polygon |

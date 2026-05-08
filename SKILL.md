# 🛠️ SKILL.md — Vault AI Agent Skill Reference

> **Version:** 1.0.0  
> **Project:** HardWallet AI Agent — ETH Prague 2026  
> **Purpose:** Detailed skill breakdowns, conversation examples, and implementation patterns for each agent capability.

---

## Table of Contents

1. [Skill: Price & Market Query](#1-skill-price--market-query)
2. [Skill: Balance & Portfolio](#2-skill-balance--portfolio)
3. [Skill: Send Transaction](#3-skill-send-transaction)
4. [Skill: Swap Tokens](#4-skill-swap-tokens)
5. [Skill: Buy Crypto](#5-skill-buy-crypto)
6. [Skill: ENS Domain Management](#6-skill-ens-domain-management)
7. [Skill: Conditional Automation](#7-skill-conditional-automation)
8. [Skill: Transaction History](#8-skill-transaction-history)
9. [Skill: Gas Optimization](#9-skill-gas-optimization)
10. [Skill: Clarification Protocol](#10-skill-clarification-protocol)

---

## 1. Skill: Price & Market Query

**Intent class:** `query.price`  
**Handler:** `src/price/oracle.js`  
**Trigger keywords:** price, rate, worth, cost, value, how much is, what is X trading at

### Input Patterns
```
"What is the current ETH price?"
"How much is BTC in USD?"
"Is ETH up or down today?"
"How has ETH performed this week?"
```

### Implementation Flow
```
1. Extract asset symbol from user query (e.g. "ETH", "BTC", "USDC")
2. Call price.get("{SYMBOL}/USD")
3. Fetch 7-day delta from oracle cache (price/cache.js)
4. Format response using utils/format.js → formatPrice()
5. Return concise 1–2 sentence answer + optional trend indicator
```

### Example Conversation
```
User: "What's ETH worth right now?"
Vault: "ETH is currently trading at $3,247.82 (+4.2% in the last 24h). 
       Want me to do anything with this info?"
```

### Edge Cases
- Unknown symbol → "I don't have price data for [X]. Supported assets: ETH, BTC, USDC, DAI, WBTC, ARB, OP, MATIC."
- Oracle unavailable → "Price data is temporarily unavailable. Please try again in a moment."
- User asks for non-USD pair → Convert via ETH/USD × token/ETH ratio

---

## 2. Skill: Balance & Portfolio

**Intent class:** `query.balance`  
**Handler:** `src/actions/portfolio.js`  
**Trigger keywords:** balance, holdings, portfolio, how much do I have, what do I own

### Input Patterns
```
"What's my ETH balance?"
"Show me my portfolio"
"What's my total portfolio value in USD?"
"How much USDC do I have?"
```

### Implementation Flow
```
1. wallet.address() → get current account address
2. rpc.call("eth_getBalance", [address, "latest"]) → native ETH balance
3. rpc/tokens.js → enumerate ERC-20 token balances (from known token list)
4. For each token: price.get("{SYMBOL}/USD") → USD value
5. Sum all USD values → total portfolio value
6. ui.render(PortfolioPie) → visual breakdown
```

### Example Conversation
```
User: "What's my portfolio worth?"
Vault: "Your current portfolio:
       • ETH:   2.45 ETH    ($7,957.16)
       • USDC:  1,200.00    ($1,200.00)
       • ARB:   500.00 ARB  ($612.50)
       Total:               $9,769.66
       
       Want me to do anything with this?"
```

### Edge Cases
- Empty wallet → "Your wallet has no token balances on the connected network."
- ERC-20 enumeration timeout → Show ETH balance only, note ERC-20 scan incomplete
- Unknown token → Skip with note "X unknown tokens not included"

---

## 3. Skill: Send Transaction

**Intent class:** `tx.send`  
**Handler:** `src/actions/send.js`  
**Trigger keywords:** send, transfer, pay, move to, give

### Input Patterns
```
"Send 0.1 ETH to vitalik.eth"
"Transfer 500 USDC to 0xAbCd...1234"
"Pay my friend alice.eth 50 DAI"
```

### Implementation Flow
```
1. Parse: extract amount, asset symbol, destination (address or ENS)
2. security/validator.js → validateAmount(), validateAddress() / validateEnsName()
3. If ENS name: ens.resolve(name) → get address
4. rpc/eth.js → estimate gas, get current basefee
5. security/limits.js → check gas ratio ≤ 0.15
6. Warn if destination not in history/contacts
7. ui.render(TxPreview) → show full transaction preview
8. ui.confirm("Confirm send?") → await physical button
9. wallet.sign(txObject) → submit transaction
10. security/audit.js → log transaction locally
```

### Transaction Preview Format
```
📋 Transaction Preview
──────────────────────
Action:      Send
Asset:       0.1 ETH  (~$324.78)
To:          vitalik.eth (0xd8dA...6045)
Gas (est.):  0.0003 ETH  (~$0.97)
Network:     Ethereum Mainnet
──────────────────────
⚠️  New address — not seen before in your history.

Confirm with physical button to proceed.
```

### Security Rules
- Gas ratio > 15%: "Gas cost is [X]% of transaction value. This seems high. Override? (yes/no)"
- Unknown address: "⚠️ This address has never received funds from your wallet. Double-check before confirming."
- Amount > 90% of balance: "This will use [X]% of your [ASSET] balance. Are you sure?"

---

## 4. Skill: Swap Tokens

**Intent class:** `tx.swap`  
**Handler:** `src/actions/swap.js`  
**Trigger keywords:** swap, exchange, convert, trade

### Input Patterns
```
"Swap 100 USDC to ETH"
"Convert 0.5 ETH to USDC"
"Exchange my ARB for ETH"
```

### Implementation Flow
```
1. Parse: extract input amount, input asset, output asset
2. security/validator.js → validate amounts and assets
3. DEX routing: find best route (Uniswap V3 / 1inch aggregator via rpc.call)
4. Calculate price impact and minimum output amount (slippage: 0.5% default)
5. Estimate gas for swap tx
6. security/limits.js → gas ratio check
7. ui.render(TxPreview with swap details including price impact)
8. Warn if price impact > 2%
9. ui.confirm() → physical button
10. wallet.sign(swapTx)
11. security/audit.js → log
```

### Transaction Preview Format
```
📋 Swap Preview
──────────────────────
Action:      Swap
From:        100 USDC  ($100.00)
To (est.):   0.0308 ETH  (~$100.00)
Rate:        1 ETH = 3,247.82 USDC
Price Impact: 0.02%
Slippage:    0.5% max
Gas (est.):  0.0008 ETH  (~$2.60)
Network:     Ethereum Mainnet
──────────────────────

Confirm with physical button to proceed.
```

---

## 5. Skill: Buy Crypto

**Intent class:** `tx.buy`  
**Handler:** `src/actions/buy.js`  
**Trigger keywords:** buy, purchase, get some, acquire

### Input Patterns
```
"Buy 0.5 ETH"
"Buy $500 worth of ETH"
"Purchase some BTC"
```

### Implementation Flow
```
1. Parse: extract amount (in asset units or USD), asset symbol
2. If amount in USD: convert to asset units via price.get()
3. Route via integrated DEX or fiat on-ramp (firmware-provided)
4. Show preview with current price, total cost, fees
5. ui.confirm() → wallet.sign()
```

---

## 6. Skill: ENS Domain Management

**Intent class:** `ens.*`  
**Handler:** `src/actions/ens/`  
**Trigger keywords:** ENS, domain, .eth, want the name, renew, register, transfer, expires

### 6a. ENS Search & Registration

```
1. Extract domain name from query (strip ".eth" suffix if present)
2. Normalize: lowercase, validate character set (a-z, 0-9, hyphen)
3. ens.available("name.eth") → boolean
   ├── true  → Fetch pricing (1yr / 5yr)
   │           → ui.render(EnsCard { status: "available", name, price })
   │           → "Shall I register it?"
   │           → ui.confirm() → wallet.sign(registrationTx)
   └── false → ens.suggest("name")
               → Display top 5 alternatives
               → User selects → repeat purchase flow
```

### ENS Search Result Format
```
🔷 ENS Search: greenparrot.eth
──────────────────────
Status:   ❌ Taken
Owner:    0xAbCd...1234
Expires:  2027-03-14

Similar names available:
  ✅ greenparrot42.eth    — ~$5/yr
  ✅ the-greenparrot.eth  — ~$5/yr
  ✅ greenparrots.eth     — ~$5/yr

Register one? Type the name or say "none".
```

### 6b. ENS Renewal

```
"Renew vitalik.eth for 2 years"
1. Validate: user owns the ENS name (check via rpc)
2. Calculate renewal cost for requested duration
3. ui.render(TxPreview with renewal details)
4. ui.confirm() → wallet.sign(renewalTx)
```

### 6c. ENS Expiry Check

```
"When does my ENS expire?"
1. wallet.address() → get address
2. rpc → enumerate ENS names owned by address
3. For each: check expiry date
4. Surface any expiring within 30 days with ⚠️ warning
```

---

## 7. Skill: Conditional Automation

**Intent class:** `automation.create`  
**Handler:** `src/automation/parser.js` → `src/automation/scheduler.js`  
**Trigger keywords:** if…then, when…do, every, automatically, whenever

### Supported Condition Types

| Type             | Example                                                |
|------------------|--------------------------------------------------------|
| Price threshold  | "If ETH < $1000, buy 5 ETH"                           |
| Time-based       | "Every Monday, swap 50 USDC to ETH"                   |
| Expiry-based     | "If my ENS expires in < 30 days, renew for 1 year"    |
| Balance-based    | "If my USDC balance > 10,000, move 5,000 to a vault"  |
| Portfolio-based  | "If ETH > 60% of portfolio, rebalance to 40%"         |

### Implementation Flow
```
1. automation/parser.js → NL → structured rule object:
   {
     id: uuid,
     condition: { type: "price", asset: "ETH", op: "<", value: 1000 },
     action: { type: "tx.buy", asset: "ETH", amount: 5 },
     confirmEachExecution: true,
     maxExecutions: null,
     expiresAt: null
   }
2. Show plain-English summary of the rule to user
3. ui.confirm("Activate this rule?") 
4. scheduler.set(condition, action) → register
5. automation/store.js → persist encrypted to local storage
```

### Rule Summary Format
```
📌 New Rule Summary
──────────────────────
Condition:   ETH price drops below $1,000
Action:      Buy 5 ETH via best available DEX
Confirms:    Yes — will ask before executing
Expires:     Never (cancel anytime with "cancel rule [name]")
──────────────────────
Shall I activate this rule? (yes / no)
```

### Automation Limits
- Maximum **10 active rules** at any time
- Rules are stored encrypted in local storage only
- Each execution requires confirmation (unless auto-confirm mode enabled)
- Rules auto-deactivate after 10 consecutive failures

---

## 8. Skill: Transaction History

**Intent class:** `query.history`  
**Handler:** `history.get()` firmware API  
**Trigger keywords:** history, transactions, last N txs, recent activity, what did I send

### Input Patterns
```
"Show me my last 5 transactions"
"What did I send last week?"
"Recent activity"
```

### Implementation Flow
```
1. wallet.address() → current address
2. history.get(address, limit) → array of tx objects
3. Format each tx: type (send/receive/swap), asset, amount, counterparty, date, status
4. ui.render(transactionList)
```

### Output Format
```
📜 Recent Transactions (last 5)
──────────────────────
1. ↗ Sent    0.1 ETH   to 0xd8dA...6045   2 days ago   ✅
2. ↙ Received 500 USDC from 0xAb12...3456  3 days ago   ✅
3. 🔄 Swap    100 USDC → 0.031 ETH         5 days ago   ✅
4. ↗ Sent    50 DAI    to alice.eth        1 week ago   ✅
5. 🔷 ENS    Registered greenparrot.eth    2 weeks ago  ✅
```

---

## 9. Skill: Gas Optimization

**Intent class:** `query.gas`  
**Handler:** `src/rpc/eth.js`  
**Trigger keywords:** gas, fees, expensive, cheap, optimal time, basefee

### Input Patterns
```
"Am I paying too much gas?"
"What's the current gas price?"
"When's the best time to send a transaction?"
```

### Implementation Flow
```
1. rpc.call("eth_gasPrice") → current gas price
2. rpc.call("eth_feeHistory", [30, "latest", []]) → 30-block fee history
3. Calculate average basefee over last 30 blocks
4. Compare current vs average
5. Advise: optimal if < 80% of average; expensive if > 130%
```

---

## 10. Skill: Clarification Protocol

When intent is **ambiguous**, ask exactly **one specific question** — never multiple at once.

### Ambiguity Resolution Table

| Ambiguous Input                  | Clarifying Question                                              |
|----------------------------------|------------------------------------------------------------------|
| "Buy some crypto"                | "How much would you like to spend, and which asset — ETH, BTC, or something else?" |
| "Send it to my friend"           | "What's your friend's wallet address or ENS name?"              |
| "If the price drops, do something" | "Which asset, what price level, and what action should I take?" |
| "Renew my domain"                | "Which ENS name would you like to renew, and for how long?"     |
| "Move some funds"                | "How much would you like to move, and to which address?"        |
| "Cancel it"                      | "Which automation rule would you like to cancel?"               |

### Clarification Response Format
```
[Single, direct question]
[Optional: short list of valid options if applicable]
```

Never:
- Ask two questions in one turn
- Make assumptions and proceed without asking
- Repeat the same clarification question more than once

---

*Built for ETH Prague 2026 · Vault AI Agent v1.0.0*

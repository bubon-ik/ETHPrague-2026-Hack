# ETHPrague Project Analysis

> Self-healing hardware wallet — full analysis, improvements, and team plan

---

## Project Overview

**Name:** Self-healing Hardware Wallet
**Concept:** A Raspberry Pi-based hardware wallet that actively monitors backup health and can autonomously recover critical data through decentralized storage.

**One-liner:** *"It's a hardware wallet that doesn't just protect keys — it actively protects your ability to recover safely."*

---

## Sponsor Stack

| Sponsor | Role | What We Use Them For |
|---------|------|---------------------|
| **SpaceComputer** | Security + Hardware Identity | Makes Raspberry Pi a trusted security device: secure local storage, hardware identity, tamper-evident logs |
| **Swarm** | Decentralized Backup | Stores backup manifests, wallet metadata, recovery references |
| **AI Agent** | Agentic Workflow | Agent monitors backup health, checks state integrity, triggers recovery |
| **ENS** | Identity / Naming | Human-readable name for the device or recovery endpoint |

---

## Technical Architecture

```
┌─────────────────────────────────────────────┐
│              Raspberry Pi Device            │
│  ┌─────────────────────────────────────┐    │
│  │  SpaceComputer Security Layer       │    │
│  │  - Device identity                  │    │
│  │  - Protected key storage            │    │
│  │  - Tamper-evident logs              │    │
│  └──────────────┬──────────────────────┘    │
│                 │                           │
│  ┌──────────────▼──────────────────────┐    │
│  │  Local Storage                      │    │
│  │  - Encrypted private keys           │    │
│  │  - Recovery metadata                │    │
│  │  - Policy configs                   │    │
│  └──────────────┬──────────────────────┘    │
│                 │                           │
│  ┌──────────────▼──────────────────────┐    │
│  │   AI Agent                          │    │
│  │  - Monitor backup health            │    │
│  │  - Detect anomalies                 │    │
│  │  - Trigger recovery flow            │    │
│  └──────────────┬──────────────────────┘    │
└─────────────────┼───────────────────────────┘
                  │
       ┌──────────▼──────────┐
       │   Swarm Network     │
       │  - Backup manifests │
       │  - Recovery state   │
       │  - Encrypted refs   │
       └─────────────────────┘
                  │
       ┌──────────▼──────────┐
       │   Ethereum / ENS    │
       │  - Device identity  │
       │  - Recovery policy  │
       │  - Smart contracts  │
       └─────────────────────┘
```

## How It Works

1. User initializes wallet on Raspberry Pi
2. Device creates device identity, stores keys in protected local storage
3. Backup manifests and recovery metadata uploaded to Swarm
4. Umia agent periodically checks data availability and state integrity
5. If data is missing or stale → agent triggers recovery via trusted device policy
6. All actions logged in tamper-evident logs
7. Current state compared against Swarm backup

---

## SWOT Analysis

### Strengths
- Solves real problem: people lose access not from hacks but from lost/stale backups
- Clear sponsor integration — each sponsor has a distinct role
- Tangible hardware demo — 3D printed case with ETHPrague logo
- Novel concept: "self-healing" is not done in wallet space
- Strong one-liner for judges

### Weaknesses
- **Lack of blockchain depth** — currently more IoT-security than Ethereum project
- Umia agent scope too narrow ("checks backups" sounds weak)
- No DeFi interaction — misses ETHPrague's core focus
- Hardware dependency — if Pi breaks, demo fails
- 4 people might be too much for this scope

### Opportunities
- Add DeFi layer: wallet interacts with protocols on Ethereum/Base
- Agent can do predictive recovery and anomaly detection
- Multi-sig recovery policy via smart contracts
- Partnership potential with Umia and SpaceComputer post-hackathon

### Threats
- Other teams may have flashier demos
- Hardware issues at the venue (power, connectivity)
- Judges may question "where's the blockchain?"
- Time constraints — 36 hours is tight for hardware + software

---

## Recommendations

### 1. Add DeFi Layer (Critical for ETHPrague)

Current project is hardware wallet + backups. Need Ethereum integration:

- **On-chain verification:** Store backup hash on Ethereum (or Swarm) — proves backup integrity without revealing data
- **DeFi interaction:** Wallet signs transactions for Uniswap/Aave/Lido directly from Pi
- **Multi-sig recovery:** Smart contract requires 2-of-3 approvals for recovery
- **Recovery policy as code:** Solidity contract defines who can trigger recovery and under what conditions

### 2. Strengthen AI Agent

Upgrade from "backup checker" to intelligent agent:

- **Predictive recovery:** "Your backup hasn't been updated in 30 days, old keys may be compromised — recommend migration"
- **Anomaly detection:** "Someone tried to change recovery policy from unknown IP"
- **Multi-sig enforcement:** Agent facilitates 2-of-3 approval for sensitive operations
- **Automated rebalancing:** Voice command → agent rebalances portfolio across DeFi protocols

### 3. Team Roles (4 people)

| Role | Person | Responsibility |
|------|--------|---------------|
| **Embedded/Hardware** | Dev 1 | Raspberry Pi setup, SpaceComputer integration, 3D-printed case |
| **Backend/Agent** | Dev 2 | Umia agent logic, Swarm integration, recovery flow engine |
| **Frontend/Demo** | Dev 3 | Telegram bot or web UI, log visualization, demo script |
| **Blockchain/ENS** | Dev 4 | Smart contracts, ENS integration, on-chain verification |

### 4. 5-Minute Demo Script

| Time | Person | Content |
|------|--------|---------|
| 0:00-1:00 | Person 1 | Problem: "$2.5B lost to access failure in crypto" |
| 1:00-3:00 | Person 2 | Live demo: initialize wallet, create backup, upload to Swarm |
| 3:00-5:00 | Person 3 | Simulate data loss → agent detects → recovery flow → device restored |
| 5:00-5:30 | Person 4 | Vision, roadmap, ask |

### 5. Pre-Hackathon Checklist

- [ ] Order/buy Raspberry Pi (or bring your own)
- [ ] Set up Swarm account and test uploads
- [ ] Install SpaceComputer on Pi
- [ ] Design and print 3D case (with ETHPrague + Ethereum logo)
- [ ] Prepare "breakage tool" — script that simulates data loss
- [ ] Register ENS name for the device (e.g., `mywallet.eth`)
- [ ] Write Solidity recovery policy contract
- [ ] Test full recovery flow end-to-end
- [ ] Prepare pitch deck (3 slides max)

### 6. Key Metrics for Judges

- Recovery time: how fast does self-healing trigger?
- Decentralization: how many centralized dependencies removed?
- Security: what attack vectors does this prevent vs. standard hardware wallets?
- UX: how simple is recovery for non-technical users?

---

## What Makes This Different

**Standard hardware wallets:**
- Store private keys offline
- Sign transactions
- Hope you wrote down your seed phrase correctly

**Our device:**
- Stores private keys offline ✓
- Signs transactions ✓
- Actively monitors backup health ✓
- Verifies backup integrity via Swarm ✓
- Auto-recovers if data is missing/stale ✓
- Tamper-evident audit logs ✓
- Device-bound identity via SpaceComputer ✓
- Human-readable name via ENS ✓

**Key differentiation:** *"Not just storing keys — guaranteeing that your wallet stays recoverable and verifiable over time."*

---

## Post-Hackathon Vision

**Month 1-2:** Mainnet launch, security audit, SpaceComputer partnership
**Month 3-4:** Ethereum + Base integration, DeFi protocol connections
**Month 5-6:** Multi-sig recovery, institutional custody angle
**Month 7-8:** Consumer product, e-commerce integration with Swarm storage

**Investor metrics:**
- TVL secured by self-healing wallets
- Recovery success rate
- Number of active devices
- Gas savings from batch recovery operations

---


- Raspberry Pi Wallet проект: [[Pi-Wallet-Connection]], [[Raspberry-Pi-WalletConnect]]

## Links

- Original notes: [[ETHPrague meetup]]
- Algorand Hack Berlin project: [[AlgoRand-Hack-Berlin]]

---
*Created: 2026-05-01*

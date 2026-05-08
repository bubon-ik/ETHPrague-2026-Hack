# 🤖 CLAUDE.md — Agent Coding Rules & Project Conventions

> **Project:** HardWallet AI Agent — Vault (on GoTEE)  
> **Runtime:** Embedded JavaScript (QuickJS/Duktape) & Rust (Secure World)  
> **Purpose:** Defines agent behavioral rules, coding standards, and architectural constraints.

---

## 🎯 Role of This File

This file instructs any AI coding assistant working in this repository. Read this file **before touching any source code**.

1. What this project is and what it does
2. Hard constraints that **must never be violated**
3. Coding conventions and patterns to follow
4. Hardware/Platform context for low-level work

---

## 🧠 Project Overview

**Vault** is a privacy-first AI agent embedded inside a hardware cryptocurrency wallet.

- **Agent:** Runs entirely on-device inside a restricted embedded JS runtime.
- **Hardware:** Runs inside ARM TrustZone **Secure World** on a USB Armory MK II via **GoTEE**.
- **No raw network access** — all external calls go through firmware-provided APIs.
- **Security:** Private keys never leave the HSM; physical button confirmation required for all state-changing actions.

---

## 🔒 Hard Constraints — Never Violate

### Security
1. **No private key access** — never reference `wallet.privateKey` or seed phrases in code.
2. **No data exfiltration** — never call `fetch()` or raw network APIs. Use firmware-provided `rpc.call()`, `price.get()`, etc.
3. **Confirmation gate** — every `wallet.sign()` MUST be preceded by `await ui.confirm()`.
4. **No logging of sensitive data** — sanitize addresses and amounts in `logger.js`.

### Runtime
5. **ES2022 compatibility only** — target QuickJS/Duktape; no Node.js built-ins in `src/`.
6. **No external dependencies** in `src/` — code must be self-contained or use firmware built-ins.
7. **Rust (#![no_std])** — any hardware-level code in `src/main.rs` must be bare-metal Rust.

---

## 📐 Coding Conventions (JavaScript)

- **Language:** JavaScript (ES2022+), strict mode (`"use strict"`)
- **Module system:** ES Modules (`import`/`export`)
- **File naming:** `camelCase.js` for source, `kebab-case.test.js` for tests
- **Max file length:** 200 lines
- **Error Handling:** Every async firmware call must be wrapped in `try/catch`.

---

## 🔄 Development Workflow

- **Agent Dev:** `npm run agent` (Interactive REPL)
- **Scenario Tests:** `npm run scenario` or `npm run scenario:real`
- **UI Dev:** `npm run ui:start`
- **Hardware Dev:** `./docker/build.sh` -> `./scripts/flash-sd.sh`

---

## 🛠️ Hardware Platform Context (GoTEE/Rust)

The applet is a pure `(method, input) → output` function dispatched over a TCP/JSON bridge on `10.0.0.1:4000`.

- **Trusted OS:** Go/TamaGo unikernel in Secure World **system mode**.
- **Trusted Applet:** Rust `#![no_std]` in Secure World **user mode** (`src/main.rs`).
- **USB Enumeration:**
    - `SE Blank 6ULL`: SDP mode (BootROM failure).
    - `CDC Ethernet (ECM)`: Trusted OS up.

See the full "GoTEE Rust Starter" context in `README.md` for low-level debugging.

---

*Last updated: ETH Prague 2026 · Vault AI Agent v1.0.0*

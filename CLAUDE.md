# 🤖 CLAUDE.md — Agent Coding Rules & Project Conventions

> **Project:** HardWallet AI Agent — ETH Prague 2026  
> **Runtime:** Embedded JavaScript (QuickJS/Duktape compatible)  
> **Purpose:** Defines agent behavioral rules, coding standards, and architectural constraints for AI assistants building this codebase.

---

## 🎯 Role of This File

This file instructs any AI coding assistant (Claude, Gemini, GPT, etc.) working in this repository. Read this file **before touching any source code**. It defines:

1. What this project is and what it does
2. Hard constraints that **must never be violated**
3. Coding conventions and patterns to follow
4. How to structure new features

---

## 🧠 Project Overview

**Vault** is a privacy-first AI agent embedded inside a hardware cryptocurrency wallet. It:

- Runs entirely on-device inside a restricted embedded JS runtime (QuickJS/Duktape)
- Has **no raw network access** — all external calls go through firmware-provided APIs
- Manages Ethereum transactions, ENS domains, and conditional automation rules
- Never exposes or logs private keys or seed phrases
- Requires physical button confirmation for all state-changing actions

See `PROMPT.md` for the full agent specification and `SKILL.md` for capability details.

---

## 🔒 Hard Constraints — Never Violate

These rules apply to ALL code in this repository. Violations are **blocking**.

### Security
1. **No private key access** — never reference `wallet.privateKey`, seed phrases, or mnemonics anywhere in code. HSM handles all signing via `wallet.sign(tx)`.
2. **No data exfiltration** — never call `fetch()`, `XMLHttpRequest`, `WebSocket`, or any raw network API. Only `rpc.call()`, `price.get()`, `ens.*`, `history.get()` from firmware are allowed.
3. **Confirmation gate** — every call to `wallet.sign()` MUST be preceded by `await ui.confirm()` returning `true`. No exceptions.
4. **Input sanitization** — all user-supplied addresses, amounts, and ENS names must pass through `security/validator.js` before reaching any action handler.
5. **No logging of sensitive data** — `logger.js` must never log addresses beyond the first 6 / last 4 chars, amounts only to 4 decimal places, and never transaction hashes with full signatures.

### Runtime Constraints
6. **ES2022 compatibility only** — target QuickJS/Duktape; no `async/await` beyond ES2022 spec. No DOM APIs. No Node.js built-ins (`fs`, `path`, `crypto` — use firmware APIs instead).
7. **No external dependencies** — no `npm install` of third-party packages. All code must be self-contained or use firmware-provided built-ins.
8. **Memory frugality** — avoid large in-memory data structures. The context window manager (`agent/context.js`) enforces a max of 20 messages; do not bypass this.

---

## 📐 Coding Conventions

### General
- **Language:** JavaScript (ES2022+), strict mode (`"use strict"`)
- **Module system:** ES Modules (`import`/`export`) — QuickJS supports this natively
- **File naming:** `camelCase.js` for source, `kebab-case.test.js` for tests
- **Max file length:** 200 lines — split larger files into focused modules
- **Max function length:** 40 lines — extract helpers aggressively

### Code Style
```javascript
// ✅ GOOD — explicit, typed-by-comment, short functions
/**
 * Resolve an ENS name to an Ethereum address.
 * @param {string} name - ENS name (e.g. "vitalik.eth")
 * @returns {Promise<string|null>} resolved address or null
 */
export async function resolveEns(name) {
  const sanitized = validateEnsName(name);
  if (!sanitized) return null;
  return ens.resolve(sanitized);
}

// ❌ BAD — no JSDoc, no validation, silent failure
export async function resolve(n) {
  return ens.resolve(n);
}
```

### Error Handling
- Every async function that calls a firmware API must wrap in `try/catch`
- Errors must be surfaced to the user via `ui.render()` — never swallowed silently
- Use the structured error format:
```javascript
throw new AgentError('ERR_GAS_EXCEEDED', 'Gas cost exceeds 15% of tx value', { gasRatio });
```

### Constants
- All chain IDs, contract addresses, RPC method names, and config values go in `src/utils/constants.js`
- Never hardcode addresses or numbers inline

### Testing
- Every action handler must have a corresponding test file in `tests/`
- Tests use mock firmware APIs from `firmware/mock/`
- Minimum test coverage: **happy path + 2 edge cases per function**
- Test files follow: `describe('moduleName') > it('should ...')`

---

## 🗂️ Module Responsibilities

| Module                    | Responsibility                                      | Do NOT add here         |
|---------------------------|-----------------------------------------------------|-------------------------|
| `agent/index.js`          | Boot loop, message dispatch                         | Business logic          |
| `agent/router.js`         | Intent → handler mapping                            | API calls               |
| `agent/context.js`        | Conversation history, rolling window                | UI rendering            |
| `actions/*.js`            | One action per file, full flow with confirmation    | Intent parsing          |
| `automation/parser.js`    | NL → structured rule, no side effects               | Rule execution          |
| `automation/scheduler.js` | Poll conditions, trigger actions                    | Rule parsing            |
| `security/validator.js`   | All input validation, sanitization, risk scoring    | Business logic          |
| `rpc/client.js`           | Thin wrapper around `rpc.call()`                    | Business logic          |
| `ui/render.js`            | Firmware UI bridge only                             | Data fetching           |
| `utils/logger.js`         | Structured logging, no sensitive data               | Network calls           |

---

## 🔄 Adding a New Feature — Checklist

When adding any new capability:

- [ ] Add intent class to the table in `PROMPT.md` §Intent Classification Reference
- [ ] Add handler entry to `agent/router.js`
- [ ] Create action file in `src/actions/` (or sub-folder)
- [ ] Add input validation in `security/validator.js` if new input types introduced
- [ ] Add mock response in `firmware/mock/` if new firmware API used
- [ ] Write tests in `tests/` (happy path + 2 edge cases minimum)
- [ ] Update `docs/API.md` if new firmware API surface is documented
- [ ] Update `docs/ARCHITECTURE.md` data flow diagram

---

## 🚦 Response Quality Gates

Before committing any code, verify:

1. `eslint src/` — zero errors
2. All tests pass: `node --experimental-vm-modules tests/run.js`
3. No `console.log` in production code — use `logger.js` only
4. No hardcoded addresses, amounts, or API keys
5. Every `wallet.sign()` call is guarded by `ui.confirm()`

---

## 📚 Related Files

| File            | Purpose                                               |
|-----------------|-------------------------------------------------------|
| `PROMPT.md`     | Agent superprompt — identity, capabilities, formats   |
| `SKILL.md`      | Detailed skill breakdowns and example flows           |
| `docs/ARCHITECTURE.md` | System design & data flow                    |
| `docs/SECURITY.md`     | Threat model & security guarantees           |
| `docs/API.md`          | Firmware API reference                       |
| `docs/EXAMPLES.md`     | Worked conversation examples                 |

---

*Last updated: ETH Prague 2026 · Vault AI Agent v1.0.0*

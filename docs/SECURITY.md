# 🔒 Security — Vault AI Agent

> **ETH Prague 2026** | Threat Model & Security Guarantees

---

## Security Model Summary

Vault operates on the principle of **minimal trust surface**:
- Private keys **never leave** the HSM
- **No network access** except via firmware-controlled RPC APIs
- **Every state change** requires physical user confirmation
- **All user data** is encrypted at rest on-device

---

## Threat Model

### In-Scope Threats

| Threat | Mitigation |
|---|---|
| Malicious natural language injection | Input sanitized via `security/validator.js`; commands never eval'd |
| Phishing (fake ENS names) | ENS names validated + checksum-verified; address shown in preview |
| Silent automation execution | All rule executions require `ui.confirm()` by default |
| Gas drain attack | `checkGasRatio()` blocks tx where gas > 15% of value |
| Physical button flooding | Rate limited to 5 signing attempts/minute |
| Large accidental transfers | Balance threshold warning at 90% of balance |
| Malformed transaction data | All params validated before reaching `wallet.sign()` |
| Log exfiltration | `logger.js` truncates addresses and never logs full tx data |

### Out-of-Scope Threats

- Physical device theft (handled by HSM PIN + hardware encryption)
- Firmware vulnerabilities (handled by device manufacturer)
- Supply chain attacks on hardware (out of software scope)

---

## Hard Security Constraints

The following rules are **non-negotiable** and enforced in code:

1. **No private key access** — `wallet.sign()` is the only signing interface; private keys never touch JS runtime
2. **No raw network calls** — `fetch()`, `WebSocket`, `XMLHttpRequest` are unavailable in the embedded runtime
3. **Confirmation gate** — every call to `wallet.sign()` is preceded by `await ui.confirm()`
4. **Input validation** — all user input passes through `security/validator.js` before use
5. **Gas cap** — transactions where `gas_cost / tx_value > 0.15` require explicit override
6. **Rate limiting** — max 5 sign attempts per 60-second sliding window
7. **Encrypted storage** — automation rules and audit logs encrypted at rest
8. **No sensitive logging** — addresses masked to `0x1234...5678`, amounts to 4dp

---

## Audit Log

All transaction events (signed, rejected, failed) are recorded in `security/audit.js`:

```javascript
{
  ts: "2026-05-08T17:00:00Z",
  type: "send",
  status: "signed",
  to: "0xd8dA...6045",      // masked
  asset: "ETH",
  amount: 0.1,
  txHash: "0x1234567890...", // first 10 chars only
  network: "Ethereum Mainnet"
}
```

Audit logs are never transmitted off-device.

---

## Input Validation Reference

| Input Type | Validator | Rules |
|---|---|---|
| Ethereum address | `validateAddress()` | Must match `0x[0-9a-fA-F]{40}` |
| ENS name | `validateEnsName()` | `[a-z0-9-]+\.eth`, max 63 chars per label |
| Token amount | `validateAmount()` | Must be > 0, numeric, within balance |
| Automation condition | `parseRule()` | Structured parsing, no eval |
| Free text | `sanitizeString()` | Strip control chars, max 200 chars |

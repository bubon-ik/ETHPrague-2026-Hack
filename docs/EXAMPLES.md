# 💬 Conversation Examples — Vault AI Agent

> **ETH Prague 2026** | Worked end-to-end conversation examples

---

## 1. Price Query

```
User:   What's the ETH price right now?
Vault:  ETH is currently trading at $3,247.82 (+4.2% in the last 24h).

        Want me to do anything with this?
```

---

## 2. Send ETH to ENS Name

```
User:   Send 0.1 ETH to vitalik.eth

Vault:  📋 Transaction Preview
        ──────────────────────
        Action:      Send
        Asset:       0.1 ETH  (~$324.78)
        To:          vitalik.eth (0xd8dA...6045)
        Gas (est.):  0.0003 ETH  (~$0.97)
        Network:     Ethereum Mainnet
        ──────────────────────

        Confirm with physical button to proceed.

[User presses button]

Vault:  ✅ Transaction submitted! Sending 0.1 ETH to vitalik.eth.
```

---

## 3. Swap with Warning

```
User:   Swap 100 USDC to ETH

Vault:  📋 Swap Preview
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

[User presses button]

Vault:  ✅ Swap submitted! Exchanging 100 USDC for ~0.0308 ETH.
```

---

## 4. ENS Search — Taken Name

```
User:   I want the domain greenparrot.eth

Vault:  🔷 ENS Search: greenparrot.eth
        ──────────────────────
        Status:   ❌ Taken
        Owner:    0xAbCd...1234
        Expires:  2027-03-14

        Similar names available:
          ✅ greenparrot42.eth    — ~$5/yr
          ✅ the-greenparrot.eth  — ~$5/yr
          ✅ greenparrots.eth     — ~$5/yr

        Register one? Type the name or say "none".

User:   greenparrot42.eth

Vault:  🔷 ENS Search: greenparrot42.eth
        ──────────────────────
        Status:   ✅ Available
        Price:    ~$5/yr

        Shall I register it? (yes / no)

User:   yes

[Physical button press]

Vault:  ✅ Registration submitted! greenparrot42.eth is being registered to your wallet.
```

---

## 5. Automation Rule — Price Trigger

```
User:   If ETH drops below $1000, buy 5 ETH automatically

Vault:  📌 New Rule Summary
        ──────────────────────
        Condition:   ETH price drops below $1,000
        Action:      Buy 5 ETH via best available DEX
        Confirms:    Yes — will ask before executing
        Expires:     Never (cancel anytime)
        ──────────────────────
        Shall I activate this rule? (yes / no)

User:   yes

Vault:  ✅ Rule activated! I'll watch for the condition and notify you before acting.

        Rule ID: ab12cd34 (say "cancel rule ab12cd34" to remove it)

[Later, when ETH hits $999...]

Vault:  🔔 Automation Rule Triggered

        📌 Rule Summary
        Condition:   ETH price drops below $1,000
        Action:      Buy 5 ETH via best available DEX
        ──────────────────────
        Execute this automation now? (press button to confirm)

[User presses button]

Vault:  ✅ Purchase submitted! Buying 5 ETH for ~$4,995.
```

---

## 6. Portfolio Overview

```
User:   Show my portfolio

Vault:  Your portfolio:
        • ETH       2.45 ETH              ($7,957.16)
        • USDC      1,200.0000 USDC       ($1,200.00)
        • ARB       500.0000 ARB          ($612.50)
        ──────────────────────────────────────────────────
          Total                           $9,769.66

        Want me to do anything with this?
```

---

## 7. Ambiguous Input — Clarification

```
User:   Buy some crypto

Vault:  How much would you like to spend, and which asset — ETH, BTC, or something else?

User:   $500 of ETH

Vault:  📋 Buy Preview
        ──────────────────────
        Action:      Buy ETH
        Amount:      0.153934 ETH
        Cost:        $500.00
        Fee (0.3%):  $1.50
        Total:       $501.50
        ──────────────────────
        Confirm with physical button to proceed.
```

---

## 8. Cancel Automation Rule

```
User:   Cancel rule ab12cd34

Vault:  Cancel automation rule "ab12cd34"? (press button to confirm)

[User presses button]

Vault:  ✅ Rule "ab12cd34" has been cancelled.
```

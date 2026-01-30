# Embedded Wallet — Fastlane Design Philosophy

> **Core Insight:** Wallet as a function, not a product.  
> **Principle:** Users don't "adopt wallets" — wallets adopt users.

---

## 🎯 What This Wallet IS

A **trust engine disguised as a checkout companion**.

- Zero-friction VC acceptance (one tap, default YES)
- ReceiptVC as primary asset (not identity cards)
- Contextual UI (appears when relevant, not a global dashboard)
- Invisible infrastructure that builds trust

---

## ❌ What This Wallet Is NOT (Fastlane Kill List)

- ~~Full wallet UI upfront~~
- ~~Credential taxonomy screens~~
- ~~DID management~~
- ~~Key backup explanations~~
- ~~Multi-chain support~~
- ~~NFT language~~
- ~~"Self-sovereign identity" messaging~~

All of that is slowlane vanity early on.

---

## 🔑 Critical Functionalities

### 1. Zero-Friction VC Acceptance
- One tap: "Save for proof"
- Default = Yes
- No keys, no setup ceremony, no jargon
- Auto-created on first consent
- Bound to device/browser profile

### 2. ReceiptVC as Primary Asset
Not identity — proof of:
- Purchase
- Delivery
- Transaction integrity
- Dispute resolution

Zimbabwe pain solved:
- Fake receipts
- Cash disputes
- WhatsApp screenshots
- Corrupt delivery confirmations

### 3. Contextual Wallet UI
Wallet ONLY appears at:
- Checkout
- Order tracking
- Delivery confirmation
- Dispute / Refund

**No "My Credentials" dashboard upfront.**  
Users think: "This app keeps my proof safe"  
Not: "I am managing credentials"

### 4. Driver Verification (Killer Trust Loop)
```
Driver shows QR → Customer scans → Sees:
  • Driver identity VC
  • Employer / platform
  • Escrow release status

One tap: "Confirm delivery"
```

This loop:
- Confirms delivery
- Releases escrow
- Finalizes ReceiptVC
- Locks transaction history

**This is the "aha" moment for Zimbabwe.**

### 5. Escrow Hook (Signal, Not Banking)
You do NOT build banking. You build:
- A **release signal**
- Triggered by delivery confirmation or time fallback

Control the chokepoint, not the industry.

### 6. Silent SSI → OIDC Bridge
Login via:
- Existing session
- Device trust
- VC continuity

No OTPs, passwords, SMS.  
Zimbabwe reality: SMS unreliable, SIM swaps common.

### 7. Progressive Portability (Later)
Only AFTER trust established:
- "Export your wallet"
- "Install full wallet app"
- "Use across platforms"

Don't sell the exit before value is captured.

### 8. Consent-as-UX (Not Compliance)
Consent is:
- Visual
- Contextual
- One-tap

Example: "Save this receipt for proof & refunds?"

Not checkbox walls or legal jargon.

---

## 🔄 The Fastlane Flywheel

```
1. Transaction happens
2. ReceiptVC issued
3. Embedded wallet stores it
4. Delivery verification completes trust
5. Escrow releases
6. Next transaction is frictionless
7. Businesses prefer your platform
8. Network effect locks in
```

**You are not selling tech. You are selling: "Proof that works."**

---

## Implementation Files

| Component | Location |
|-----------|----------|
| Wallet UI | `credo-ui/wallet/` |
| Portal Checkout | `credo-ui/portal/` |
| VC Issuance | `src/services/CredentialIssuanceService.ts` |
| Driver Verifier | Create `/verify/{token}` endpoint |

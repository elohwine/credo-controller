# Credentis MVP — Fastlane Commerce Trust for Zimbabwe

> **Mission:** Build trust infrastructure disguised as checkout.  
> **Flow:** Catalog → Cart → Checkout → ReceiptVC → Embedded Wallet → Driver Verification

---

## 🎯 The Fastlane Insight

Zimbabwe already transacts digitally (EcoCash, ZESA, food, airtime). The blocker is **trust at handover**, not demand.

**ReceiptVC + driver verification collapses uncertainty at the exact moment it matters.**

---

## ✅ What We ARE Building (MVP Scope)

| Component               | Status     | Description                                  |
| ----------------------- | ---------- | -------------------------------------------- |
| **Product Catalog**     | ✅ Exists  | SKU/service list with merchant trust badge   |
| **Cart & Checkout**     | ✅ Exists  | Cart total, delivery option, EcoCash payment |
| **EcoCash Payment**     | ✅ Exists  | C2B payment via webhook confirmation         |
| **ReceiptVC Issuance**  | ✅ Exists  | Signed VC on payment success                 |
| **Embedded Wallet**     | ✅ Exists  | Wallet UI for credential storage             |
| **Driver Verification** | 🏗 Enhance | Mobile web verifier for delivery handover    |
| **Consent Flow**        | 🏗 Enhance | "Save verified receipt to wallet?" prompt    |

---

## ❌ What We Are NOT Building (MVP)

These come AFTER proof of trust works:

- ~~HR & Payroll modules~~
- ~~Inventory automation~~
- ~~AI agents / ACK-ID~~
- ~~Gen-UI workflows~~
- ~~Multi-wallet interoperability~~
- ~~Analytics dashboards~~
- ~~Regulatory co-signing~~
- ~~ZIMRA Tax Clearance~~

---

## 📊 Success Metrics (Pilot KPIs)

| Metric                      | Target                           |
| --------------------------- | -------------------------------- |
| ReceiptVC issuance rate     | ≥90% of successful payments      |
| Save-to-wallet rate         | ≥40% of purchases                |
| Driver verification success | ≥90% where attempted             |
| Dispute reduction           | Qualitative improvement in pilot |

---

## 🏛 Architecture (MVP Stack)

```
┌─────────────────────┐     ┌─────────────────────┐
│     Portal UI       │     │     Wallet UI       │
│     (Next.js)       │     │     (Nuxt)          │
│     Port 5000       │     │     Port 4000       │
│                     │     │                     │
│ • Catalog/Checkout  │     │ • VC Storage ONLY   │
│ • Consent Prompt    │     │ • Credential List   │
│ • Issuer/Verifier   │     │ • Embedded Display  │
└──────────┬──────────┘     └──────────┬──────────┘
           │                           │
           ▼                           ▼
┌─────────────────────────────────────────────────┐
│             Credo Controller API                │
│                  Port 3000                      │
│  ┌─────────────────────────────────────────┐   │
│  │ EcoCashWebhook → ReceiptVC              │   │
│  │ WhatsApp Commerce → Cart                │   │
│  │ Trust Engine → TrustCard                │   │
│  │ OIDC4VCI → Credential Offers            │   │
│  └─────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────┘
                         │
             ┌───────────┴───────────┐
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  Holder Agent   │     │   SQLite DB     │
│   Port 6000     │     │  persistence.db │
└─────────────────┘     └─────────────────┘
```

---

## 🔑 Fastlane Principles

1. **Solve real pain with immediate leverage** — Trust at handover
2. **Consent-driven VC issuance** — Optional, not forced
3. **Embedded wallet first** — No key ceremonies for users
4. **Anchor value to high-tension moments** — Delivery verification

---

## 📅 12-Week Sprint Overview

| Weeks | Focus                                   |
| ----- | --------------------------------------- |
| 1-2   | Foundations, EcoCash sandbox            |
| 3-5   | Checkout UI, ReceiptVC, embedded wallet |
| 6-7   | Driver verification, QA                 |
| 8-10  | Pilot onboarding & soft launch          |
| 11-12 | Analytics, go/no-go decision            |

See [MVP_IMPLEMENTATION_GUIDE.md](./docs/MVP_IMPLEMENTATION_GUIDE.md) for detailed breakdown.

---

## 🚀 Quick Start

```bash
# Start full stack
docker compose -f docker-compose.full.yml up

# Services
# - API:    http://localhost:3000/docs
# - Wallet: http://localhost:4000
# - Portal: http://localhost:5000
```

---

## 📚 Documentation

- [MVP Implementation Guide](./docs/MVP_IMPLEMENTATION_GUIDE.md) — 12-week sprints
- [ReceiptVC Schema](./docs/RECEIPTVC_SCHEMA.md) — JSON-LD spec
- [Pilot Playbook](./docs/PILOT_PLAYBOOK.md) — Merchant onboarding
- [EcoCash Integration](./ECOCASH_QUICKSTART.md) — Payment setup

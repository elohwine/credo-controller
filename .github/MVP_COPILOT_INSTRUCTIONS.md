# MVP Copilot Instructions — Credentis Fastlane Pilot

> **Focus:** Cart → Pay → ReceiptVC → Embedded Wallet → Driver Verification  
> **Anti-scope:** HR, Payroll, AI Agents, Gen-UI, Multi-wallet

---

## 🎯 Mission Statement

Build trust infrastructure for Zimbabwe e-commerce:

- **ReceiptVC** proves payment to drivers and customers
- **Embedded wallet** stores proof without key ceremonies
- **Driver verification** collapses trust at handover moment

---

## 🏗 UI Architecture (IMPORTANT)

| UI         | Port | Role                                                     |
| ---------- | ---- | -------------------------------------------------------- |
| **Portal** | 5000 | Checkout, catalog, consent prompt, issuer/verifier flows |
| **Wallet** | 4000 | VC storage and embedding ONLY (no checkout logic)        |

**Consent Flow:** Portal shows "Save verified receipt to wallet?" → on consent, issues VC offer → Wallet accepts and stores.

---

## ✅ MVP Scope (ONLY work on these)

| Feature              | Files                                                   | Status     |
| -------------------- | ------------------------------------------------------- | ---------- |
| EcoCash Payment      | `src/controllers/webhooks/EcoCashWebhookController.ts`  | ✅ Done    |
| ReceiptVC Issuance   | `src/controllers/finance/FinanceController.ts`          | ✅ Done    |
| WhatsApp Commerce    | `src/controllers/whatsapp/WhatsAppPayloadController.ts` | ✅ Done    |
| Wallet UI (Storage)  | `credo-ui/wallet/`                                      | ✅ Done    |
| Portal UI (Checkout) | `credo-ui/portal/`                                      | ✅ Done    |
| Driver Verifier      | `src/controllers/oidc/OidcVerifierController.ts`        | 🏗 Enhance |
| Consent Flow         | **Portal UI checkout**                                  | 🏗 Enhance |

---

## ❌ DO NOT Work On (Out of MVP Scope)

- `src/controllers/finance/PayrollController.ts` — Skip
- `src/ai/` — Skip all AI/ACK agent code
- HR workflows (onboarding, leave, expenses)
- Gen-UI / workflow-to-UI schemas
- Multi-tenant billing
- ZIMRA / statutory integrations
- Advanced revocation (status lists)

---

## 🔑 Key Files for MVP

### Backend

```
src/controllers/webhooks/EcoCashWebhookController.ts  # Payment webhook
src/controllers/finance/FinanceController.ts          # Receipt issuance
src/controllers/whatsapp/WhatsAppPayloadController.ts # WhatsApp commerce
src/services/modelRegistry.ts                         # ReceiptVC schema
src/services/CredentialIssuanceService.ts             # VC creation
```

### Frontend

```
credo-ui/wallet/                # Holder wallet (Nuxt)
credo-ui/portal/                # Issuer portal (Next.js)
```

### Config

```
docker-compose.full.yml         # Full stack
.env.local                      # Environment vars
```

---

## 📋 MVP Development Rules

1. **Ask before adding scope** — If a feature isn't in MVP_GOALS.md, check first
2. **Test payment flow first** — EcoCash → ReceiptVC is the core primitive
3. **Consent is optional** — Don't force wallet actions on users
4. **Driver verification is mobile-first** — Keep verifier UI minimal
5. **No feature creep** — "Did this reduce friction at checkout or delivery?"

---

## 🧪 Quick Test Commands

```bash
# Start full stack
docker compose -f docker-compose.full.yml up

# Test EcoCash webhook (simulated)
curl -X POST http://localhost:3000/webhooks/ecocash \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-webhook-secret" \
  -d '{"transactionId":"TEST-123","status":"SUCCESS","amount":25.00}'

# Check ReceiptVC issued
curl http://localhost:3000/credentials/issued
```

---

## 🚀 Sprint Focus

See `tasklist.md` for current sprint tasks.  
See `docs/MVP_IMPLEMENTATION_GUIDE.md` for 12-week plan.

---

## 💡 Fastlane Principles (Always Apply)

1. **Solve real pain** — Trust at handover moment
2. **Consent-driven** — Optional VC storage
3. **Embedded wallet first** — No seed phrases for users
4. **Anchor to high tension** — Delivery verification is the wedge

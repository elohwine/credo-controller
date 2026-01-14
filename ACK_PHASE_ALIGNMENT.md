# ACK ID / Agentic Commerce / ACK Pay / Gen-UI — Phase Alignment (Repo ↔ Master Plan)

## Purpose
This document realigns the **Phase 0–7 ACK master plan** (ACK ID, agentic commerce, ACK Pay, Gen-UI) with this repository’s existing **Phase 1–10 roadmap** and current implementation.

It answers:
- What already exists in the repo (code-level anchors)
- What is missing for the ACK plan
- How to sequence implementation so it remains compliant with relevant standards (OID4VCI, OID4VP, W3C VC DM, Bitstring Status List)
---

## Official ACK Protocol References

### Source Documentation (agentcommercekit.com + GitHub)
| Resource | URL | Purpose |
|----------|-----|---------|
| ACK-ID Introduction | https://www.agentcommercekit.com/ack-id/introduction | Agent identity protocol spec |
| ACK-ID Identity Model | https://www.agentcommercekit.com/ack-id/identity-model | Owner→Agent relationship model |
| ACK-Pay Introduction | https://www.agentcommercekit.com/ack-pay/introduction | Payment protocol spec |
| ACK-Pay Server-Initiated Sequence | https://www.agentcommercekit.com/ack-pay/server-initiated-sequence | Payment flow diagrams |
| ACK Core Concepts | https://www.agentcommercekit.com/overview/concepts | Design principles |
| ACK GitHub (reference impl) | https://github.com/agentcommercekit/ack | Monorepo with demos + SDKs |
| ACK npm packages | https://www.npmjs.com/package/@agentcommercekit/ack-id | TypeScript SDK |

### ACK-ID — What It Solves
ACK-ID establishes **verifiable agent identities** with clear ownership chains:

1. **Verifiable Ownership**: Auditable cryptographic link from legal entities (Owners) → autonomous agents
2. **Secure Authentication**: Agents prove identity to other parties using DIDs + VCs
3. **Privacy Preservation**: Agents disclose only necessary identity attributes

**Key Artifacts:**
- `ControllerCredential` — proves one DID controls another (Owner DID → Agent DID)
  - Schema: `{ credentialSubject: { id: agentDid, controller: ownerDid } }`
- DID Document service endpoints for agent discovery + communication
- Identity standards: W3C DIDs + VCs (portable, not platform-locked)

**ACK-ID TypeScript SDK:** `@agentcommercekit/ack-id`
```typescript
import { createControllerCredential, isControllerCredential, getControllerClaimVerifier } from '@agentcommercekit/ack-id'
```

### ACK-Pay — What It Solves
ACK-Pay enables **agent-driven payment flows** with verifiable receipts:

1. **Payment Initiation**: Structured `PaymentRequest` with options (402 Payment Required pattern)
2. **Execution Flexibility**: Works across payment rails (fiat, stablecoins, mobile money)
3. **Receipt Verification**: Cryptographically signed `PaymentReceiptCredential` as proof
4. **Human Oversight**: Integration points for approvals + risk management

**Key Artifacts:**
- `PaymentRequest` — structured request with payment options
  - Schema: `{ id, description?, paymentOptions: [{ id, amount, decimals, currency, recipient, paymentService?, receiptService? }] }`
- `PaymentReceiptCredential` — VC proving payment satisfaction
  - Schema: `{ type: ['VerifiableCredential', 'PaymentReceiptCredential'], credentialSubject: { paymentRequestToken, paymentOptionId, metadata? } }`

**ACK-Pay TypeScript SDK:** `@agentcommercekit/ack-pay`
```typescript
import { createPaymentReceipt, verifyPaymentReceipt, createSignedPaymentRequest } from '@agentcommercekit/ack-pay'
```

### ACK Design Principles (from agentcommercekit.com)
- **Open Standards**: W3C DIDs + VCs for vendor neutrality
- **Cryptographic Trust**: No central authority dependency for identity/payment verification
- **Compliance-Ready**: KYC/KYB integration points without sacrificing agility
- **Human Oversight**: Strategic human approvals in automated flows
## Terminology: “AI agent” vs “Credo agent” (avoid conflicts)
This repo already uses “agent” to mean an **Aries/Credo agent** (e.g., `Agent`, `TenantAgent`, `cliAgent.ts`, and the `/agent/*` controller). To avoid collisions:

- **Credo agent** (preferred terms in code/docs): `CredoAgent`, `TenantAgent`, “wallet agent”, “issuer/verifier agent”.
- **AI agent** (LLM automation) (preferred terms in code/docs): `AiAssistant`, `AutomationAgent`, `CopilotAgent`, “LLM assistant”. Avoid naming anything just `Agent`.

Practical conventions (recommended):
- **Folders**: place AI/LLM automation under `src/ai/` or `src/automation/` (never under `src/agent/` which is already taken by Aries/Credo semantics).
- **Files/classes**: prefix AI classes with `Ai`/`Automation` (e.g., `AiPolicyService.ts`, `AutomationWorkflowRunner.ts`) and reserve `Agent*` for Aries/Credo controllers.
- **HTTP routes**: reserve `/agent/*` for Credo-agent operations. Use `/ai/*` or `/automation/*` for LLM features.
- **Types**: if you need an “agent-like” abstraction for LLMs, name it `AiAgent` or `Assistant`, and alias Aries agent types explicitly (e.g., `type CredoAgent = Agent<...>`).

## Repo phase baseline (as implemented / documented)
Source of truth: `PROJECT_OVERVIEW.md` + `tasks.md`.

- **Phase 1**: WhatsApp commerce + Quote→Invoice→Payment→Receipt VC
- **Phase 2**: Trust engine + regulator escalation + public verifier
- **Phase 3–5**: Payroll/statutory + HR/Ops + reporting
- **Phase 6**: Trust/compliance integrations (revocation, portal policy config)
- **Phase 7**: Inventory + cryptographic event chaining
- **Phase 8**: Wallet/portal wiring completeness
- **Phase 9**: Production hardening (audit, validation, metrics, backup, DB tuning)
- **Phase 10**: Future (Vault, key rotation, “advanced revocation”, multi-region)

## ACK master plan (Phase 0–7) — interpreted minimally
Because the master plan is broader than the repo’s current phase naming, here’s the *minimal* set of deliverables implied by the ACK plan that map cleanly to standards and existing primitives:

- **Phase 0 (Foundations)**: agent identity + registry model, provisioning, auth/token lifecycle, policy boundaries, signed audit events, safe ops controls.
- **Phase 1 (Commerce)**: Cart→Pay→Receipt VC and merchant attestations.
- **Phase 2 (Trust)**: portable trust cards + evidence + verification UX.
- **Phase 3 (Delegation/ACK pattern)**: delegated agents, consent/delegation credentials, permissions/spend limits, non-repudiation.
- **Phase 4 (ACK Pay)**: payment-provider abstraction + initiation + idempotent webhooks.
- **Phase 5 (Gen-UI)**: a “workflow-to-UI” orchestration layer.
- **Phase 6 (Compliance/Regulators)**: revocation, audit, evidence bundles, regulator modes.
- **Phase 7 (Scale/Operations)**: secrets/KMS, tenant isolation, operational controls, DR.

If you want, we can rename these to match your exact Phase 0–7 wording; this is the simplest interpretation that fits the repo’s existing architecture.

---

## What exists today (code anchors)

### Identity, tenancy, agents
- Multi-tenant provisioning + token issuance: `src/controllers/multi-tenancy/MultiTenancyController.ts`
- Tenant public discovery docs:
  - Issuer discovery: `src/controllers/oidc/OidcMetadataController.ts` (`/tenants/{tenantId}/.well-known/openid-credential-issuer`)
  - Verifier discovery: `src/controllers/oidc/OidcMetadataController.ts` (`/tenants/{tenantId}/.well-known/openid-verifier`)
- Agent primitives (token issuance, sign/verify): `src/controllers/agent/AgentController.ts`

### OID4VC issuance & verification
- Issuance flow (Credo OpenId4VcIssuer module used behind a controller): `src/controllers/oidc/OidcIssuerController.ts`
- Verification flow (Credo OpenId4VcVerifier): `src/controllers/oidc/OidcVerifierController.ts`

### Commerce + finance + workflows
- WhatsApp payload/cart: `src/controllers/whatsapp/WhatsAppPayloadController.ts`
- Webhook ingestion (EcoCash): `src/controllers/webhooks/EcoCashWebhookController.ts`
- Workflow engine orchestration: `src/controllers/workflow/WorkflowController.ts` + services under `src/services/`
- Finance issuance endpoints: `src/controllers/finance/FinanceController.ts`

### Trust + regulator + verification
- Trust score endpoints: `src/controllers/trust/TrustController.ts`
- Public verification: `src/controllers/regulator/VCVerifierController.ts`
- Escalations: `src/controllers/regulator/EscalationController.ts`

### Revocation (current)
- Basic status list create/update endpoints: `src/controllers/trust/RevocationController.ts`
  - Note: current implementation is “state passed in request” (MVP), not a full published Status List VC endpoint.

### Production hardening
- Audit logs (middleware + DB): see Phase 9 notes in `tasks.md` and migrations like `migrations/011_create_audit_logs.sql`
- Metrics/health: `src/controllers/metrics/MetricsController.ts`

---

## Alignment matrix (ACK Phase → Repo Phase)

### ACK Phase 0 (Foundations) → Repo Phase 9 + Phase 10 + “kernel”
Status: **Partially exists**
- ✅ Multi-tenancy, tenant provisioning, tenant-scoped issuer/verifier metadata exists.
- ✅ Agent primitives exist (sign/verify/token issuance).
- ✅ Audit/metrics/DB hardening exists.
- ❌ Missing: a first-class **Agent Registry / Control Plane** (provision/list/rotate/suspend agents; map them to orgs/roles; policy-bound tokens).
- ❌ Missing: **per-tenant secrets/KMS integration** (Vault/HSM) and rotation (Phase 10 mentions it).

### ACK Phase 1 (Commerce) → Repo Phase 1
Status: **Largely exists**
- ✅ WhatsApp commerce and quote/invoice/receipt flows exist (workflow driven).
- ✅ EcoCash webhook triggers receipt issuance.
- ⚠️ Gap: “Cart → Pay → ReceiptVC” is present, but “ReceiptVC as canonical proof-of-payment” needs consistent schema + revocation model.

### ACK Phase 2 (Trust) → Repo Phase 2 + Phase 6
Status: **Exists**
- ✅ Trust engine + evidence + public verifier page exists.
- ✅ Regulator escalation packages exist.
- ⚠️ Gap: trust should be tied to agent identity + policy violations + payment settlement confidence.

### ACK Phase 3 (Delegation / ACK pattern) → Repo Phase 4–6 (new work)
Status: **Missing**
- ❌ Missing: delegated agents + consent/delegation artifacts (e.g., ConsentVC / DelegationVC).
- ❌ Missing: policy engine (permissions/spend limits/workflow constraints) enforced at API boundaries and in workflows.
- ❌ Missing: non-repudiation model that links “who authorized” → “what was done” → “what VC was issued”.

### ACK Phase 4 (ACK Pay) → Repo Phase 1 (payment) + Phase 10 (hardening)
Status: **Partially exists**
- ✅ EcoCash adapter + webhook processing exists.
- ⚠️ Gaps:
  - payment initiation API standardization (provider-agnostic interface)
  - idempotency enforcement (webhook dedupe) for receipt issuance
  - reconciliation states + dispute flows

### ACK Phase 5 (Gen-UI) → Repo Phase 8 (UI wiring) + new orchestration layer
Status: **Missing**
- ✅ Portal and wallet wiring exists.
- ❌ Missing: a Gen-UI “workflow-to-UI schema” layer and renderer (forms, approvals, evidence capture) driven by workflow definitions.

### ACK Phase 6 (Compliance/Regulators) → Repo Phase 2 + Phase 6
Status: **Partially exists**
- ✅ Regulator escalation exists.
- ✅ Audit logging exists.
- ⚠️ Gap: revocation should move from “local delete / listData passed in request” to a standards-aligned **published status list credential** model.

### ACK Phase 7 (Scale/Operations) → Repo Phase 9 + Phase 10
Status: **Partially exists**
- ✅ Metrics, health checks, backup script exist.
- ❌ Missing: external secrets, key rotation, multi-region plan, and tenant deletion cleanup semantics.

---

## Standards grounding (what to align to)

### OID4VCI (OpenID for Verifiable Credential Issuance 1.0)
Use this to keep issuance wallet-compatible:
- Support Credential Offer by value or reference (`credential_offer` / `credential_offer_uri`).
- Support pre-authorized code grant (`urn:ietf:params:oauth:grant-type:pre-authorized_code`) with optional PIN (`tx_code` / user PIN) if you need step-up auth.
- Provide issuer metadata at `/.well-known/openid-credential-issuer` per tenant.

### OID4VP (OpenID for Verifiable Presentations 1.0)
Use this for verifier flows:
- Create authorization requests that result in `vp_token` responses (commonly `direct_post`).
- Support presentation definitions (DIF Presentation Exchange / DCQL where applicable).

### W3C Verifiable Credentials Data Model v2.0
Use this as the canonical VC structure:
- Ensure `type`, `issuer`, `credentialSubject`, and validity fields are correct.
- Use `credentialStatus` to reference revocation/suspension/status.

### Bitstring Status List v1.0 (W3C Recommendation; replaces “StatusList2021” naming)
Use this for revocation/suspension at scale:
- VC contains `credentialStatus` of type `BitstringStatusListEntry`.
- Entry references a `statusListCredential` which is a VC of type `BitstringStatusListCredential` containing `credentialSubject.encodedList`.
- Validate status by dereferencing `statusListCredential` and checking `statusListIndex`.

### VC JOSE/COSE
Use this to keep JWT VC handling correct:
- Follow the media type and verification expectations for JWT VCs/VPs.

---

## Gap list (explicit "missing components" for ACK)

### 1) Agent Registry / Control Plane (missing) — ACK-ID alignment
Deliverable: tenant/org-scoped registry of agents with lifecycle, aligned with ACK-ID patterns.

**ACK-ID requirements mapping:**
- On agent provision: create agent DID (did:key or did:web), link to owner via `ControllerCredential`
- Store controller relationship: `{ agentDid, ownerDid, controllerCredentialJwt, roles, status }`
- Publish agent DID document with service endpoints

**APIs (aligned with ACK-ID):**
```text
POST   /ai/agents/provision        → Creates agent DID + issues ControllerCredential
GET    /ai/agents                  → List agents for tenant
GET    /ai/agents/{id}             → Get agent details + controller chain
POST   /ai/agents/{id}/rotate-keys → Key rotation (re-issue ControllerCredential)
POST   /ai/agents/{id}/suspend     → Suspend agent (optionally revoke credentials)
DELETE /ai/agents/{id}             → Decommission agent + revoke all credentials
```

**Files to create:**
- `src/ai/agents/AiAgentRegistry.ts` — registry service (note: `ai/` folder per naming convention)
- `src/controllers/ai/AiAgentController.ts` — HTTP endpoints
- `src/persistence/AiAgentRepository.ts` — database operations
- `migrations/XXX_create_ai_agents.sql` — agent ↔ tenant ↔ owner linkage

**ACK SDK integration:**
```typescript
import { createControllerCredential, isControllerCredential } from '@agentcommercekit/ack-id'

// On provision:
const agentDid = await tenantAgent.dids.create({ method: 'key' })
const controllerCred = createControllerCredential({
  subject: agentDid,
  controller: ownerDid,
  issuer: tenantIssuerDid
})
const signedJwt = await signCredential(controllerCred, { ... })
```

### 2) Delegation + Consent (missing) — ACK-ID extension
Deliverable: model that allows org to delegate authority to an "agent" with hard policy boundaries.

**Artifacts (ACK-ID compatible):**
- `DelegationCredential` (custom type extending ControllerCredential pattern)
  ```json
  {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    "type": ["VerifiableCredential", "DelegationCredential"],
    "issuer": { "id": "did:web:merchant.example" },
    "credentialSubject": {
      "id": "did:key:agent...",
      "controller": "did:web:merchant.example",
      "scopes": ["catalog.write", "payment.initiate"],
      "limits": { "maxAmountPerTx": 1000, "currency": "USD" },
      "validUntil": "2026-01-01T00:00:00Z"
    }
  }
  ```
- `ConsentReceiptCredential` — proving user consent for a specific action

**Enforcement:**
- Middleware reads delegation from JWT claims or resolves agent's credentials
- Policy engine denies out-of-scope actions

### 3) Policy engine (missing)
Deliverable: a policy layer used by workflows and controllers.
- Inputs: actor, tenant, action, resource, amount, context.
- Outputs: allow/deny + reason + required step-up verification.

### 4) ACK Pay adapter interface (partially present) — ACK-Pay alignment
Deliverable: provider-agnostic payment interface implementing ACK-Pay patterns.

**ACK-Pay interface to implement:**
```typescript
// src/ai/payments/AckPayAdapter.ts
interface AckPayAdapter {
  /** Create a signed PaymentRequest per ACK-Pay spec */
  createPaymentRequest(params: {
    id: string
    description?: string
    paymentOptions: PaymentOption[]
    expiresAt?: Date
    serviceCallback?: string
  }): Promise<{ paymentRequestToken: string }>
  
  /** Initiate payment via provider (EcoCash, MNEE, etc.) */
  initiatePayment(params: {
    paymentRequestToken: string
    paymentOptionId: string
    payerDid: string
  }): Promise<{ status: 'pending' | 'success' | 'failed', providerRef: string }>
  
  /** Verify payment and issue PaymentReceiptCredential */
  verifyAndIssueReceipt(params: {
    paymentRequestToken: string
    paymentOptionId: string
    providerRef: string
    payerDid: string
    metadata?: Record<string, unknown>
  }): Promise<{ receiptCredentialJwt: string }>
}

// PaymentOption schema (from ACK-Pay)
interface PaymentOption {
  id: string
  amount: number | string
  decimals: number
  currency: string
  recipient: string
  network?: string
  paymentService?: string
  receiptService?: string
}
```

**EcoCash adapter implementation:**
```typescript
// src/ai/payments/adapters/EcoCashAckAdapter.ts
import { createPaymentReceipt, createSignedPaymentRequest } from '@agentcommercekit/ack-pay'

export class EcoCashAckAdapter implements AckPayAdapter {
  async verifyAndIssueReceipt(params) {
    // Verify with EcoCash API
    const verified = await this.verifyEcoCashPayment(params.providerRef)
    if (!verified) throw new Error('Payment not verified')
    
    // Issue ACK-Pay receipt
    const receipt = createPaymentReceipt({
      paymentRequestToken: params.paymentRequestToken,
      paymentOptionId: params.paymentOptionId,
      issuer: this.issuerDid,
      payerDid: params.payerDid,
      metadata: { ecocashRef: params.providerRef, ...params.metadata }
    })
    return { receiptCredentialJwt: await signCredential(receipt, { ... }) }
  }
}
```

**Idempotency + webhook dedupe:**
- Require idempotency key on initiation
- Store `providerRef` → `receiptCredentialId` mapping to prevent duplicate receipts
- Reconciliation state machine: `initiated → pending → paid/failed → refunded`

### 5) Standards-aligned revocation publication (partially present)
Deliverable: publish `BitstringStatusListCredential` per tenant, and embed `credentialStatus` entries in issued VCs.
- Requires:
  - storage for status lists (tenant-scoped)
  - endpoint to dereference list
  - VC issuance attaches `BitstringStatusListEntry` with random `statusListIndex`

### 6) External secrets + rotation (missing; Phase 10)
Deliverable: Vault/HSM integration for JWT secrets and signing keys.

## Recommended implementation sequence (action plan)

### Step 1 — Normalize the public OIDC surface (high impact)
Goal: make wallet interoperability predictable.
- Ensure tenant discovery docs and issuance/verification endpoints are consistent and documented (single “blessed” base path).
- Acceptance:
  - A wallet can resolve issuer metadata → follow offer → exchange token → receive credential end-to-end using only tenant public URLs.

### Step 2 — Implement tenant-scoped status lists (Bitstring Status List)
Goal: unlock real revocation.
- Add persistence-backed list store.
- Add endpoints to retrieve a tenant’s status list credential and to update status bits.
- Ensure issued credentials include `credentialStatus` entries.

### Step 3 — Agent Registry + Delegation MVP
Goal: enable “ACK pattern” delegation without Gen-UI yet.
- Add an agent registry model + endpoints.
- Add `DelegationVC` issuance and verification.
- Enforce a small set of scopes (e.g., `catalog.write`, `payment.initiate`, `workflow.execute`, `credential.issue`).

### Step 4 — ACK Pay interface stabilization
Goal: provider abstraction with operational safety.
- Define a payment provider interface.
- Standardize initiation endpoint, idempotency keys, and webhook dedupe.

### Step 5 — Gen-UI layer (workflow-driven forms)
Goal: reduce custom UI code per workflow.
- Define a minimal JSON schema for “actions that require user input”.
- Render in portal; store submissions; attach to workflow context and audit logs.

### Step 6 — Harden secrets + audit non-repudiation
Goal: production-grade custody and compliance.
- Vault-backed secrets.
- Optional: sign audit events with an agent key.

---

## Acceptance criteria (spec-grounded)

### Issuance (OID4VCI)
- Issuer metadata is publicly discoverable per tenant at `/.well-known/openid-credential-issuer`.
- Credential offers can be delivered by value or URI.
- Pre-authorized code flow works with a holder DID binding.

### Verification (OID4VP)
- Verifier can create a presentation request and validate responses using `vp_token`.
- Presentation definitions are validated and enforced.

### Revocation (Bitstring Status List)
- Issued VCs include `credentialStatus` pointing to a tenant-published `statusListCredential`.
- Verifiers can dereference the list and validate the bit at `statusListIndex`.

### Delegation
- A delegated agent cannot exceed its declared scopes/limits.
- All privileged actions emit auditable events with correlation IDs.

---

## Open questions (tight, to unblock exact alignment)
1) In your ACK plan, is the “Agent Registry” **tenant-internal** (merchant-managed) or **platform-level** (IdenEx-managed) with optional regulator visibility?
2) For delegation, do you want **VC-based delegation** (portable) as the source of truth, or **JWT-only** delegation (faster) with VCs as optional receipts?
3) For ACK Pay, should payment initiation be **synchronous** (request returns provider checkout/USSD) or **fully async** with a workflow state machine?

---

## Practical Implementation Tasks (ACK SDK Integration)

Based on the official ACK documentation and SDK, here are concrete tasks for Credo platform integration:

### Task 1: Install ACK SDK packages
```bash
# Add to package.json dependencies
pnpm add @agentcommercekit/ack-id @agentcommercekit/ack-pay agentcommercekit
```

### Task 2: Create ACK-ID Agent Provisioning Service
**File:** `src/ai/agents/AiAgentProvisioningService.ts`
```typescript
import { createControllerCredential, isControllerCredential } from '@agentcommercekit/ack-id'
import { inject, injectable } from 'tsyringe'
import type { Agent } from '@credo-ts/core'

@injectable()
export class AiAgentProvisioningService {
  constructor(@inject('Agent') private agent: Agent) {}

  async provisionAgent(params: {
    ownerDid: string
    label: string
    roles: string[]
    tenantId: string
  }) {
    // 1. Create agent DID
    const { didState } = await this.agent.dids.create({ method: 'key' })
    const agentDid = didState.did!

    // 2. Issue ControllerCredential linking owner → agent
    const controllerCred = createControllerCredential({
      subject: agentDid,
      controller: params.ownerDid,
      issuer: params.ownerDid
    })

    // 3. Sign the credential
    const signedJwt = await this.signWithOwner(controllerCred, params.ownerDid)

    // 4. Store in registry
    await this.storeAgentRecord({
      agentDid,
      ownerDid: params.ownerDid,
      controllerCredentialJwt: signedJwt,
      roles: params.roles,
      tenantId: params.tenantId,
      status: 'active'
    })

    return { agentDid, controllerCredentialJwt: signedJwt }
  }
}
```

### Task 3: Create ACK-Pay Adapter for EcoCash
**File:** `src/ai/payments/adapters/EcoCashAckPayAdapter.ts`
```typescript
import { createPaymentReceipt, createSignedPaymentRequest } from '@agentcommercekit/ack-pay'

export class EcoCashAckPayAdapter {
  async createPaymentRequest(params: {
    id: string
    amount: number
    currency: string
    merchantDid: string
  }) {
    const request = await createSignedPaymentRequest({
      id: params.id,
      paymentOptions: [{
        id: 'ecocash-option',
        amount: params.amount,
        decimals: 2,
        currency: params.currency,
        recipient: params.merchantDid,
        network: 'ecocash',
        paymentService: this.serviceUrl
      }]
    }, {
      issuer: params.merchantDid,
      signer: this.getJwtSigner(),
      algorithm: 'ES256K'
    })
    return request
  }

  async issueReceipt(params: {
    paymentRequestToken: string
    paymentOptionId: string
    ecocashRef: string
    payerDid: string
    merchantDid: string
  }) {
    const receipt = createPaymentReceipt({
      paymentRequestToken: params.paymentRequestToken,
      paymentOptionId: params.paymentOptionId,
      issuer: params.merchantDid,
      payerDid: params.payerDid,
      metadata: { ecocashRef: params.ecocashRef }
    })
    // Sign and return
    return await this.signCredential(receipt)
  }
}
```

### Task 4: Wire ACK-Pay to EcoCash Webhook
**Update:** `src/controllers/webhooks/EcoCashWebhookController.ts`
```typescript
// After payment verified:
const receiptJwt = await this.ackPayAdapter.issueReceipt({
  paymentRequestToken: workflow.context.paymentRequestToken,
  paymentOptionId: 'ecocash-option',
  ecocashRef: payload.sourceReference,
  payerDid: workflow.context.buyerDid,
  merchantDid: workflow.context.merchantDid
})

// Store + issue via OID4VCI or return verifier link
await this.credentialIssuanceService.issueReceiptVC(receiptJwt, workflow.context)
```

### Task 5: Create Agent Registry Migration
**File:** `migrations/014_create_ai_agents.sql`
```sql
CREATE TABLE IF NOT EXISTS ai_agents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_did TEXT NOT NULL UNIQUE,
  owner_did TEXT NOT NULL,
  controller_credential_jwt TEXT NOT NULL,
  roles TEXT NOT NULL, -- JSON array
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'revoked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX idx_ai_agents_tenant ON ai_agents(tenant_id);
CREATE INDEX idx_ai_agents_owner ON ai_agents(owner_did);
CREATE INDEX idx_ai_agents_status ON ai_agents(status);
```

### Task 6: End-to-End Demo Script
**File:** `scripts/ack-demo.ts`
```typescript
// Demonstrates: provision agent → ACK-Pay payment → receipt VC issuance
import { AiAgentProvisioningService } from '../src/ai/agents/AiAgentProvisioningService'
import { EcoCashAckPayAdapter } from '../src/ai/payments/adapters/EcoCashAckPayAdapter'

async function runAckDemo() {
  // 1. Provision agent for merchant
  const agent = await provisioningService.provisionAgent({
    ownerDid: merchantDid,
    label: 'Commerce Agent',
    roles: ['payment.initiate', 'credential.issue'],
    tenantId
  })
  console.log('Agent provisioned:', agent.agentDid)

  // 2. Create payment request
  const paymentRequest = await ackPayAdapter.createPaymentRequest({
    id: `order-${Date.now()}`,
    amount: 1000, // $10.00
    currency: 'USD',
    merchantDid
  })
  console.log('Payment request:', paymentRequest.paymentRequestToken)

  // 3. Simulate EcoCash payment (would come from webhook in production)
  const receipt = await ackPayAdapter.issueReceipt({
    paymentRequestToken: paymentRequest.paymentRequestToken,
    paymentOptionId: 'ecocash-option',
    ecocashRef: 'ECOCASH-REF-123',
    payerDid: buyerDid,
    merchantDid
  })
  console.log('Receipt issued:', receipt)
}
```

---

## ACK Protocol Compliance Checklist

### ACK-ID Compliance
- [ ] Agent DIDs are created on provision (did:key or did:web)
- [ ] ControllerCredential issued for each agent linking to owner
- [ ] Agent DID documents include service endpoints
- [ ] Controller chain is verifiable (isControllerCredential validation)
- [ ] Agent status lifecycle managed (active/suspended/revoked)
- [ ] Key rotation re-issues ControllerCredential

### ACK-Pay Compliance
- [ ] PaymentRequest follows ACK-Pay schema (id, paymentOptions, etc.)
- [ ] PaymentRequest is signed as JWT token
- [ ] PaymentReceiptCredential issued on payment confirmation
- [ ] Receipt includes paymentRequestToken + paymentOptionId
- [ ] Receipt metadata includes provider reference (ecocashRef/mneeTxHash)
- [ ] Receipts are verifiable via standard VC verification
- [ ] Idempotency enforced (no duplicate receipts for same payment)

### Integration Points
- [ ] ACK SDK packages installed (@agentcommercekit/ack-id, @agentcommercekit/ack-pay)
- [ ] Agent registry database schema created
- [ ] ACK-Pay adapter interface implemented for EcoCash
- [ ] Webhook handler issues PaymentReceiptCredential
- [ ] Portal UI can display agent/receipt status
- [ ] Verifier accepts PaymentReceiptCredential type


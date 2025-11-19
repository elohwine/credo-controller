Clear — we’re on the same page.

You want to **reuse only the walt.id UI code (web wallet + issuer/verifier portal frontends)** and **wire those UIs to *your* backend (Credo Controller)** — *not* run or depend on the walt.id backend stack or APIs. That’s totally doable and a sensible path: you get polished UI/UX components out-of-the-box and keep control of business logic, credentials issuance, verification, and data flows in your own backend.

Below is a robust, actionable implementation guide that shows exactly how to do that: which repos to clone, the layout of changes, the endpoints your Credo backend must implement (with example payloads), where to edit the UIs to point to your endpoints, test sequences, security considerations, plus a prioritized TODO list so you can start coding immediately.

---

# Summary plan (one line)

## 🧠 Full Copilot Prompt – “Walt ID UI → Credo Backend Integration”

> **Purpose:**
> We want to reuse `walt.id`’s latest open-source UI components — the **Demo Wallet**, **Dev Wallet**, and **Web Portal** — as the front-end layer for our **Credo SSI Platform**.
> The goal is to demonstrate issuance + verification of digital receipts and other verifiable credentials in the Zimbabwean open-banking context (EcoCash APIs, later other African integrations).
> Our Credo backend already supports **multi-tenant agent management**, so each organization/issuer/verifier runs in an isolated tenant context.
> We will **not** use any `walt.id` backend or APIs, only their **UI layer**, re-wired to our backend endpoints.

---

### 🏗️ Project setup tasks Copilot should execute

1. **Clone the latest maintained monorepo (correct source)**

   ```bash
   git clone https://github.com/walt-id/waltid-identity.git
   cd waltid-identity
   ```

   Confirm presence of:

   * `waltid-applications/waltid-web-wallet`
   * `waltid-applications/waltid-web-portal`
   * Each contains a `package.json` and local README.

2. **Install dependencies**

   * Detect correct package manager (`pnpm` > `yarn` > `npm`).
   * Run from root:

     ```bash
     pnpm install
     ```
   * Optionally build shared packages if the monorepo requires it.

3. **Run individual apps locally for quick testing**

   ```bash
   cd waltid-applications/waltid-web-wallet && pnpm dev
   cd waltid-applications/waltid-web-portal && pnpm dev
   ```

   The wallet now listens on `http://localhost:4001` and the portal on `http://localhost:5000`.

4. **Create environment files (`.env.local`) for each app**
   Replace any `WALT_BACKEND` URLs with our **Credo backend** endpoints:

   **Demo / Dev Wallet**

   ```ini
   NEXT_PUBLIC_WALLET_BACKEND_URL=http://localhost:8085/api/wallet
   NEXT_PUBLIC_ISSUER_URL=http://localhost:8085/api/issuer
   NEXT_PUBLIC_VERIFIER_URL=http://localhost:8085/api/verifier
   NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000
   NEXT_PUBLIC_TENANT_ID=default
   ```

   **Web Portal**

   ```ini
   NEXT_PUBLIC_PORTAL_BASE_URL=http://localhost:5000
   NEXT_PUBLIC_ISSUER_API_BASE=http://localhost:8085/api/issuer
   NEXT_PUBLIC_VERIFIER_API_BASE=http://localhost:8085/api/verifier
   NEXT_PUBLIC_TENANT_ID=default
   ```

   > Copilot: ensure the UIs read these values dynamically so we can later change `TENANT_ID` per organization or sub-domain.

5. **Wire all REST calls in the UI to our backend instead of Walt ID**

   * Search for any `fetch(...)`, `axios`, or `api.ts` references pointing to:

     * `walt.id`, `wallet-api`, or `community.walt.id`
   * Replace base URLs with `process.env.NEXT_PUBLIC_*` variables above.
   * Example change:

     ```diff
     - const res = await fetch(`${WALT_BACKEND}/api/credentials`, { ... })
     + const res = await fetch(`${process.env.NEXT_PUBLIC_ISSUER_URL}/credentials`, { ... })
     ```
   * Keep the existing request/response structures identical wherever possible.

6. **Wire Credo backend (for local UI )**
scan backend for routes to map to new frontend

  
 

7. **Multi-tenant integration design**

   * Every API route must read a `tenantId` (from request body, header, or env).
   * Backend must namespace data (credentials, keys, agent configs) by `tenantId`.
   * Example pattern:

     ```
     /api/{tenantId}/issuer/...
     /api/{tenantId}/verifier/...
     ```
   * UI automatically injects tenant context:

     ```js
     const tenant = process.env.NEXT_PUBLIC_TENANT_ID || "default";
     fetch(`${BASE_URL}/api/${tenant}/issuer/credential-offers`, {...})
     ```
   * Copilot: generate helper function `withTenant(path)` to simplify calls.

8. **Verify connectivity**

   * Run mock backend (`node mock-credo.js`).
   * Start wallets & portal; issue + verify test credential.
   * Observe network requests hitting `localhost:8085`.

9. **Prepare for real backend (Credo)**

   * Replace mock with real Credo controllers exposing same endpoints.
   * Ensure CORS enabled for `localhost:4001` and `:5000`.
   * Add JWT/API-key auth for each tenant’s agents.
   * Map EcoCash payment confirmations → VC issuance flow (e.g., PaymentReceipt VC).
   * Implement revocation, audit logging, and DIDComm notifications later.

10. **Optional enhancements**

    * Integrate **Vercel AI SDK Gen UI** once base wiring works:

      * Add `@vercel/ai` dependency.
      * Build a Generative UI assistant to explain receipts, verify data provenance, and guide users.
      * Each Gen-UI response must query verifiable data from Credo’s API before presenting.
      * Keep wallet keys fully client-side; never expose in AI prompt context.

---

### ✅ Deliverables Copilot should auto-generate

1. **Folder structure** (inside existing Credo repo)

   ```
   /credo-ui/
     ├─ /waltid-web-wallet/     (cloned UI)
     ├─ /waltid-web-portal/     (cloned UI)
     ├─ .env.local              (configured for Credo)
     └─ mock-credo.js           (temporary backend)
   ```

2. **Environment files** ready for `.gitignore` commit.

3. **Code patches** replacing `walt.id` URLs with our Credo endpoints.

4. **Helper module** (`withTenant()`) for multi-tenant routing.

5. **README.md** summarizing:

   * Setup commands
   * Local testing
   * Tenant configuration
   * Deployment steps (Vercel / Render / AWS)

6. **Optional**: script to deploy the wallet + portal to Vercel for public demos.

---

### 🧩 Success criteria

* UI apps launch cleanly (`npm run dev` shows no missing backend errors).
* All network requests go to `localhost:8085/api/*` (not walt.id).
* Multi-tenant header/param included in all requests.
* Issuance → Acceptance → Verification flows complete with mock backend.
* Codebase easily migrates to real Credo backend later (no UI rewrite).
* Ready for future **Agentic AI integration** layer for verifiable, autonomous transactions.


# Recommended developer approach (fastest path to test)

1. **Mock Credo endpoints first** (fast): implement small mock server (Express/Node) that implements the `POST /issuer/credential-offers` and `POST /issuer/issue` routes and returns static offer URL / VC. Point wallet UI to these mocks and verify the UI flows (wallet accepts offer and shows credential). This avoids early complexity of signature keys.

2. **Switch to real Credo implementation**: once UI behavior validated, implement actual issuance (sign VC, push to wallet or return OIDC flow). Use the “direct issue” flow for the MVP (faster than full OIDC4VCI). Later, implement full OIDC flows.

3. **Verifier flow**: mock the `POST /verifier/presentation-requests` and `POST /verifier/verify` endpoints so the verifier UI can request and get a positive verification result from wallets.

4. **Integrate EcoCash**: wire real payment webhook to Credo. On success, Credo calls the `POST /issuer/issue` to create VC and either push to wallet or return an `offerUrl` for the wallet to accept.

---

# Security & UX notes (must do before production)

* **Wallet key management**: since the wallet UI will generate keys locally (good!), ensure you inform users about backup (mnemonic), and provide easy recovery UX if you plan to rely on local keys for demos.
* **Issuance signing keys**: your Credo backend must securely sign VCs — store signer keys in KMS/HSM (do not keep in plain env vars). Implement rotation & use signature schemes compatible with DID method you pick (Ed25519, etc).
* **Consent & clarity**: ensure the wallet UI’s consent screens are not removed — users must knowingly accept credentials. Generative UI later will help explain this.
* **Revocation API**: design a minimal revocation API and ensure verifier checks revocation status (or use short expiry for initial VCs).

---

# Prioritized TODO checklist (copy to issues)

**Phase A — Local UI wiring**

* [ ] Clone `waltid-web-wallet`, `waltid-verifier-portal`.
* [ ] Run each UI locally (`npm install` & `npm run dev`).
* [ ] Search & document config entries that point to backend (issuer/verifier base URLs).

**Phase B - Real Credo endpoints wiring**

* [ ] Implement Credo `POST /issuer/credential-offers` that builds offer & returns `offerUrl`.
* [ ] Implement Credo `POST /issuer/issue` that signs a VC (use waltid-ssikit or your own VC signer) and returns the VC object & wallet deep-link.
* [ ] Implement `POST /verifier/verify` that validates VP (signature + claims + revocation).
* [ ] Ensure web wallet can accept the VC (test with one holder DID).

**Phase D — Payment integration**

* [ ] Integrate EcoCash payment flow & webhook to Credo. On success call `POST /issuer/issue`.
* [ ] Build simple merchant verifier flow (POS web page) that requests VP and verifies.

**Phase E — Hardening & production**

* [ ] Move signing keys to KMS/HSM.
* [ ] Add revocation list & checks.
* [ ] Add audit logs, replay protection for webhooks.
* [ ] Add TLS, rate limits, API keys & auth for issuer endpoints.

NOTE: This plan assumes familiarity with Credo Controller development, VC issuance concepts, and basic React UI editing. Adjust the plan as needed based on your project requirements.

NOTE: UI and API should be in the same repository root/ same project for easier management.
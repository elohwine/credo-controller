# Plan: Mobile & Portal Wallet UX Cleanup

**TL;DR**: Both UIs need a focused cleanup pass grounded in SSI wallet UX best practices. The goal is to reduce cognitive load, eliminate bloat, abstract SSI complexity entirely from end users, and standardize layout/interaction patterns. No new features — surgical improvements to what exists.

---

## Research Findings Summary

### Industry UX Benchmarks (Google Pay, Apple Pay, Coinbase, WhatsApp)

- Single tap/minimal steps; no jargon visible in the primary flow
- Action-first home screen (what should I do now?) not asset-first
- Status-first design: everything has a clear state (pending/done/error)
- Progressive disclosure: simple card → detail on tap
- Contact/org-centric initiation (WhatsApp model)

### SSI-Specific Principles (W3C VC DM 2.0, DIF PE)

- **Credential abstraction**: never expose DID strings, JWTs, or cryptographic proofs to holders
- **Human-readable identity**: show "Issued by Zimbabwe Registry" not `did:web:registry.gov.zw`
- **Minimal disclosure**: show only what matters (credential type, issuer name, valid until)
- **Privacy-first**: warn before sharing; show exactly what data is leaving the wallet
- **Favour abstract claims**: "Age verified: 18+" not "birthDate: 1990-01-01"

### Current UI Audit Problems

**Mobile:**

- Home page triple-fetches org context data independently
- Credential deduplication logic spread across `proofs.tsx`, `inbox.tsx`, `contacts.tsx`
- 3 separate bottom-sheet patterns per page (no shared component)
- Two inbox entry points on home → ambiguous clicks
- Org context switching logic scattered across AppShellMobile + index + auth helpers
- "Workflows" page exposed to holders — raw SSI concept, not user-friendly
- Contacts page: direct VC issuance buttons exposed to holders = SSI leak
- Role nav not enforced at page level (any user can browse to `/finance`)
- No standard credential card — each page reinvents it
- `ModuleGrid` uses sector-derived configs with silent fallback for "custom"

**Portal:**

- Credentials page mode driven by query params `?mode=issuance|verification` — doesn't update URL
- Sector logic fragmented: `SECTOR_CONFIG` arrays + `features.includes()` checks = divergence risk
- Trust score page is stub/incomplete — confuses users
- Layout uses two different UI stacks (Mantine on mobile, Tailwind on portal) with no shared token set
- Org/holder context distinction not enforced in route guards

---

## Plan

### Phase 1: Mobile App Cleanup (1.5 weeks)

**Step 1 — Shared Components (prereq for all others, parallel with Step 2)**

- Create `components/shared/CredentialCard.tsx`: human-readable credential display. Shows: type name (e.g. "National ID"), issuer display name (not DID), valid-until date, status badge. No raw JSON, no DID strings.
- Create `components/shared/BottomSheet.tsx`: single reusable bottom sheet wrapper — replaces the 3+ reinvented `Drawer` patterns in `proofs.tsx`, `contacts.tsx`, `inbox.tsx`.
- Create `components/shared/StatusBadge.tsx`: consistent pending/done/error/expired status chips.
- Modify `lib/format.ts` (or create): centralised `formatDate(iso)`, `formatCredentialType(raw)`, `formatIssuerName(did)` helpers.

**Step 2 — Home Screen (parallel with Step 1)**

- Replace `ModuleGrid` / sector-based card arrays with a simple `PendingActionsCard` + `RecentActivityFeed`.
- Max 3 action cards visible without scroll. Each card: icon, short action label, count badge.
- Remove reconciliation profile / sector label from home — too technical.
- One API call to `/api/inbox/summary` (or derived from existing pending-counts) instead of triple-fetch.
- Keep org context banner but simplify: just org name + role pill, no sector text.
- Files: `pages/index.tsx`, new `components/home/PendingActionsCard.tsx`.

**Step 3 — Bottom Navigation Finalisation** (_depends on Step 1 complete_)

- Holder nav (finalised): **Home → Inbox → Organizations → Proofs → Scan**
- Issuer/admin nav (keep existing): **Home → Finance → Scan → Activity → Team**
- Remove `contacts.tsx` from holder nav (contacts absorbed into Organizations flow).
- Add route guard in `_app.tsx`: issuer-only routes (`/finance`, `/activity`, `/workflows`) redirect holders to `/`.
- Files: `components/layout/BottomNav.tsx`, `pages/_app.tsx`.

**Step 4 — Proofs Tab Redesign** (_depends on Step 1_)

- Replace 3-tab layout (Active/Pending/Archived) with category-based sections: Identity, Payments, Employment, Education, Other.
- Each credential rendered by `CredentialCard`. Tap → `BottomSheet` with detail + actions (Present, Share, Archive).
- Remove "Accepted" / "Pending" raw status text — replace with `StatusBadge`.
- Pending credential offers: move out of proofs tab entirely → into **Inbox**.
- File: `pages/proofs.tsx`, `components/proofs/ProofCard.tsx` → simplified using shared `CredentialCard`.

**Step 5 — Inbox Cleanup** (_depends on Step 1_)

- Single unified inbox. Tabs: **All | Actions | Requests | Receipts**.
- Remove duplicate "Inbox" card from home page (home only shows count badge).
- Replace `Select` filter dropdown with tab pills (matches mobile UX pattern).
- No raw `credentialType` strings visible — use `formatCredentialType()` helper.
- `InboxItem` component: use `StatusBadge`, standardise on `BottomSheet` for detail.
- File: `pages/inbox.tsx`, `components/inbox/InboxItem.tsx`.

**Step 6 — Remove SSI Leakage from Contacts** (_parallel with Step 5_)

- Remove "Issue VC" button from contacts page for holders — VC issuance is org-side only.
- Keep "Pay", "View", "Request Quote/Invoice" actions (these are useful to holders).
- Add "Request Service" CTA → links to org profile in Organizations tab.
- File: `pages/contacts.tsx`.

**Step 7 — Remove / Hide Technical Pages from Holders**

- `pages/workflows.tsx`: guard with `isIssuer` check — redirect holders to `/`.
- Remove from mobile BottomNav (already not in holder nav per Step 3).
- File: `pages/workflows.tsx` top-level guard.

---

### Phase 2: Portal Cleanup (1 week)

**Step 8 — Credential Views** (_depends on Step 1 shared component, parallel with Step 9_)

- Create portal `components/CredentialCard.tsx` (Tailwind variant) following same abstraction: show type name, issuer name, valid-until, status badge. No DID, no JWT.
- Replace raw JSON viewers in `pages/credentials.tsx` with this card.
- File: `portal/components/CredentialCard.tsx`, `portal/pages/credentials.tsx`.

**Step 9 — URL-Stable Navigation** (_parallel with Step 8_)

- `credentials.tsx` mode: replace `?mode=issuance|verification` query param toggle with distinct routes `/credentials/issue` and `/credentials/verify`.
- Or keep single page but fix URL sync: `router.replace({ query: { mode } })` when tab changes.
- File: `portal/pages/credentials.tsx`.

**Step 10 — Dashboard Simplification** (_depends on Step 9_)

- Portal home (`pages/index.tsx`): remove sector config array (`SECTOR_CONFIG`) from the JSX layer — derive it from `features[]` fetched from API.
- Issuer view: 4 clear action cards (Issue, Verify, Manage Org, View Activity). No sector-specific conditional array.
- Holder view: 3 cards (My Credentials, My Requests, Discover Services).
- Guest view: 2 cards (Sign In, Register Org).
- File: `portal/pages/index.tsx`.

**Step 11 — VC Request Inbound Dashboard** (_depends on Step 10_)

- Add `/portal/pages/organizations/requests.tsx` — org admin view of inbound VC requests.
- Uses `GET /api/vc-requests/inbound` (backend exists).
- Table: requester name, VC type, submitted date, status. Row actions: Approve → Issue / Reject.
- File: `portal/pages/organizations/requests.tsx`.

**Step 12 — Portal Route Guards**

- Add auth middleware in `portal/pages/_app.tsx`: check `isAuthenticated()` on every protected route; redirect to `/auth/login`.
- Org-only pages (`/hr/*`, `/payroll/*`, `/finance/*`): check `getActiveOrgId()` present and `orgRole` has permission.
- File: `portal/pages/_app.tsx`.

---

### Phase 3: Cross-Cutting Quality (0.5 weeks)

**Step 13 — Standardise Error & Loading States**

- Both apps: create `components/shared/EmptyState.tsx` and `components/shared/ErrorAlert.tsx`.
- Replace inconsistent `notifications.show` + `Alert` combinations with these.
- Files: both apps, new components.

**Step 14 — Org Context Sync (Mobile)**

- Centralise org sync in `lib/auth.ts`: single `syncOrgContext()` function called from `AppShellMobile.tsx`.
- Remove duplicate calls in `index.tsx` and individual pages.
- File: `mobile/lib/auth.ts`, `mobile/components/layout/AppShellMobile.tsx`, `mobile/pages/index.tsx`.

---

## Relevant Files

**Mobile:**

- `credo-ui/mobile/pages/index.tsx` — home, needs simplification
- `credo-ui/mobile/pages/proofs.tsx` — credential list, needs abstraction
- `credo-ui/mobile/pages/inbox.tsx` — unified inbox, needs tab cleanup
- `credo-ui/mobile/pages/contacts.tsx` — remove holder VC issuance
- `credo-ui/mobile/pages/workflows.tsx` — add holder guard
- `credo-ui/mobile/components/layout/BottomNav.tsx` — nav finalised
- `credo-ui/mobile/components/layout/AppShellMobile.tsx` — consolidate org sync
- `credo-ui/mobile/pages/_app.tsx` — add route guards

**Portal:**

- `credo-ui/portal/pages/index.tsx` — dashboard simplification
- `credo-ui/portal/pages/credentials.tsx` — URL-stable mode, card views
- `credo-ui/portal/pages/organizations/requests.tsx` — NEW: VC request dashboard
- `credo-ui/portal/pages/_app.tsx` — route guards

**New Shared Components (mobile):**

- `credo-ui/mobile/components/shared/CredentialCard.tsx`
- `credo-ui/mobile/components/shared/BottomSheet.tsx`
- `credo-ui/mobile/components/shared/StatusBadge.tsx`

**New Shared Components (portal):**

- `credo-ui/portal/components/CredentialCard.tsx`

---

## Verification

1. **Visual check**: Open mobile app as holder → can you complete "discover org → request VC → track in inbox" without seeing any DID, JWT, or technical SSI term?
2. **Role enforcement**: Browse to `/finance` as a wallet-only user → should redirect to home.
3. **Org context**: Switch org in portal → open mobile → verify context updates within 5s.
4. **Proofs tab**: All credentials show human-readable name + issuer name (not DID).
5. **Inbox**: No duplicate entry points; tabs filter correctly.
6. **No regressions**: `yarn build` passes in both `credo-ui/mobile` and `credo-ui/portal`.

---

## Decisions / Scope Boundaries

- **In scope**: Cleanup, abstraction, layout consistency, navigation structure.
- **Out of scope**: New API endpoints, new features, styling framework migration (keep Mantine on mobile, Tailwind on portal), backend changes.
- **Assumption**: The `CredentialCard` human-readable label mapping (`NationalIDVC` → "National ID") will use a static lookup map initially — no backend schema needed.
- **Assumption**: Org context sync race condition fix is a single consolidation (no state library like Zustand required now).

# Credentis Organization Onboarding — Design Spec

> **Core principle:** An organization is usable before it is fully configured. Onboarding is not a wizard — it is a persistent readiness experience driven by real organizational goals.

## 2026-10-05 — Nobody picks or adds a workflow any more

This supersedes Screen 3 ("Choose First Workflow") and the "Add a workflow" entries in §3 and §8 below; the rest of this spec still holds.

- Setup is a checklist of four steps, the same on the website and the phone: **Say what you do**, **Choose who handles money**, **Pick how you take payments**, **Invite your team**. Each step opens its own window, with "Question 1 of 3" (and the same on the phone, where the organisation list steps aside until you save or cancel). Saving shows a small done screen with **Next** and **Finish later**, so the owner can stop and come back. The page says how many of the four are done.
- The first window asks what the organization does (buys things and pays suppliers · sends people out to do jobs · teaches students · sells to customers, pick all that apply). The second asks who approves and releases money (Owner handles money · Manager, then finance · Director confirms once). Coming back when people are already chosen offers **Keep what is set now**, so saving does not replace them. The third asks how payments are taken (Click n Pay · EcoCash · Practice payments · Not yet).
- Answers are saved on the server with `PUT /organizations/{org}/setup/profile`. The screen does not send a list of workflows to turn on.
- Every organization gets purchase requests, supplier bills and customer payments. Jobs, school fees and counter payments follow from the first answer. Each kind of request opens on its own once what it needs is in place. Setup lists what is still missing under **Kinds of requests**.
- The money answer is set once, on purchase requests. Releasing a job payout, paying a supplier bill, confirming a remittance and issuing a receipt all use the same people (`shared_finance` in `OrgWorkflowActorService`) unless the organization picks someone else for that step. Who does what is one window per category: **Money**, then each kind of request, then **If nobody is chosen**, then **Role cards**, with Back and Next. A money step that still needs a chosen person says who is standing in for now.
- Steps such as who goes out on a job are asked the first time that request is used. They do not block the checklist.
- Portal: `pages/organization/onboarding.tsx`, `setup.tsx`, `actors.tsx`, `utils/orgProfile.ts`. Phone: `pages/settings/org.tsx`, `lib/orgProfile.ts`. Server: `OrgSetupProfileService`, `OrgWorkflowActorService.SHARED_FINANCE_STAGES`.

---

## 1. Journey Overview

```
SIGN UP
   ↓
CREATE ORGANIZATION      [Screen 1]
   ↓
AUTOMATIC PROVISIONING   Wallet · DIDs · Issuer · Verifier · Credential models
   ↓
WELCOME                  [Screen 2]
   ↓
ONE QUESTION PER WINDOW  [Screen 3 — what you do, then who handles money, then how you take payments]
   ↓
SETUP CHECKLIST          [Screen 4 — come back any time; Finish later is always there]
   ↓
FIRST REAL REQUEST
   ↓
ORGANIZATION SETUP CENTER   [Persistent — deepens as org grows]
```

---

## 2. Screens

### Screen 1 — Create Organization

Minimal. Don't ask for DID, sector, issuer config, or workflow types.

- Organization name
- Country
- Your name
- Work email
- `[ Create organization ]`

### Screen 2 — You're Ready to Start

After provisioning. Shown immediately after creation.

```
✓ Organization created
✓ Organizational identity created
✓ Trust infrastructure ready
✓ You are the administrator

Let's set up how your organization works.

[ Get started ]   [ Explore first ]
```

> If domain verification is async: show `⏳ Verifying domain…` instead of `✓ Trust infrastructure ready`. Do not block next step.

### Screen 3 — One question per window

Superseded by the 2026-10-05 note at the top. There is no workflow picker.

Each window asks one thing, with a few choices and a Save button:

1. What does the organization do?
2. Who approves and releases money?
3. How are payments taken?

Saving one answer opens a short done screen: **Next** continues, **Finish later** returns to the checklist.

### Screen 4 — Setup checklist

The home for setup, on the website and the phone. Four lines, each with Start or Change:

```
Setup                                    2 of 4 done

Say what you do                          Change
Choose who handles money                 Start
Pick how you take payments               Change
Invite your team                         Change

Kinds of requests
Purchase requests · Who approves a request
Jobs · Open · you pick who goes out on the first job
```

---

## 3. Organization Setup Center

Persistent screen at `Organization → Setup`, and on the phone under Settings → Organisation. It is the four-step checklist in Screen 4, plus **Kinds of requests**, plus links to Who does what and What happens next. There is no workflow list and no percent-ready bar.

---

## 4. Setup Domains

| Domain | What it covers | Blocking? |
|---|---|---|
| **Core** | Organization profile, administrator | Always mandatory — auto-complete at creation |
| **People & Structure** | Members, departments | Conditional — needs ≥1 member before first workflow |
| **Authority** | Approval roles, limits, delegations | Conditional — only blocks approval workflows |
| **Workflows** | Active workflow templates + prerequisites | Ready when prerequisites resolve |
| **Trust & Identity** | Org DID, issuer, verifier | Auto-provisioned — only trust-anchor config is conditional |
| **Integrations** | EcoCash, email, external providers | Optional — only blocks payment workflows |

> **Trust-anchor / verifier-registration configuration is never a standing onboarding checklist item.** It surfaces only as a prerequisite when a selected workflow template requires it.

---

## 5. Readiness States

| State | Icon | Meaning | User action? |
|---|---|---|---|
| `ready` | ✓ green | Configured and operational | None |
| `needs_attention` | ⚠ orange | Required but not configured | Yes — show action button |
| `pending_external` | ⏳ blue | Waiting on external event (DNS, etc.) | None — wait |
| `optional` | ○ gray | Not required for any active workflow | No |
| `not_applicable` | — | Irrelevant given chosen workflows | — |

---

## 6. Progressive Disclosure Rules

| Principle | Applied as |
|---|---|
| Lead with goal, not config | Screen 3 asks "what do you need?" before any checklist appears |
| Empty states should guide | When a domain has zero items: "No approvers. [Click to add one.]" — not a blank row |
| Show hidden features as user progresses | Trust and Integrations collapsed by default |
| Don't dump everything at once | Domain cards collapsed; expand individual items on click |
| Always offer a skip option | Every setup screen has "I'll do this later" |
| Checklist scoped to goal | Workflow prerequisites shown only for active templates |
| Avoid disruptive UI patterns | No mandatory full-screen modals; use inline callouts |

---

## 7. SSI-Specific Constraints

1. **Provisioning is synchronous for core infrastructure** (DID, issuer, verifier) and may be async for domain verification. Render a `pending_external` state — not a blocker.

2. **Verifier registrations provision lazily** — create `verifier_registrations` rows the first time a workflow needs to request a presentation, not at org creation.

3. **Trusted issuers are workflow-triggered** — never a default Setup Center item. Show as a prerequisite of the specific workflow that needs them.

4. **Status-list fail-closed messaging** — when a credential status check returns `unknown`, show:
   > "Couldn't confirm credential status right now. Treated as not-yet-verified for security reasons. [Try again]"
   Not "Unauthorized."

5. **Trust domain UI** initially shows only: org identity ✓ / issuer ✓ / verifier ✓. Trust-anchor and verifier-registration entries added to Trust domain only after STEP 3/4 of the backend plan are complete.

---

## 8. What setup no longer does

There is no screen for choosing a workflow, and no template picker.

Saving an answer stores that answer. It does not write a list of request types into a workflow catalog. Purchase requests, supplier bills and customer payments are available for every organization. Jobs, school fees and counter sales follow from what the organization said it does. A request opens once the money people are in place. Who goes out on a job, and who checks the work, is asked on the job itself.

---

## 9. Build Phases

| Phase | Work | Backend changes? |
|---|---|---|
| **1 (done)** | Setup is the four-step checklist. No template picker. | None |
| **2 (done, 2026-10-05)** | One question per window, then the setup checklist. No workflow picker. | `PUT /setup/profile` |
| **3** | Workflow prerequisite cards — per-workflow prerequisite view | Minor: `requiredFor` enrichment |
| **4** | `pending_external` status in readiness API | Yes — new status value |
| **5** | AI Copilot entry point | Yes — Vercel AI SDK / GenUI layer |

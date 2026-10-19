# Credentis Organization Onboarding — Design Spec

> **Core principle:** An organization is usable before it is fully configured. Onboarding is not a wizard — it is a persistent readiness experience driven by real organizational goals.

## Mobile organisation workspace

- **Organisation settings** separates Team, Roles, Approval authorities and Who does what. Owners/admins manage roles and approval grants; stage assignments do not themselves grant authority. Readiness links open the relevant setting, and required/conditional/recommended checks are unchanged.
- **Operations** opens Jobs first when configured. Money remains a separate segment; explicit tab links still work. New job retains dispatch-role checks and the existing creation endpoint. Optional client contact, payment schedule and worker payout details expand in the job form.
- **Inbox → Requests** and **Requests & history** show the same underlying request. The configured stage actor (and only policy-authorized stand-ins/delegates) can decide from either personal Inbox or organisation Finance detail; both use one stage-checked, idempotent decision and update the same progress/audit history. Everyone else sees who the request is waiting for. Approval does not mean the purchase is complete: the linked job stays held until the required receipt or follow-on fulfillment is recorded.
- **Requests & history**, linked from organisation Home and Inbox, provides a phone list or wider-screen table, search/status and expandable type/assigned-role filters. Older history loads in pages. A request separates Progress from History & audit; platform events reuse the existing audit renderer, while contact requests show only actually recorded milestone timestamps.
- `/workflow-requests/inbound` remains actionable by default. `includeHistory=true` includes historical rows, with bounded `limit` and `offset`. Existing org-role checks still apply. Platform history retains its existing subject/tenant permissions.
- Organisation Home never previews a staff card simply because the organisation issued it into a person's wallet. Preview links identify the actual org Inbox item/request. Recommendations are capped and are not presented as a total inbox count.
- Personal Home attention previews preserve workflow card action/job titles rather than replacing them with “Workflow action”. Older generic cards derive their label from the recorded action and reference. Each preview opens its specific Inbox item, with action and context on separate readable lines.
- The top bar names the active account/organisation, not the current page. The five bottom destinations remain unchanged; Requests belongs under Inbox. Forms, extra filters and audit detail use progressive disclosure. Dialogs cover navigation, and touch controls have at least 48 CSS-pixel targets.
- Job checkpoint, proof and record-preview dialogs use the shared Modal layer above the job drawer. Do not override them with legacy lower z-index values: that hides the dialog while its focus trap blocks the visible timeline. Confirm arrival must open a visible location/site-code form, report rejected submissions, and advance only after the API accepts the arrival evidence.
- Cached Home and Inbox projections are versioned without clearing tokens or saved accounts. In-flight responses are checked against account/context scope before publishing.

Design references: [Android layout basics](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-basics) and [Android accessibility guidance](https://developer.android.com/guide/topics/ui/accessibility/apps). Browser viewport checks do not replace TalkBack and physical-device testing.

## 2026-10-06 — One staff card for each person

A person accepts one staff card. It shows they work here, their role, and the steps they confirm. The team list on the website and the phone shows those steps on that card. There is no extra card per kind of request.

The card arrives in the person's own account inbox (My Account on the phone), not under the organisation view. Once accepted it sits in My Records under Employment as "Staff card · From <organisation>", and opening it lists Organisation, Role and the steps they confirm in the same words the team list uses. The team list reads the accepted offer to decide "Ready"; it does not depend on the legacy credential table.

## 2026-10-05 — Nobody picks or adds a workflow any more

This supersedes Screen 3 ("Choose First Workflow") and the "Add a workflow" entries in §3 and §8 below; the rest of this spec still holds.

- Setup is a checklist of four steps, the same on the website and the phone: **Say what you do**, **Choose who handles money**, **Pick how you take payments**, **Invite your team**. Each step opens its own window, with "Question 1 of 3" (and the same on the phone, where the organisation list steps aside until you save or cancel). Saving shows a small done screen with **Next** and **Finish later**, so the owner can stop and come back. The page says how many of the four are done.
- The first window asks what the organization does (buys things and pays suppliers · sends people out to do jobs · teaches students · sells to customers, pick all that apply). The second asks who approves and releases money (Owner handles money · Manager, then finance · Director confirms once). Coming back when people are already chosen offers **Keep what is set now**, so saving does not replace them. The third asks how payments are taken (Click n Pay · EcoCash · Practice payments · Not yet).
- Answers are saved on the server with `PUT /organizations/{org}/setup/profile`. The screen does not send a list of workflows to turn on.
- Every organization gets purchase requests, supplier bills and customer payments. Jobs, school fees and counter payments follow from the first answer. Each kind of request opens on its own once what it needs is in place. Setup lists what is still missing under **Kinds of requests**.
- The money answer is set once, on purchase requests. Releasing a job payout, paying a supplier bill, confirming a remittance and issuing a receipt all use the same people (`shared_finance` in `OrgWorkflowActorService`) unless the organization picks someone else for that step. Who does what is one window per category: **Money**, then each kind of request, then **If nobody is chosen**, then **Role cards**, with Back and Next. A money step that still needs a chosen person says who is standing in for now.
- Steps such as who goes out on a job are asked the first time that request is used. They do not block the checklist.
- Portal: `pages/organization/onboarding.tsx`, `setup.tsx`, `actors.tsx`, `utils/orgProfile.ts`. Phone: `pages/settings/org.tsx`, `lib/orgProfile.ts`. Server: `OrgSetupProfileService`, `OrgWorkflowActorService.SHARED_FINANCE_STAGES`.
- 2026-10-06: the first window offers all four answers again (buys things and pays suppliers · sends people out to do jobs · collects school fees · sells from a shop or advertises what it delivers). School-fee invoices, the store, the catalog and publishing follow that answer. An organisation that does not sell or advertise is not listed and cannot publish.
- 2026-10-06: saving a money choice ticks **Choose who handles money**. The circle is not a box you tick yourself. If that choice names people who are not on the team yet, the tick stays and the step says who to invite; the owner stands in until they join. Each choice shows who confirms and who releases the money.
- 2026-10-12: Setup asks **four** questions now ("Question 1 of 4" on the website and the phone), and the checklist has a fifth step, **Say if you manage staff here**. The new second window asks **"Do you manage staff leave and payroll here?"** with one answer to tick, _Manages staff leave, expenses and payslips_ ("Staff ask for leave and claim expenses from their phone; a manager decides; payslips can be sent again."). Under it a plan line says _Part of the paid plan. Free during the pilot._ (or _Included in your plan._ / _Not included in your plan yet._). Leaving it unticked is the "No". Help line on the window: _Leave it unticked if staff matters are handled elsewhere. You can change this later under Organization._ The money question is now 3 and payments 4. Saving writes `modules: ["people_payroll"]` to `PUT /organizations/{org}/setup/profile`; the answer, together with the plan (`org_plans`), decides whether the organisation gets **Staff requests** (leave, expense claims, payslips sent again), a **Staff requests** inbox tab and a starter _Manager_ role. Organisations set up before this date are off unless they already had leave or expense requests or payslip workflows, in which case the migration switched them on. The done screen lists _Staff requests_ under "Open now" when it is ticked.

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

| Domain                 | What it covers                            | Blocking?                                                  |
| ---------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| **Core**               | Organization profile, administrator       | Always mandatory — auto-complete at creation               |
| **People & Structure** | Members, departments                      | Conditional — needs ≥1 member before first workflow        |
| **Authority**          | Approval roles, limits, delegations       | Conditional — only blocks approval workflows               |
| **Workflows**          | Active workflow templates + prerequisites | Ready when prerequisites resolve                           |
| **Trust & Identity**   | Org DID, issuer, verifier                 | Auto-provisioned — only trust-anchor config is conditional |
| **Integrations**       | EcoCash, email, external providers        | Optional — only blocks payment workflows                   |

> **Trust-anchor / verifier-registration configuration is never a standing onboarding checklist item.** It surfaces only as a prerequisite when a selected workflow template requires it.

---

## 5. Readiness States

| State              | Icon      | Meaning                               | User action?             |
| ------------------ | --------- | ------------------------------------- | ------------------------ |
| `ready`            | ✓ green   | Configured and operational            | None                     |
| `needs_attention`  | ⚠ orange | Required but not configured           | Yes — show action button |
| `pending_external` | ⏳ blue   | Waiting on external event (DNS, etc.) | None — wait              |
| `optional`         | ○ gray    | Not required for any active workflow  | No                       |
| `not_applicable`   | —         | Irrelevant given chosen workflows     | —                        |

---

## 6. Progressive Disclosure Rules

| Principle                               | Applied as                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| Lead with goal, not config              | Screen 3 asks "what do you need?" before any checklist appears                      |
| Empty states should guide               | When a domain has zero items: "No approvers. [Click to add one.]" — not a blank row |
| Show hidden features as user progresses | Trust and Integrations collapsed by default                                         |
| Don't dump everything at once           | Domain cards collapsed; expand individual items on click                            |
| Always offer a skip option              | Every setup screen has "I'll do this later"                                         |
| Checklist scoped to goal                | Workflow prerequisites shown only for active templates                              |
| Avoid disruptive UI patterns            | No mandatory full-screen modals; use inline callouts                                |

---

## 7. SSI-Specific Constraints

1. **Provisioning is synchronous for core infrastructure** (DID, issuer, verifier) and may be async for domain verification. Render a `pending_external` state — not a blocker.

2. **Verifier registrations provision lazily** — create `verifier_registrations` rows the first time a workflow needs to request a presentation, not at org creation.

3. **Trusted issuers are workflow-triggered** — never a default Setup Center item. Show as a prerequisite of the specific workflow that needs them.

4. **Status-list fail-closed messaging** — when a credential status check returns `unknown`, show:

   > "Couldn't confirm credential status right now. Treated as not-yet-verified for security reasons. [Try again]"
   > Not "Unauthorized."

5. **Trust domain UI** initially shows only: org identity ✓ / issuer ✓ / verifier ✓. Trust-anchor and verifier-registration entries added to Trust domain only after STEP 3/4 of the backend plan are complete.

---

## 8. What setup no longer does

There is no screen for choosing a workflow, and no template picker.

Saving an answer stores that answer. It does not write a list of request types into a workflow catalog. Purchase requests, supplier bills and customer payments are available for every organization. Jobs, school fees and counter sales follow from what the organization said it does. A request opens once the money people are in place. Who goes out on a job, and who checks the work, is asked on the job itself.

---

## 9. Build Phases

| Phase                    | Work                                                                   | Backend changes?                  |
| ------------------------ | ---------------------------------------------------------------------- | --------------------------------- |
| **1 (done)**             | Setup is the four-step checklist. No template picker.                  | None                              |
| **2 (done, 2026-10-05)** | One question per window, then the setup checklist. No workflow picker. | `PUT /setup/profile`              |
| **3**                    | Workflow prerequisite cards — per-workflow prerequisite view           | Minor: `requiredFor` enrichment   |
| **4**                    | `pending_external` status in readiness API                             | Yes — new status value            |
| **5**                    | AI Copilot entry point                                                 | Yes — Vercel AI SDK / GenUI layer |

- 2026-10-13: Phase 5 shape decided. Portal only, owners only, behind a per-organisation flag. AI SDK Core on the API under `src/ai/` (`POST /ai/setup/chat`) with `useChat` in a Mantine side panel. It reads readiness, next steps and help text, and it may only _propose_ setup answers; the owner saves. It comes after a deterministic next-step card on both apps. See `docs/SGK_FEPT_GAP_MAP.md` ("Guidance with GenUI").

# Portal Tenant Init + 401 Login (Pin) - Architecture Issues

## Symptom Snapshot
Portal console shows:
- "Initializing new portal tenant"
- "New portal tenant initialized: <tenant-id>"
- "ensurePortalTenant Using logged-in user tenant: <tenant-id>"
- "Shop Saving invoice/receipt to wallet with offer: openid-credential-offer://..."
- "Invoice/Receipt saved successfully"
- Followed by: `POST /api/ssi/auth/login/pin` -> 401 Unauthorized

## What This Means
The portal is creating or reusing a tenant in the holder service and can accept offers, but the login PIN flow fails afterward. This is not a wallet-accept issue; it is an auth/token and identity-mapping issue in the SSI auth pipeline.

## Current Architectural Issues

1) Dual identity sources (portal tenant vs. SSI user)
- The portal creates a tenant (wallet) for the session.
- SSI auth (`/api/ssi/auth/login/pin`) authenticates against `ssi_users` table.
- If the portal tenant is not linked to `ssi_users`, PIN login returns 401 even though the wallet exists.
- Result: credentials can be accepted into the wallet, but login fails because the auth layer cannot map the phone/PIN to that tenant.

2) Stale or mismatched tenant IDs in browser storage
- The portal stores multiple keys (`credoTenantId`, `tenantId`, `walletToken`, `tenantToken`, etc.).
- If these values do not match the current tenant record in the holder/issuer store, auth fails.
- This shows up as a valid wallet flow with a later 401 on PIN login.

3) Token audience and session scope mismatch
- PIN login returns a tenant JWT, but the portal also uses it for wallet API calls.
- If the token is for a tenant that does not exist in the holder agent or is expired, the holder rejects it.
- This is amplified by multi-service setup (issuer vs. holder) and previously split Askar roots.

4) Phone-based identity not enforced at tenant creation
- Portal tenant is created before phone number is persisted or linked.
- The tenant is not guaranteed to be linked to the phone used later for PIN login.
- This causes the user to appear "new" in `ssi_users`, while the portal uses an unlinked tenant.

5) Login endpoint expects registered user, not guest wallet
- `/api/ssi/auth/login/pin` expects an `ssi_users` row with matching phone hash + PIN hash.
- If the user only performed guest flows or the registration did not write `ssi_users`, login is rejected.

## Root Cause (Most Likely)
The portal created a tenant and accepted credentials, but the PIN login checks `ssi_users` and does not find a matching user or finds a tenant that differs from the portal tenant. This is a mapping problem between:
- `ssi_users.tenant_id` (auth identity), and
- `portal session tenant` (wallet identity).

## Recommended Fix Direction (Implementation Notes)
- Ensure tenant creation and SSI registration are unified:
  - Registration must create/claim the same tenant the portal uses.
  - Save `ssi_users` row with that tenant ID immediately.
- Issue a short-lived session token (`/api/ssi/auth/session`) and use it to access wallet endpoints.
- Avoid relying on localStorage tenant IDs without verifying via `/session`.
- If the user is guest-first, explicitly link phone -> tenant in `temp_phone_links` and resolve it during registration.

## Debug Checklist
1) Confirm `ssi_users` contains the phone hash and tenant id.
2) Confirm the tenant id exists in the holder agent (TenantsModule).
3) Confirm the token used by the portal has tenantId that matches the wallet id used in requests.
4) Confirm localStorage is not holding an old tenant id or token.

## Error Meaning
`POST /api/ssi/auth/login/pin` -> 401 means: "No valid SSI user found for this phone+PIN or tenant mismatch." The wallet can still accept credentials, but login cannot establish an authenticated session without a matching `ssi_users` record.

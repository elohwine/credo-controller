# Secrets rotation (P0)

Several environment files and local databases were committed to this repository in the
past. They are no longer tracked (`git rm --cached`), and `.gitignore` keeps them out.
Git history was **not** rewritten, so every value that was ever committed must be treated
as public and rotated.

## Files that were tracked

| File                              | Contained                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `.env`                            | `WALLET_KEY`, `JWT_SECRET`                                                                                          |
| `.env.local`                      | `WABA_TOKEN`, `ECOCASH_API_KEY`, `ECOCASH_WEBHOOK_SECRET`, `NGROK_AUTHTOKEN`, `STATIC_API_KEY`, `FILE_SERVER_TOKEN` |
| `credo-ui/wallet/.env.local`      | `NUXT_SECRET`                                                                                                       |
| `data/*.db*`, `tmp/*.db`          | Local SQLite state (users, tenants, issued-credential register)                                                     |
| `credo-ui/*/tsconfig.tsbuildinfo` | Build state only                                                                                                    |

`.env.sample` and `credo-ui/portal/.env.example` stay tracked and hold no secrets.

## Rotation checklist

| Secret                                      | Where to rotate                                                                       | Effect                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `JWT_SECRET`                                | Generate a new random value (≥ 32 bytes)                                              | All issued session tokens stop working; users sign in again                       |
| `CONTACT_HASH_PEPPER`                      | Generate a new random value and keep it. Do not rotate it casually                   | Keyed hashes of phone numbers and email addresses. Rotating it means existing accounts are found only by their old digest until each person signs in again |
| `PIN_SALT`                                  | Leave the current value until every PIN has been rewritten to the slow hash          | Only the older shared-salt PIN hashes use it. New PINs do not                     |
| `PII_ENCRYPTION_KEY`                        | Generate a new random value before any real deployment                               | Decrypts the short-lived guest checkout phone link. A new key cannot read links written with the old one |
| `WALLET_KEY`                                | Re-key the Askar store (export/import with the new key) before changing the env value | Wallet cannot open if changed without re-keying                                   |
| `WABA_TOKEN`                                | Meta Business → WhatsApp → System user token                                          | WhatsApp notifications                                                            |
| `ECOCASH_API_KEY`, `ECOCASH_WEBHOOK_SECRET` | EcoCash merchant portal                                                               | Payment initiation and webhook signature checks                                   |
| `NGROK_AUTHTOKEN`                           | ngrok dashboard → reset authtoken                                                     | Local tunnels                                                                     |
| `STATIC_API_KEY`                            | Generate a new random value; update every caller's `ISSUER_API_KEY`                   | Server-to-server calls. Production refuses the key when `STATIC_API_KEY` is unset |
| `FILE_SERVER_TOKEN`                         | File server configuration                                                             | File uploads                                                                      |
| `NUXT_SECRET`                               | Generate a new random value                                                           | Nuxt wallet sessions                                                              |

Never rely on the development fallback API key (`test-api-key-12345`) outside local
development.

## Render registration and LDK iFacilities cutover

The API requires `CONTACT_HASH_PEPPER`, `PIN_SALT`, and `PII_ENCRYPTION_KEY` (plus
`JWT_SECRET`) in production. Startup refuses to run when any of the three personal-data
secrets is missing; registration must never fall back to a published development pepper.

For the existing API service, use Render's **Environment** secret store:

1. Restore any previously used secret from the deployment's secure backup. Do not
   replace an existing pepper, legacy PIN salt, encryption key, or wallet key.
2. For a secret that has genuinely never been configured, generate a cryptographically
   random value (at least 32 bytes) directly in the secret store. Never paste it into
   source control or chat. Save and redeploy the API.
3. Verify registration and sign-in with a synthetic account, including any existing
   accounts that use legacy hashes. Confirm the API starts without missing-secret errors.

The Blueprint now declares the three previously omitted personal-data secrets with
`generateValue: true`. [Render generates a value only when the variable does not already
exist](https://render.com/docs/blueprint-spec#generating-random-secrets). This does not
repair a running service until its configuration is applied and the API redeployed.

The services are `ldk-ifacilities-api` (`https://ldk-ifacilities-api.onrender.com`)
and `ldk-ifacilities-portal` (`https://ldk-ifacilities-portal.onrender.com`). Render cannot
change a service's `onrender.com` hostname, so they replaced the earlier `ldk-sgk-*`
services before any real data existed. If a hostname ever changes again:

- Update API `PUBLIC_BASE_URL` and `PORTAL_UI_URL`, and portal `NEXT_PUBLIC_VC_REPO`,
  `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_ISSUER_API_BASE`, and
  `NEXT_PUBLIC_VERIFIER_API_BASE` together, then rebuild the portal (public Next.js
  variables are baked into its bundle).
- Rebuild the mobile APK with the new `NEXT_PUBLIC_API_URL`.
- Replacing the API service discards its `/data` disk (database and wallet). Back it up
  and restore it first once real data exists; payment links, shortlinks, and issued
  credentials also embed the old origin.

## Keeping it clean

- Keep real values in untracked `.env` / `.env.local` files or the deployment secret store.
- Check before committing: `git ls-files | grep -E '(^|/)\.env($|\.)|\.db($|-)'` should list
  only `.env.sample` and `credo-ui/portal/.env.example`.

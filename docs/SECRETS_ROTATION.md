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
| `WALLET_KEY`                                | Re-key the Askar store (export/import with the new key) before changing the env value | Wallet cannot open if changed without re-keying                                   |
| `WABA_TOKEN`                                | Meta Business → WhatsApp → System user token                                          | WhatsApp notifications                                                            |
| `ECOCASH_API_KEY`, `ECOCASH_WEBHOOK_SECRET` | EcoCash merchant portal                                                               | Payment initiation and webhook signature checks                                   |
| `NGROK_AUTHTOKEN`                           | ngrok dashboard → reset authtoken                                                     | Local tunnels                                                                     |
| `STATIC_API_KEY`                            | Generate a new random value; update every caller's `ISSUER_API_KEY`                   | Server-to-server calls. Production refuses the key when `STATIC_API_KEY` is unset |
| `FILE_SERVER_TOKEN`                         | File server configuration                                                             | File uploads                                                                      |
| `NUXT_SECRET`                               | Generate a new random value                                                           | Nuxt wallet sessions                                                              |

Never rely on the development fallback API key (`test-api-key-12345`) outside local
development.

## Keeping it clean

- Keep real values in untracked `.env` / `.env.local` files or the deployment secret store.
- Check before committing: `git ls-files | grep -E '(^|/)\.env($|\.)|\.db($|-)'` should list
  only `.env.sample` and `credo-ui/portal/.env.example`.

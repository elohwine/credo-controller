# Fly.io deployment

The Credo API and the SSI-to-OIDC bridge run as **one Fly app, one machine, one volume**. Fly bills running machines, not processes, so a second app for the bridge would cost more, not less.

Account: `elowine@outlook.com`, org `personal` (`Eloh`), region `jnb`. Do not log in as another account. Do not touch the `crypto-btcpay-final-*` apps.

Wallet and portal stay separate apps and can stay scaled to zero. They are not part of this deploy.

## What runs on the machine

Caddy listens on `:8080`. Fly terminates TLS in front of it.

| Public path | Process | Bind |
| --- | --- | --- |
| `/.well-known/*`, `/oauth2/*`, `/userinfo` | Ory Hydra | `127.0.0.1:4444` |
| `/login`, `/_next/*`, `/common/*`, `/api/consent`, `/api/presentCredential`, `/api/clientMetadata`, `/api/dynamic/*`, `/api-docs` | vclogin | `127.0.0.1:3002` |
| everything else, including `/health` and `/api/*` | Credo API | `127.0.0.1:3000` |

Not published: Hydra admin `:4445`, Postgres `:5432`, Redis `:6379`. The API reaches Hydra at `http://127.0.0.1:4445`. vclogin reaches the API at `http://127.0.0.1:3000`.

Public URL, for both the API and relying parties:

- API: `https://credentis.fly.dev`
- OIDC issuer: `https://credentis.fly.dev/`
- Discovery: `https://credentis.fly.dev/.well-known/openid-configuration`

## Size

`shared-cpu-4x` (1024 MB), `min_machines_running = 1`, `auto_stop_machines = off`. Do not use `shared-cpu-1x` (256 MB) and do not scale to zero. If the machine is OOM-killed, use `fly scale vm shared-cpu-8x -a credentis`. Do not split the bridge into a second app. The volume attaches to one machine, so the app stays at count 1.

## First deploy

```bash
# must print elowine@outlook.com
fly auth whoami

# stages vclogin, creates the app and volume if missing, then deploys
# refuses any Fly account other than elowine@outlook.com
./scripts/fly-deploy.sh
```

Set secrets once, before the first boot. Generate each with `openssl rand -base64 48`. Never use the upstream samples (`youReallyNeedToChangeThis`, `secret`).

```bash
BRIDGE_KEY="$(openssl rand -base64 48 | tr -d '\n')"
fly secrets set -a credentis \
  HYDRA_SECRETS_SYSTEM="$(openssl rand -base64 48 | tr -d '\n')" \
  HYDRA_PAIRWISE_SALT="$(openssl rand -base64 48 | tr -d '\n')" \
  POSTGRES_PASSWORD="$(openssl rand -base64 48 | tr -d '\n')" \
  REDIS_PASSWORD="$(openssl rand -base64 48 | tr -d '\n')" \
  CREDENTIS_BRIDGE_KEY="$BRIDGE_KEY" \
  PARTNER_BRIDGE_API_KEY="$BRIDGE_KEY" \
  WALLET_ID="shared-controller-agent" \
  WALLET_KEY="$(openssl rand -base64 32 | tr -d '\n')" \
  JWT_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
```

`WALLET_ID` and `WALLET_KEY` must stay the same across deploys or the Askar wallet will not open. Do not set `HYDRA_ADMIN_FORWARDED_PROTO`. `HYDRA_ADMIN_URL` is already `http://127.0.0.1:4445` in `fly.toml`.

Later deploys are `./scripts/fly-deploy.sh`. It stages `ssi-to-oidc-bridge/vclogin` into `deploy/fly/vclogin-src` (gitignored) and runs `fly deploy --ha=false`.

## Checks

```bash
curl -fsS https://credentis.fly.dev/health
curl -fsS https://credentis.fly.dev/.well-known/openid-configuration
curl -fsS -o /dev/null -w '%{http_code}\n' https://credentis.fly.dev/login
fly status -a credentis
fly ssh console -a credentis -C "wget -q -O - http://127.0.0.1:4445/health/ready"
```

Discovery `issuer` must be `https://credentis.fly.dev/`. `/login` must be the vclogin page. Admin, Postgres and Redis must not answer on the public hostname.

Hydra's Postgres data must remain at `/data/postgres` on the persistent volume,
not on the machine's ephemeral root filesystem. The entrypoint restores `/data`
traversal permissions after creating SQLite/app directories; the Postgres directory
itself remains mode `700`, owned by `postgres`.

## Android release

From `credo-ui/mobile`, run `npm run android:release`. The signed release defaults
to `https://credentis.fly.dev`; a running ngrok agent no longer changes the build.
An explicit `NEXT_PUBLIC_API_URL=https://...` can override the default for testing.
The script increments the Android version and writes the signed APK to `dist/`.
Local browser development still uses the local API on port 3000.

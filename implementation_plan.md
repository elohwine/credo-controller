# Implementation Plan

Deploy the Credo API and the SSI-to-OIDC bridge (Ory Hydra, vclogin, Postgres, and Redis) as one Fly.io app on the already-logged-in account `elowine@outlook.com` (org `Eloh` / `personal`), so both share a single always-on machine, one volume, and one public hostname instead of two bills.

The bridge is not a second copy of the API. It is four processes that must talk to each other privately and must stay up for the same reason the API stays up: wallets and relying parties call back into it. Fly charges per running machine, not per process. `shared-cpu-1x` is fixed at 256 MB, which cannot hold the Credo API (Askar + Node) plus Hydra, Postgres, Redis, and Next.js. The cost win is one larger always-on machine, not two small apps and not scale-to-zero.

Public URLs stay distinct without a second app by path routing on one TLS hostname. Credo route prefixes (`/api`, `/oidc`, `/health`, `/webhooks`, `/v`, `/wa`, `/didcomm`, `/workflows`, and the rest) do not overlap the bridge paths (`/.well-known`, `/oauth2`, `/userinfo`, `/login`, `/api/consent`, `/api/presentCredential`, `/api/clientMetadata`, `/api/dynamic`, `/api-docs`). Caddy on the machine sends bridge paths to Hydra or vclogin and everything else to the Credo API on `127.0.0.1`. Hydra's admin port, Postgres, and Redis are never published.

Wallet and portal UIs are out of scope. They already have their own `fly.toml` files and can stay scaled to zero. Existing apps `crypto-btcpay-final-api`, `crypto-btcpay-final-db`, and `crypto-btcpay-final-frontend` must not be touched.

[Types]
No application type changes. Runtime configuration is environment variables only.

Credo API (Fly secrets, already read by `src/services/partner/HydraAdminClient.ts`, `src/controllers/partner/PartnerClientsController.ts`, and `src/services/partner/PartnerVerificationService.ts`):

- `PARTNER_BRIDGE_API_KEY`: string, at least 32 characters, equal to the bridge `CREDENTIS_BRIDGE_KEY`.
- `HYDRA_ADMIN_URL`: `http://127.0.0.1:4445`. Loopback only. Never a public URL.
- `HYDRA_ADMIN_TOKEN`: unset. The admin API is not exposed, so no gateway token is required.
- `HYDRA_ADMIN_FORWARDED_PROTO`: unset. Admin calls are plain HTTP to loopback, not TLS-terminated. `HydraAdminClient` only sends `x-forwarded-proto` when this variable is set.
- `PARTNER_OIDC_ISSUER_URL`: `https://<app>.fly.dev/` (trailing slash, matching `HYDRA_PUBLIC_URL`).
- `PUBLIC_BASE_URL`: `https://<app>.fly.dev`.
- `ASKAR_STORAGE_PATH`: `/data/askar`.
- `PERSISTENCE_DB_PATH`: `/data/persistence.db`.
- `WALLET_ID` and `WALLET_KEY`: stable values. Do not regenerate them on redeploy, or the Askar wallet will not open.

Bridge process environment, set by the entrypoint inside the same container:

- `HYDRA_PUBLIC_URL`: `https://<app>.fly.dev/`
- `VCLOGIN_PUBLIC_URL`: `https://<app>.fly.dev`
- `CREDENTIS_API_URL`: `http://127.0.0.1:3000`
- `CREDENTIS_BRIDGE_KEY`: same value as `PARTNER_BRIDGE_API_KEY`.
- `HYDRA_SECRETS_SYSTEM`, `HYDRA_PAIRWISE_SALT`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`: generated once with `openssl rand -base64 48`, stored as Fly secrets. Never the upstream sample values (`youReallyNeedToChangeThis`, `secret`).
- `HYDRA_DSN`: `postgres://hydra:${POSTGRES_PASSWORD}@127.0.0.1:5432/hydra?sslmode=disable&max_conns=20&max_idle_conns=4`

[Files]
New files, all under the Credo repo so `fly deploy` has one build context:

- `/home/eloh/PROJECTS/credo-controller-backup/deploy/fly/Caddyfile` — path router. Bridge prefixes go to Hydra `127.0.0.1:4444` or vclogin `127.0.0.1:3002`. Everything else goes to Credo `127.0.0.1:3000`. Listens on `:8080` (Fly `PORT`). No admin, Postgres, or Redis listeners.
- `/home/eloh/PROJECTS/credo-controller-backup/deploy/fly/entrypoint.sh` — startup order: Postgres (data dir `/data/postgres`), Redis (no persistence, requirepass), one-shot `hydra migrate sql`, Hydra `serve all` (not `--dev`), vclogin, Credo API, then Caddy in the foreground under tini. Waits for each dependency before the next step. Exits non-zero if a child dies. Traps SIGTERM and stops children so Fly restarts are clean.
- `/home/eloh/PROJECTS/credo-controller-backup/deploy/fly/hydra.env.snippet` — the Hydra env block copied from `compose.credentis.yaml`, used by the entrypoint. Add `deploy/fly/hydra.yaml` only if `oryd/hydra:v2.2.0` ignores an env var needed for `SERVE_PUBLIC_PORT=4444`, `SERVE_ADMIN_HOST=127.0.0.1`, `SERVE_ADMIN_PORT=4445`, or `SERVE_TLS_ALLOW_TERMINATION_FROM`. Prefer env vars.
- `/home/eloh/PROJECTS/credo-controller-backup/Dockerfile.fly` — production image for this deploy. Does not replace `Dockerfile`. Local compose keeps using `Dockerfile`.
- `/home/eloh/PROJECTS/credo-controller-backup/scripts/fly-deploy.sh` — stages vclogin, checks the Fly account, creates the app and volume if missing, then deploys.

`Dockerfile.fly` stages:

1. `vclogin-builder` from `node:20-alpine`. Copy the staged vclogin tree, run `pnpm install --frozen-lockfile` and `pnpm build`. The vclogin image today runs `pnpm start` (`next start`) and is not a Next standalone build (`next.config.mjs` has no `output: 'standalone'`). Do not switch it to standalone in this change. Copy `node_modules` and `.next` into the runtime image and start with `next start -p 3002`.
2. Credo compile stage aligned with the existing `Dockerfile` (node 24.12.0, yarn, Askar native check, `yarn build`). Leave `Dockerfile` itself unchanged so docker-compose is unaffected. `Dockerfile.fly` cannot `FROM` a stage in another file, so copy the production compile steps and keep them aligned.
3. Runtime stage from `node:24.12.0-slim` (Credo requires Node >= 24; vclogin was built on Node 20 but Next 14 runs on 24). Install runtime packages only: `libssl3`, `sqlite3`, `ca-certificates`, `tini`, PostgreSQL 16 server, `redis-server`, and Caddy 2. Copy the Hydra `v2.2.0` binary from `oryd/hydra:v2.2.0`. Copy the Credo `build/`, `node_modules/`, `samples/`, `migrations/`, and `package.json` as the current production stage does. Copy the built vclogin tree to `/opt/vclogin`. Copy `deploy/fly/*`. Create `/data` owned by the runtime user. `ENTRYPOINT` remains tini. `CMD` is `deploy/fly/entrypoint.sh`.

Postgres, Redis, and Hydra bind to `127.0.0.1` only. Keep the non-root `credo` user for Node. If the distro Postgres packages require a `postgres` OS user for `initdb`, start Postgres as that user and leave Node as `credo`. Document the chosen users in a Dockerfile comment. Do not publish any port except 8080.

Build context: `fly deploy` from this repo cannot see `/home/eloh/PROJECTS/ssi-to-oidc-bridge`. `scripts/fly-deploy.sh` rsyncs that repo's `vclogin/` into `deploy/fly/vclogin-src/`, excluding `node_modules`, `.next`, `.env`, `.env.*`, `cache`, `coverage`, and `*.tsbuildinfo`. That directory is gitignored. `Dockerfile.fly` then `COPY deploy/fly/vclogin-src`. Do not set the Fly build context to `/home/eloh/PROJECTS`; that would upload unrelated repos and `server.log`.

Caddy route table (first match wins):

- `/.well-known/*`, `/oauth2/*`, `/userinfo` to `127.0.0.1:4444` (Hydra public).
- `/login`, `/login/*`, `/api/consent`, `/api/presentCredential`, `/api/clientMetadata`, `/api/dynamic/*`, `/api-docs` to `127.0.0.1:3002` (vclogin).
- Everything else, including `/health` and `/api/*`, to `127.0.0.1:3000` (Credo).

Modified files:

- `/home/eloh/PROJECTS/credo-controller-backup/fly.toml`
  - `app = "credentis"` if `fly apps list` shows that name free in org `personal`. Otherwise `credentis-api-v2`. Do not create a second app for the bridge.
  - `primary_region = "jnb"` (matches the existing WireGuard peer region on this account).
  - `[build] dockerfile = "Dockerfile.fly"`. Select the runtime stage explicitly if it is not the last stage.
  - `[env] PORT = "8080"`, `NODE_ENV = "production"`, `PUBLIC_BASE_URL = "https://<app>.fly.dev"`, `ASKAR_STORAGE_PATH = "/data/askar"`, `PERSISTENCE_DB_PATH = "/data/persistence.db"`, `HYDRA_PUBLIC_URL = "https://<app>.fly.dev/"`, `VCLOGIN_PUBLIC_URL = "https://<app>.fly.dev"`, `PARTNER_OIDC_ISSUER_URL = "https://<app>.fly.dev/"`.
  - Remove `HOLDER_PORT`, `HOLDER_BASE_URL`, `WALLET_UI_URL`, and `PORTAL_UI_URL` from this app. `samples/startHolderServer.js` does not exist; the current `Dockerfile` CMD backgrounds a missing file. Do not publish port 6000.
  - One `[[services]]` with `internal_port = 8080`, `protocol = "tcp"`, `auto_stop_machines = "off"`, `auto_start_machines = true`, `min_machines_running = 1`. Ports 80 (`http`) and 443 (`tls`, `http`) only. `force_https = true` on 443.
  - HTTP check `GET /health` on the service, interval 30s, timeout 10s, grace period 90s (Postgres init + Hydra migrate + Askar open on first boot).
  - `[vm] size = "shared-cpu-4x"` (4 shared CPUs, 1024 MB). If the first boot OOMs, move to `shared-cpu-8x` (2048 MB). Do not use `shared-cpu-1x` or `shared-cpu-2x`.
  - `[[mounts]] source = "credentis_data" destination = "/data" initial_size = "1gb"`.
- `/home/eloh/PROJECTS/credo-controller-backup/.dockerignore` — do not ignore `deploy/`. Keep ignoring `data/`, `.env`, `credo-ui/`, `node_modules/`, `*.log`, and `server.log`.
- `/home/eloh/PROJECTS/credo-controller-backup/.gitignore` — ignore `deploy/fly/vclogin-src/`.
- `/home/eloh/PROJECTS/credo-controller-backup/FLY_DEPLOYMENT.md` — replace the three-app API procedure for this scope with the single-app procedure. Keep wallet and portal notes as optional and separate. Document secrets, the path split, the private admin URL, and the rule against a second app or scale-to-zero.

Do not modify Credo TypeScript or vclogin application code unless a boot smoke test shows a hard-coded port that the proxy cannot absorb. Known ports that already match this plan:

- `samples/startServer.js` listens on port `3000` (around line 506). Caddy upstream is `127.0.0.1:3000`. No code change.
- vclogin `next start` defaults to port 3000. The entrypoint must start it with `-p 3002`. No vclogin code change.
- `src/index.ts` `startServer` uses `config.port`. Leave it.

Do not commit `.env`, `.env.local`, Fly tokens, or generated secrets.

[Functions]
No application functions added or removed.

Shell responsibilities in `/home/eloh/PROJECTS/credo-controller-backup/deploy/fly/entrypoint.sh`:

- `require_secrets`: exit 1 before any data directory is created if `HYDRA_SECRETS_SYSTEM`, `HYDRA_PAIRWISE_SALT`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, or `CREDENTIS_BRIDGE_KEY` is empty, shorter than 32 characters, or equal to an upstream sample (`youReallyNeedToChangeThis`, `secret`).
- `init_postgres`: `initdb` into `/data/postgres` on first boot only. Start Postgres bound to `127.0.0.1:5432`. Create role and database `hydra` if missing. Do not listen on `0.0.0.0`.
- `start_redis`: `redis-server --bind 127.0.0.1 --port 6379 --requirepass "$REDIS_PASSWORD" --save "" --appendonly no`.
- `migrate_hydra`: `hydra migrate sql -e --yes` against `HYDRA_DSN`. Idempotent. Run before `serve`.
- `start_hydra`: `hydra serve all` (not `--dev`) with the env block from `/home/eloh/PROJECTS/ssi-to-oidc-bridge/compose.credentis.yaml`: issuer, login, consent, system secret, pairwise salt, dynamic registration off, internal errors off, admin CORS off, public CORS on for `POST,GET`, `SERVE_TLS_ALLOW_TERMINATION_FROM` covering Fly's proxy CIDRs plus `127.0.0.1/32`. Public port 4444. Admin host `127.0.0.1` port 4445 only.
- `start_vclogin`: working directory `/opt/vclogin`, `PORT=3002`, `HYDRA_ADMIN_URL=http://127.0.0.1:4445`, `REDIS_HOST=127.0.0.1`, `REDIS_PORT=6379`, `REDIS_PASSWORD`, `CREDENTIS_API_URL=http://127.0.0.1:3000`, `CREDENTIS_BRIDGE_KEY`, `NODE_ENV=production`, `MOCK_TLS_TERMINATION=1`. Command: `next start -p 3002`.
- `start_credo`: `node ./samples/startServer.js` only. Do not start a holder server. Export `PARTNER_BRIDGE_API_KEY` from `CREDENTIS_BRIDGE_KEY` if the Fly secret was set only once, so the two names cannot drift.
- `start_caddy`: foreground, so Fly sees the main process. A `trap` on TERM/INT stops Hydra, vclogin, Credo, Redis, and Postgres.

`scripts/fly-deploy.sh` steps:

1. Fail if `fly auth whoami` is not `elowine@outlook.com`.
2. Rsync `/home/eloh/PROJECTS/ssi-to-oidc-bridge/vclogin/` to `deploy/fly/vclogin-src/` with the exclusions above.
3. `fly apps create <app> --org personal` only if the app does not exist.
4. `fly volumes create credentis_data --region jnb --size 1 -a <app>` only if that volume does not exist.
5. `fly deploy -a <app> --ha=false` from this repo. `--ha=false` keeps a single machine. A Fly volume can attach to only one machine, so this app must stay at count 1. Use a volume-safe deploy (brief restart is acceptable; do not roll onto a second machine).

[Classes]
No class changes.

Existing classes that must keep working unchanged once env is set:

- `HydraAdminClient` in `src/services/partner/HydraAdminClient.ts`. Calls `${HYDRA_ADMIN_URL}/admin/clients`. With `HYDRA_ADMIN_URL=http://127.0.0.1:4445` this hits loopback Hydra. Do not set `HYDRA_ADMIN_FORWARDED_PROTO` for this path.
- `PartnerClientsController` in `src/controllers/partner/PartnerClientsController.ts`. Reads `PARTNER_OIDC_ISSUER_URL` and `HYDRA_ADMIN_URL` to tell organisation admins whether the bridge is configured.
- `PartnerVerificationService` in `src/services/partner/PartnerVerificationService.ts`. Compares `x-bridge-key` with `PARTNER_BRIDGE_API_KEY`. vclogin sends that header from `CREDENTIS_BRIDGE_KEY` in `vclogin/lib/credentis.ts`.

[Dependencies]
No npm or yarn dependency changes in either repo.

Image packages added only in `Dockerfile.fly`:

- Hydra binary from `oryd/hydra:v2.2.0` (same tag as `compose.credentis.yaml`).
- PostgreSQL 16 server packages (same major as `postgres:16` in that compose file).
- `redis-server` 7.x, started with the same flags as compose (`--requirepass`, no RDB, no AOF). Redis data is ephemeral by design in Credentis mode; login state is short-lived.
- Caddy 2.x as the path router. nginx is acceptable only if the Caddy package pulls too much; the route table must be identical.

Fly account, already verified:

- Org `personal` (`Eloh`), user `elowine@outlook.com`, via `fly auth whoami` and `fly orgs list`.
- Do not run `fly auth login` for `elowine33@gmail.com`.
- Region `jnb`.

[Testing]
No new Jest or Vitest suites. This change is packaging and routing. Existing unit tests are unchanged and do not need to pass as a deploy gate, but do not edit them.

Before deploy:

- `fly auth whoami` prints `elowine@outlook.com`.
- `fly apps list` shows the target app in `personal` after create, and does not show a second app for the bridge.
- If Caddy is available locally, `caddy validate --config deploy/fly/Caddyfile`. Otherwise review the route table against the prefixes in [Files].
- `shellcheck deploy/fly/entrypoint.sh scripts/fly-deploy.sh` if `shellcheck` is installed.

After deploy:

1. `GET https://<app>.fly.dev/health` returns 200 (Credo, through Caddy).
2. `GET https://<app>.fly.dev/.well-known/openid-configuration` returns Hydra JSON whose `issuer` is `https://<app>.fly.dev/` and not an internal hostname.
3. `GET https://<app>.fly.dev/login` returns the vclogin HTML page, not a Credo JSON 404.
4. `POST https://<app>.fly.dev/api/partner/v1/verifications` without `x-bridge-key` is handled by Credo (401 or 404), not by vclogin.
5. From `fly ssh console`, `curl -sS http://127.0.0.1:4445/health/ready` succeeds. The same path on the public hostname does not reach Hydra admin.
6. Public connections to ports 5432, 6379, 4445, 3000, and 3002 fail. Fly has a service only on 80 and 443.
7. From the machine, a `POST http://127.0.0.1:4445/admin/clients` with a throwaway client (then delete it) shows the API process can reach Hydra admin. Do not leave the test client in place.
8. `fly status -a <app>` shows exactly one machine, `min_machines_running = 1`, volume mounted at `/data`.
9. `fly machine restart` once, then confirm `/data/postgres` and `/data/askar` are still present and Hydra still answers discovery.
10. If the machine is OOM-killed, scale with `fly scale vm shared-cpu-8x -a <app>` rather than splitting into a second app.

[Implementation Order]
1. Confirm `fly auth whoami` is `elowine@outlook.com` and pick an unused app name in org `personal` (`credentis` preferred). Do not log in as the Gmail account. Do not touch the `crypto-btcpay-final-*` apps.
2. Add `deploy/fly/Caddyfile` with the route table in [Files].
3. Add `deploy/fly/entrypoint.sh` with ordered startup, loopback binds, secret checks, and a SIGTERM trap.
4. Add `Dockerfile.fly`. Leave the existing `Dockerfile` CMD used by docker-compose unchanged.
5. Add `scripts/fly-deploy.sh`, gitignore `deploy/fly/vclogin-src/`, and make sure `.dockerignore` does not exclude `deploy/`.
6. Rewrite `fly.toml` to one service on port 8080, one machine, `shared-cpu-4x` / 1024 MB, `auto_stop_machines = "off"`, `min_machines_running = 1`, volume `/data`, region `jnb`. Remove the port 6000 service and the holder env vars.
7. Create the app and volume once: `fly apps create <app> --org personal` and `fly volumes create credentis_data --region jnb --size 1 -a <app>`. Never create a second app for the bridge.
8. Set secrets once, generated, not sample values: `HYDRA_SECRETS_SYSTEM`, `HYDRA_PAIRWISE_SALT`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `CREDENTIS_BRIDGE_KEY`, `PARTNER_BRIDGE_API_KEY` (same value), `WALLET_KEY`, `WALLET_ID`, `JWT_SECRET`. Set `HYDRA_ADMIN_URL` only if it is not hardcoded by the entrypoint; the only legal value is `http://127.0.0.1:4445`. Do not set `HYDRA_ADMIN_FORWARDED_PROTO`.
9. Deploy with `scripts/fly-deploy.sh` and run the smoke tests in [Testing].
10. Update `FLY_DEPLOYMENT.md` so it describes this single-app layout, the public URL split, the private admin URL, and the cost rule: one always-on machine, no second Fly app for the bridge, and `min_machines_running` stays 1.




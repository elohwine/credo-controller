# Fly deployment (`credentis`)

Deploy from the repo root with `sh scripts/fly-deploy.sh`. It stages vclogin, refuses any Fly account other than the expected one, and deploys one machine with the `credentis_data` volume mounted at `/data`.

Data on the volume:

| Path | Contents |
| --- | --- |
| `/data/persistence.db` | Platform, organisation and user records (SQLite) |
| `/data/tenants.db` | Tenant registry |
| `/data/askar/data/wallet/shared-controller-agent/sqlite.db` | Askar wallet: root agent profile plus one profile per tenant |
| `/data/postgres` | Hydra only |
| `/data/credo.log` | API log, appended. Empty it in place with `: > /data/credo.log` |

## Mobile web and Android release

The Fly script builds the mobile web app at `/app`; it does not deploy the separate portal.
After it has staged `deploy/fly/mobile-web`, build the APK from `credo-ui/mobile`:

```sh
NEXT_PUBLIC_API_URL=https://credentis.fly.dev bash ./build-mobile.sh
```

The script increments the Android version and writes the signed APK to `credo-ui/mobile/dist`.
For an undistributed rebuild of the same version, set `SKIP_VERSION_BUMP=1`.
Verify the APK's version and signing certificate before sharing it.

The login screen centers its content on a full-height surface, without a browser-style card.
Its initial height stays stable across keyboard-only resizes so closing the keyboard cannot
move Sign in under a tap. Width/orientation changes update the layout; short screens scroll.
Phone/biometric sign-in is shown only for an enrolled, supported device with a remembered wallet.

Android uses its native splash API through the existing AndroidX compatibility dependency:
`MainActivity` installs it before activity creation, and the launch theme supplies a shield/check
vector plus light/dark background colors. There is no second JavaScript splash or forced delay.
The old `SplashScreen` Capacitor configuration was inert because that plugin is not installed.

Design references: [Android splash screens](https://developer.android.com/develop/ui/views/launch/splash-screen),
[accessibility](https://developer.android.com/guide/topics/ui/accessibility/apps),
and [edge-to-edge insets](https://developer.android.com/develop/ui/views/layout/edge-to-edge).

## Resetting all organisations and users

Use this to start onboarding again with the same phone numbers and emails. It removes:

- every organisation and personal wallet (Credo tenants and their Askar profiles)
- every row in `persistence.db`, including audit logs, policy decisions and outbox messages
- `tenants.db`
- partner OAuth clients in Hydra

It also rotates the JWT secret, which signs everyone out.

It keeps:

- the root agent with its DIDs and keys
- global VC schemas and credential definitions (`tenant_id = 'global'`)
- the system payment providers (`tenant_id = 'system'`)
- the seeded platform workflow template (`tenant_id IS NULL`)
- migration history
- WhatsApp and other platform settings held in Fly secrets

The keep-list is `PLATFORM_KEEP_ROWS` in `src/services/platform/PlatformDataResetService.ts`.

Steps:

```sh
fly ssh console -a credentis -C "sh -c 'echo wipe-org-and-user-data > /data/RESET_ORG_USER_DATA'"
fly machine restart -a credentis
fly ssh console -a credentis -C "sh -c 'ls /data/backups; cat /data/backups/pre-reset-*/report.json'"
```

On the next start, before anything opens the databases, the server copies `persistence.db`, `tenants.db` and the Askar wallet to `/data/backups/pre-reset-<time>/`. After the agent starts and before the API accepts requests, it does the following in order:

1. Dry-runs the database wipe.
2. Deletes every Credo tenant.
3. Deletes the partner clients from Hydra.
4. Wipes the database rows.
5. Rotates the JWT secret.
6. Writes `report.json` and removes the flag.

If the flag's content is not exactly `wipe-org-and-user-data`, or any step fails, the server starts normally and renames the flag to `RESET_ORG_USER_DATA.failed` with the reason. A failed Credo tenant deletion stops the reset before any data is removed.

To restore, stop the app and copy the files from the backup folder back to their original paths:

- `data-persistence.db` → `/data/persistence.db`
- `data-tenants.db` → `/data/tenants.db`
- `shared-controller-agent-sqlite.db` → the Askar path above

Delete the `-wal` and `-shm` files next to each restored database before starting again.

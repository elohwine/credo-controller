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

The 1.0.38 (39) Android release includes the shared sample-receipt/sharing onboarding
guide and eight original 1080×1080, 60 fps vector animations. The same guide is included
in the portal source; deploying Fly's `/app` does not publish the separate portal.
WhatsApp header assets retain their filenames and now render at 1600×836.
Build and verify the upgrade certificate with `bash ./build-and-sign-apk.sh`.

The login screen centers its content on a full-height surface, without a browser-style card.
Its initial height stays stable across keyboard-only resizes so closing the keyboard cannot
move Sign in under a tap. Width/orientation changes update the layout; short screens scroll.
Phone/biometric sign-in is shown only for an enrolled, supported device with a remembered wallet.

Android now installs the official `@capacitor/splash-screen` plugin (Capacitor 7).
The plugin owns native splash installation; `MainActivity` must not also install it.
The launch theme supplies a shield/check vector and light/dark background colors.
The mounted app hides the native splash on the next frame, with a five-second automatic
fallback if startup fails. That fallback is not a minimum branding delay.
After a static build, run `npx cap sync android` and confirm SplashScreen is in the plugin list.

### Trusted-device sign-in

- First sign in with your existing account PIN and accept the PlatformIdentityVC.
  Open **Settings > Account security** in the Android app and confirm your current PIN to enroll.
- If registration already created the account before a response failed, sign in with that PIN.
  Retrying registration returns HTTP 409 with sign-in guidance, not a server-error response.
- Existing Android releases send a local key `alias` during enrollment. The API accepts that
  optional field for compatibility but never uses it as server identity or attestation evidence.
- Attestation roots are pinned by public key from Google's official root list, not by the
  entire certificate fingerprint, so reissued root certificates with the same key are supported.
  An untrusted-root rejection logs only the root certificate fingerprint for diagnosis.
- Enrollment requires Android 11+, a secure screen lock, hardware key attestation,
  a locked verified boot state, Google's trusted certificate roots/revocation service,
  and the actual release signing certificate. Unsupported phones keep account-PIN login.
- Configure `ANDROID_APP_CERT_SHA256` with the release certificate's SHA-256 fingerprint.
  `ANDROID_APP_PACKAGE` defaults to `com.credentis.mobile`. Missing certificate configuration
  fails enrollment closed; never use a debug certificate for the production application.
- The login key allows strong biometrics **or the phone screen lock** per use.
  Payment keys remain separate and biometric-only; phone-PIN fallback cannot release money.
- “Sign in with this phone” obtains an unauthenticated one-time server challenge, signs
  its exact bytes with the enrolled key, and checks the account's PlatformIdentityVC
  through the existing holder/verifier flow. It does not depend on an unexpired bearer token.
- Portal and partner/OIDC sign-ins display a Credentis app link/QR. The app shows the
  server-resolved requester and released claims before local confirmation. Only an exact,
  unexpired locally issued request can be approved; the browser's secret poll token is still required.
- An enrolled phone can approve a new account PIN without the old account PIN, after
  fresh device and platform-credential verification. Changing a PIN or removing a device
  invalidates **all** existing personal and derived organisation sessions. Remaining enrolled
  phones can sign in again. Device removal also cancels that key's pending approvals.
- These are **device-gated server-hosted wallets**, not exclusive phone custody of the VC
  holder key. A copied VC alone is not account recovery. Lost-device recovery, iOS enrollment,
  passkeys and moving holder keys into native hardware remain separate work.

Release gates: run the focused authentication/attestation suites, both UI builds, the bridge
build and Android unit tests. Before enabling or distributing trusted-device authentication,
test a real release-signed phone: enroll, sign out/expire the bearer token, confirm with
strong biometrics and screen lock separately, approve portal and partner QR requests,
reject/replay a request, change a forgotten account PIN, remove a device and retest sessions.
An emulator/browser cannot prove production hardware attestation or OS authentication behavior.

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

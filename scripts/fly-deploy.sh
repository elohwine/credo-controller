#!/bin/sh
# Stage vclogin into this repo, then deploy the combined app to the logged-in Fly account.
# Does not log in, does not touch other apps, and refuses any account other than elowine@outlook.com.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
APP="${FLY_APP:-credentis}"
ORG="${FLY_ORG:-personal}"
REGION="${FLY_REGION:-jnb}"
EXPECTED_USER="${FLY_EXPECTED_USER:-elowine@outlook.com}"
VCLOGIN_SRC="${VCLOGIN_SRC:-/home/eloh/PROJECTS/ssi-to-oidc-bridge/vclogin}"
STAGE="$ROOT/deploy/fly/vclogin-src"

who="$(fly auth whoami 2>/dev/null || true)"
if [ "$who" != "$EXPECTED_USER" ]; then
  echo "refusing to deploy: fly auth whoami is '${who:-unset}', expected ${EXPECTED_USER}" >&2
  exit 1
fi

if [ ! -f "$VCLOGIN_SRC/package.json" ] || [ ! -f "$VCLOGIN_SRC/pnpm-lock.yaml" ]; then
  echo "vclogin source not found at $VCLOGIN_SRC" >&2
  exit 1
fi

echo "staging vclogin from $VCLOGIN_SRC"
rm -rf "$STAGE"
mkdir -p "$STAGE"
tar -C "$VCLOGIN_SRC" \
  --exclude node_modules \
  --exclude .next \
  --exclude cache \
  --exclude coverage \
  --exclude .env \
  --exclude '.env.*' \
  --exclude '*.tsbuildinfo' \
  -cf - . | tar -C "$STAGE" -xf -

MOBILE_DIR="$ROOT/credo-ui/mobile"
MOBILE_STAGE="$ROOT/deploy/fly/mobile-web"
PUBLIC_URL="${FLY_PUBLIC_URL:-https://credentis.fly.dev}"
echo "building web copy of the mobile app (basePath /app, API $PUBLIC_URL)"
(cd "$MOBILE_DIR" && NEXT_PUBLIC_BASE_PATH=/app NEXT_PUBLIC_API_URL="$PUBLIC_URL" npx next build)
rm -rf "$MOBILE_STAGE"
cp -r "$MOBILE_DIR/out" "$MOBILE_STAGE"
# Leave the APK's out/ without the web base path.
rm -rf "$MOBILE_DIR/out"

if ! fly status -a "$APP" >/dev/null 2>&1; then
  echo "creating app $APP in org $ORG"
  fly apps create "$APP" --org "$ORG"
fi

volumes="$(fly volumes list -a "$APP" --json)"
volume_count="$(printf '%s' "$volumes" | node -e '
  let input = "";
  process.stdin.on("data", chunk => { input += chunk });
  process.stdin.on("end", () => {
    console.log(JSON.parse(input).filter(volume => volume.name === "credentis_data").length);
  });
')"
if [ "$volume_count" -eq 0 ]; then
  echo "creating volume credentis_data in $REGION"
  fly volumes create credentis_data --region "$REGION" --size 1 -a "$APP" --yes
fi

echo "deploying $APP (single machine, volume-safe)"
cd "$ROOT"
fly deploy -a "$APP" --ha=false --vm-size shared-cpu-4x "$@"

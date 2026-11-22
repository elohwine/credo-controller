#!/bin/sh
# Deploy the API and the portal from render.yaml. Does not deploy the phone app.
# Refuses any Render account other than kelvin.mupungu@ldkgroup.co.uk.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
EXPECTED_USER="${RENDER_EXPECTED_USER:-kelvin.mupungu@ldkgroup.co.uk}"

who="$(render whoami -o json 2>/dev/null | sed -n 's/.*"email"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
if [ "$who" != "$EXPECTED_USER" ]; then
  echo "refusing to deploy: render whoami is '${who:-unset}', expected ${EXPECTED_USER}" >&2
  echo "Sign that account in with: render logout && render login" >&2
  exit 1
fi

cd "$ROOT"
render blueprints validate ./render.yaml -o text

# Same deploy command the LDK website uses. The phone app is not a service.
API_SERVICE="${RENDER_API_SERVICE:-srv-dc1c8656e07s73cvck10}"
PORTAL_SERVICE="${RENDER_PORTAL_SERVICE:-srv-dc1c8jnf3r2c73ca92r0}"
COMMIT="${1:-$(git rev-parse origin/sgk-jobs)}"

render deploys create "$API_SERVICE" --commit "$COMMIT" --wait --confirm -o text
render deploys create "$PORTAL_SERVICE" --commit "$COMMIT" --wait --confirm -o text
echo "API:    https://ldk-ifacilities-api.onrender.com"
echo "Portal: https://ldk-ifacilities-portal.onrender.com"

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
echo "Blueprint is valid for ${EXPECTED_USER}. Apply render.yaml from the Render dashboard (Blueprints) on branch sgk-jobs."
echo "API:  https://ldk-sgk-api.onrender.com"
echo "Portal: https://ldk-sgk-portal.onrender.com"

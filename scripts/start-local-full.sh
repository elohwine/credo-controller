#!/usr/bin/env bash
# Start the API (credo agent) and/or the portal locally, WITHOUT docker, using the same
# environment as docker-compose.full.yml. Docker-internal addresses (172.19.0.x) are replaced
# with localhost; everything else (wallet id/key, persistence path, Askar store, flags) is identical.
#
#   scripts/start-local-full.sh api      # build + start API on :3000 (DIDComm :3001)
#   scripts/start-local-full.sh portal   # build + start portal on :5000 (next start)
#   scripts/start-local-full.sh all      # both, in the foreground (Ctrl-C stops both)
#
# Env overrides: SKIP_BUILD=1 to reuse existing build output, PORTAL_DEV=1 to run `next dev` instead of `next start`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Same node that the compose images use (node 24). Prefer fnm's install if present.
if [ -d "$HOME/.local/share/fnm/node-versions/v24.21.0/installation/bin" ]; then
  export PATH="$HOME/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH"
fi

# ---- api service environment (docker-compose.full.yml -> services.api.environment) ----
export PORT="${PORT:-3000}"
export WALLET_ID="${WALLET_ID:-shared-controller-agent}"
export WALLET_KEY="${WALLET_KEY:-shared-controller-key}"
export JWT_SECRET="${JWT_SECRET:-development-jwt-secret-456}"
export LOG_LEVEL="${LOG_LEVEL:-debug}"
export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://localhost:3000}"     # compose: http://172.19.0.10:3000
export WALLET_URL="${WALLET_URL:-http://localhost:4000}"
export PERSISTENCE_DB_PATH="${PERSISTENCE_DB_PATH:-$ROOT/data/persistence.db}"   # compose: /app/data/persistence.db (./data mount)
# compose sets ASKAR_STORAGE_PATH=/home/credo/.afj, i.e. "<home>/.afj" inside the container (bind-mounted from
# ./data/askar-issuer). Locally the equivalent is $HOME/.afj, which is also where the existing dev wallet lives.
# Set ASKAR_STORAGE_PATH=$ROOT/data/askar-issuer explicitly to open the compose bind-mount directory instead.
export ASKAR_STORAGE_PATH="${ASKAR_STORAGE_PATH:-$HOME/.afj}"
export ALLOW_TENANT_RECOVERY_ON_LOGIN="${ALLOW_TENANT_RECOVERY_ON_LOGIN:-true}"
export STRICT_TENANT_INVARIANT="${STRICT_TENANT_INVARIANT:-false}"
export ECOCASH_SANDBOX="${ECOCASH_SANDBOX:-true}"
export ECOCASH_WEBHOOK_SECRET="${ECOCASH_WEBHOOK_SECRET:-test-webhook-secret}"
# OFFER_PUSH_URL / OFFER_PUSH_API_KEY intentionally unset (commented out in compose: manual acceptance flow)

# ---- portal service environment (docker-compose.full.yml -> services.portal.environment) ----
export PORTAL_PORT="${PORTAL_PORT:-5000}"
export NEXT_PUBLIC_VC_REPO="${NEXT_PUBLIC_VC_REPO:-http://localhost:3000}"
export NEXT_PUBLIC_BACKEND_URL="${NEXT_PUBLIC_BACKEND_URL:-http://localhost:3000}"
export NEXT_PUBLIC_HOLDER_URL="${NEXT_PUBLIC_HOLDER_URL:-http://localhost:3000}"
export NEXT_PUBLIC_WALLET_URL="${NEXT_PUBLIC_WALLET_URL:-http://localhost:3000}"
export NEXT_PUBLIC_CREDO_API_KEY="${NEXT_PUBLIC_CREDO_API_KEY:-test-api-key-12345}"
export NEXT_PUBLIC_HOLDER_API_KEY="${NEXT_PUBLIC_HOLDER_API_KEY:-test-api-key-12345}"
export BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"             # compose: http://172.19.0.10:3000
export VC_REPO_INTERNAL="${VC_REPO_INTERNAL:-http://localhost:3000}"   # compose: http://172.19.0.10:3000

mkdir -p "$ROOT/data" "$ASKAR_STORAGE_PATH"

build_api() {
  if [ "${SKIP_BUILD:-0}" = "1" ] && [ -f build/index.js ]; then return; fi
  echo "▶ building api (tsoa spec-and-routes → patch-swagger → tsc)"
  node node_modules/.bin/rimraf ./build
  node node_modules/.bin/tsoa spec-and-routes
  node ./scripts/patch-swagger.js
  node node_modules/.bin/tsc -p tsconfig.build.json
}

build_portal() {
  if [ "${PORTAL_DEV:-0}" = "1" ]; then return; fi
  if [ "${SKIP_BUILD:-0}" = "1" ] && [ -d credo-ui/portal/.next ]; then return; fi
  echo "▶ building portal (next build)"
  (cd credo-ui/portal && node node_modules/.bin/next build)
}

start_api() {
  echo "▶ api: node ./samples/startServer.js  (compose command)  http://localhost:$PORT"
  exec node ./samples/startServer.js
}

start_portal() {
  cd credo-ui/portal
  if [ "${PORTAL_DEV:-0}" = "1" ]; then
    echo "▶ portal: next dev  http://localhost:$PORTAL_PORT"
    exec env PORT="$PORTAL_PORT" node node_modules/.bin/next dev -p "$PORTAL_PORT"
  fi
  # next.config.js uses output:'standalone'; mirror the portal Dockerfile (copy public + .next/static next to
  # the standalone server, then `node server.js`).
  mkdir -p .next/standalone/.next
  rm -rf .next/standalone/public .next/standalone/.next/static
  cp -r public .next/standalone/public
  cp -r .next/static .next/standalone/.next/static
  echo "▶ portal: node .next/standalone/server.js  http://localhost:$PORTAL_PORT"
  cd .next/standalone
  exec env PORT="$PORTAL_PORT" HOSTNAME="${PORTAL_HOSTNAME:-0.0.0.0}" NODE_ENV=production node server.js
}

case "${1:-all}" in
  api)    build_api; start_api ;;
  portal) build_portal; start_portal ;;
  all)
    build_api; build_portal
    ( start_api ) &
    API_PID=$!
    ( start_portal ) &
    PORTAL_PID=$!
    trap 'kill $API_PID $PORTAL_PID 2>/dev/null || true' INT TERM EXIT
    wait
    ;;
  *) echo "usage: $0 [api|portal|all]"; exit 1 ;;
esac

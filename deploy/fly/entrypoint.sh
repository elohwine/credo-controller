#!/bin/sh
# One machine: Postgres, Redis, Hydra, vclogin, Credo API, then Caddy in the foreground.
# Admin, Postgres and Redis bind to loopback only.
set -eu

PGDATA="${PGDATA:-/data/postgres}"
POSTGRES_LOG="${POSTGRES_LOG:-/var/log/postgresql/hydra.log}"
CREDO_HOME="${CREDO_HOME:-/home/credo}"
export HOME="$CREDO_HOME"
export PATH="/usr/lib/postgresql/16/bin:/usr/local/bin:$PATH"

log() { printf '%s %s\n' "[entrypoint]" "$*"; }

fail() {
  log "FATAL: $*"
  exit 1
}

require_secret() {
  name="$1"
  value="$(printenv "$name" || true)"
  if [ -z "$value" ] || [ "${#value}" -lt 32 ]; then
    fail "$name must be set and at least 32 characters"
  fi
  case "$value" in
    youReallyNeedToChangeThis|secret|change-me|changeme)
      fail "$name is an upstream sample value"
      ;;
  esac
}

stop_children() {
  log "stopping"
  kill "$CADDY_PID" "$CREDO_PID" "$VCLOGIN_PID" "$HYDRA_PID" "$REDIS_PID" 2>/dev/null || true
  if [ -n "${POSTGRES_PID:-}" ]; then
    su -s /bin/sh postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D '$PGDATA' -m fast stop" >/dev/null 2>&1 || true
  fi
  wait || true
}

wait_for() {
  name="$1"
  shift
  i=0
  while [ "$i" -lt 90 ]; do
    if "$@" >/dev/null 2>&1; then
      log "$name is up"
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  fail "$name did not become ready"
}

require_secret HYDRA_SECRETS_SYSTEM
require_secret HYDRA_PAIRWISE_SALT
require_secret POSTGRES_PASSWORD
require_secret REDIS_PASSWORD
require_secret CREDENTIS_BRIDGE_KEY

# One secret, two names, so the API and the bridge cannot drift.
export PARTNER_BRIDGE_API_KEY="${PARTNER_BRIDGE_API_KEY:-$CREDENTIS_BRIDGE_KEY}"
export HYDRA_ADMIN_URL="${HYDRA_ADMIN_URL:-http://127.0.0.1:4445}"
case "$HYDRA_ADMIN_URL" in
  http://127.0.0.1:4445|http://127.0.0.1:4445/) ;;
  *) fail "HYDRA_ADMIN_URL must be http://127.0.0.1:4445" ;;
esac
unset HYDRA_ADMIN_FORWARDED_PROTO || true

: "${HYDRA_PUBLIC_URL:?HYDRA_PUBLIC_URL is required}"
: "${VCLOGIN_PUBLIC_URL:?VCLOGIN_PUBLIC_URL is required}"
: "${PUBLIC_BASE_URL:?PUBLIC_BASE_URL is required}"
export CREDENTIS_API_URL="${CREDENTIS_API_URL:-http://127.0.0.1:3000}"
export CREDO_LISTEN_PORT="${CREDO_LISTEN_PORT:-3000}"
export ASKAR_STORAGE_PATH="${ASKAR_STORAGE_PATH:-/data/askar}"
export PERSISTENCE_DB_PATH="${PERSISTENCE_DB_PATH:-/data/persistence.db}"
export TENANT_DB_PATH="${TENANT_DB_PATH:-/data/tenants.db}"
export OIDC_DB_PATH="${OIDC_DB_PATH:-/data/oidc.db}"

# Ensure the app-owned directories are present on the same volume.
install -d -o credo -g credo -m 750 /data/askar /data/redis \
  "$(dirname "$PERSISTENCE_DB_PATH")" "$(dirname "$TENANT_DB_PATH")" "$(dirname "$OIDC_DB_PATH")"
install -d -o credo -g credo -m 750 "$CREDO_HOME"

# The SQLite parent above may be /data: restore traversal for postgres after that
# install command, while keeping each service's private directory restricted.
chmod 755 /data
install -d -o postgres -g postgres -m 700 "$PGDATA"
chown -R postgres:postgres "$PGDATA"
su -s /bin/sh postgres -c "test -r '$PGDATA' && test -w '$PGDATA' && test -x '$PGDATA'" \
  || fail "postgres cannot access PGDATA"

# Passwords are base64. Encode them so +, / and = survive the Postgres URL.
pg_pass_enc="$(printf '%s' "$POSTGRES_PASSWORD" | sed 's/+/%2B/g; s|/|%2F|g; s/=/%3D/g')"
export HYDRA_DSN="postgres://hydra:${pg_pass_enc}@127.0.0.1:5432/hydra?sslmode=disable&max_conns=20&max_idle_conns=4"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  log "initialising Postgres"
  su -s /bin/sh postgres -c "/usr/lib/postgresql/16/bin/initdb -D '$PGDATA' --username=postgres --auth=trust --no-instructions"
fi

cat > "$PGDATA/conf.d-loopback.conf" <<'EOF'
listen_addresses = '127.0.0.1'
port = 5432
unix_socket_directories = '/var/run/postgresql'
EOF
grep -q "include_if_exists = 'conf.d-loopback.conf'" "$PGDATA/postgresql.conf" || \
  printf "\ninclude_if_exists = 'conf.d-loopback.conf'\n" >> "$PGDATA/postgresql.conf"
chown postgres:postgres "$PGDATA/conf.d-loopback.conf" "$PGDATA/postgresql.conf"

log "starting Postgres"
mkdir -p "$(dirname "$POSTGRES_LOG")"
chown postgres:postgres "$(dirname "$POSTGRES_LOG")"
chown postgres:postgres "$POSTGRES_LOG" 2>/dev/null || true
su -s /bin/sh postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D '$PGDATA' -l '$POSTGRES_LOG' -w start"
POSTGRES_PID="$(awk 'NR==1{print}' "$PGDATA/postmaster.pid")"
wait_for postgres pg_isready -h 127.0.0.1 -p 5432

role_exists="$(su -s /bin/sh postgres -c "psql -h 127.0.0.1 -d postgres -tAc \"SELECT 1 FROM pg_roles WHERE rolname = 'hydra'\"")"
# Use a dedicated SQL file owned by postgres so the role creation works under the
# postgres user without root-only permissions or psql parameter syntax issues.
escaped_pw="$(printf '%s' "$POSTGRES_PASSWORD" | sed "s/'/''/g")"
cat > /tmp/create-hydra-role.sql <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hydra') THEN
    CREATE ROLE hydra LOGIN PASSWORD '${escaped_pw}';
  ELSE
    ALTER ROLE hydra WITH LOGIN PASSWORD '${escaped_pw}';
  END IF;
END
\$\$;
SQL
chown postgres:postgres /tmp/create-hydra-role.sql
chmod 600 /tmp/create-hydra-role.sql
su -s /bin/sh postgres -c "psql -h 127.0.0.1 -d postgres -v ON_ERROR_STOP=1 -f /tmp/create-hydra-role.sql"
rm -f /tmp/create-hydra-role.sql
db_exists="$(su -s /bin/sh postgres -c "psql -h 127.0.0.1 -d postgres -tAc \"SELECT 1 FROM pg_database WHERE datname = 'hydra'\"")"
if [ "$db_exists" != "1" ]; then
  su -s /bin/sh postgres -c "createdb -h 127.0.0.1 -O hydra hydra"
fi

log "starting Redis"
redis-server --bind 127.0.0.1 --port 6379 --requirepass "$REDIS_PASSWORD" \
  --save "" --appendonly no --dir /data/redis >> /data/redis.log 2>&1 &
REDIS_PID=$!
wait_for redis redis-cli -h 127.0.0.1 -a "$REDIS_PASSWORD" --no-auth-warning ping

log "migrating Hydra"
hydra migrate sql --yes "$HYDRA_DSN"

log "starting Hydra"
export DSN="$HYDRA_DSN"
export SECRETS_SYSTEM="$HYDRA_SECRETS_SYSTEM"
export URLS_SELF_ISSUER="$HYDRA_PUBLIC_URL"
export URLS_LOGIN="${VCLOGIN_PUBLIC_URL}/login"
export URLS_CONSENT="${VCLOGIN_PUBLIC_URL}/api/consent"
export OIDC_SUBJECT_IDENTIFIERS_SUPPORTED_TYPES="public,pairwise"
export OIDC_SUBJECT_IDENTIFIERS_PAIRWISE_SALT="$HYDRA_PAIRWISE_SALT"
export OIDC_DYNAMIC_CLIENT_REGISTRATION_ENABLED=false
export OAUTH2_EXPOSE_INTERNAL_ERRORS=false
export SERVE_PUBLIC_CORS_ENABLED=true
export SERVE_PUBLIC_CORS_ALLOWED_METHODS="POST,GET"
export SERVE_PUBLIC_HOST=127.0.0.1
export SERVE_PUBLIC_PORT=4444
export SERVE_ADMIN_HOST=127.0.0.1
export SERVE_ADMIN_PORT=4445
export SERVE_ADMIN_CORS_ENABLED=false
export SERVE_TLS_ALLOW_TERMINATION_FROM="${HYDRA_TLS_TERMINATION_CIDRS:-172.16.0.0/12,10.0.0.0/8,127.0.0.1/32,fdaa::/16}"
export TTL_LOGIN_CONSENT_REQUEST=5m
export LOG_LEVEL=info
export LOG_FORMAT=json
export LOG_LEAK_SENSITIVE_VALUES=false
hydra serve all >> /data/hydra.log 2>&1 &
HYDRA_PID=$!
wait_for hydra wget -q -O /dev/null http://127.0.0.1:4445/health/ready

log "starting vclogin"
(
  cd /opt/vclogin
  export PORT=3002
  export NODE_ENV=production
  export HYDRA_ADMIN_URL=http://127.0.0.1:4445
  export REDIS_HOST=127.0.0.1
  export REDIS_PORT=6379
  export MOCK_TLS_TERMINATION=1
  exec node node_modules/next/dist/bin/next start -p 3002 -H 127.0.0.1
) >> /data/vclogin.log 2>&1 &
VCLOGIN_PID=$!
wait_for vclogin wget -q -O /dev/null http://127.0.0.1:3002/login

log "starting Credo API"
(
  cd /app
  export PORT=3000
  export CREDO_LISTEN_PORT=3000
  exec node ./samples/startServer.js
) >> /data/credo.log 2>&1 &
CREDO_PID=$!
wait_for credo wget -q -O /dev/null http://127.0.0.1:3000/health

log "starting Caddy"
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
CADDY_PID=$!

trap stop_children INT TERM

# If any sibling exits, take the machine down so Fly restarts a half-dead app.
while kill -0 "$CADDY_PID" 2>/dev/null; do
  for pid in "$HYDRA_PID" "$VCLOGIN_PID" "$CREDO_PID" "$REDIS_PID"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      log "child $pid exited"
      stop_children
      exit 1
    fi
  done
  if ! pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    log "postgres exited"
    stop_children
    exit 1
  fi
  sleep 2
done
wait "$CADDY_PID"
exit 1

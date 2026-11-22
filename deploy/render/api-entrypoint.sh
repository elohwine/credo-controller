#!/bin/sh
# Render publishes one port and mounts the disk as root. The API reads $PORT and writes under /data.
set -eu
mkdir -p /data/askar
chown -R credo:credo /data
port="${PORT:-3000}"
export CREDO_LISTEN_PORT="$port"
export ISSUER_API_PORT="$port"
export CONFIG_DATA_DIR=/data
cd /app
exec runuser --preserve-environment -u credo -- node ./samples/startServer.js

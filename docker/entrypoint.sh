#!/bin/sh
# Boots OpenBao (background) and the Next.js server (foreground) in one image.
set -eu

OPENBAO_ADDR="${OPENBAO_ADDR:-http://127.0.0.1:8200}"

start_openbao() {
  if [ "${BAO_DEV:-0}" = "1" ]; then
    if [ "${NODE_ENV:-production}" = "production" ]; then
      echo "[entrypoint] BAO_DEV is forbidden in production" >&2
      exit 1
    fi
    : "${BAO_DEV_ROOT_TOKEN_ID:?BAO_DEV_ROOT_TOKEN_ID is required when BAO_DEV=1}"
    echo "[entrypoint] starting OpenBao in DEV mode"
    # Dev mode is unsealed and in-memory — convenient, NOT for production.
    bao server -dev -dev-root-token-id="$BAO_DEV_ROOT_TOKEN_ID" -dev-listen-address=127.0.0.1:8200 &
  else
    echo "[entrypoint] starting OpenBao with /bao/config/openbao.hcl"
    bao server -config=/bao/config/openbao.hcl &
  fi
  BAO_PID=$!
}

wait_for_openbao() {
  echo "[entrypoint] waiting for OpenBao at ${OPENBAO_ADDR} ..."
  i=0
  # Use Node's built-in fetch for the readiness probe (no wget/curl needed).
  # Require a 2xx (`r.ok`) — a 404/503/etc. means OpenBao isn't actually ready
  # yet, so keep waiting instead of starting Next.js against an erroring server.
  until node -e "fetch('${OPENBAO_ADDR}/v1/sys/seal-status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; do
    i=$((i + 1))
    if [ "$i" -gt 60 ]; then
      echo "[entrypoint] OpenBao did not become ready in time" >&2
      exit 1
    fi
    # Bail early if OpenBao crashed.
    if ! kill -0 "$BAO_PID" 2>/dev/null; then
      echo "[entrypoint] OpenBao process exited unexpectedly" >&2
      exit 1
    fi
    sleep 1
  done
  echo "[entrypoint] OpenBao is ready"
}

start_openbao
wait_for_openbao

echo "[entrypoint] starting Next.js on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec node server.js

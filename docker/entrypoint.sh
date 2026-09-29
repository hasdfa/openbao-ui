#!/bin/sh
# Boots OpenBao (background) and the Next.js server (foreground) in one image.
set -eu

OPENBAO_ADDR="${OPENBAO_ADDR:-http://127.0.0.1:8200}"

# --- one-time `file` -> raft storage migration -----------------------------
#
# OpenBao 2.7 dropped the `file` storage backend. Volumes written by older
# images keep file-backend data at the root of /bao/file (core/, sys/, logical/,
# ...), which 2.7 refuses to start on. Before starting the server, copy it into
# raft with a 2.6.x `bao` bundled only for this (`bao-legacy`). Unseal keys and
# the root token are unchanged: the data is copied still encrypted.
#
# Safe to interrupt: the source is never modified (only moved aside, one
# rename per entry), a raft directory without the completion marker is treated
# as a partial copy and redone, and the server never starts until the copy is
# complete. The old data stays in legacy-file/ as a rollback copy.
DATA_DIR=/bao/file
RAFT_DIR="$DATA_DIR/raft"
LEGACY_DIR="$DATA_DIR/legacy-file"
MIGRATED_MARKER="$DATA_DIR/.migrated-to-raft"

migrate_legacy_file_storage() {
  [ -e "$MIGRATED_MARKER" ] && return 0
  # `core/` holds the seal config; a file-backend volume always has it.
  [ -d "$DATA_DIR/core" ] || [ -d "$LEGACY_DIR/core" ] || return 0

  # Child namespaces break after this migration: OpenBao converts only the
  # root mount table, and every boot after the first panics ("token store does
  # not exist", openbao/openbao#3921). Refuse before touching anything.
  for ns_dir in "$DATA_DIR/namespaces" "$LEGACY_DIR/namespaces"; do
    if [ -d "$ns_dir" ] && [ -n "$(find "$ns_dir" -type f | head -n1)" ]; then
      echo "[entrypoint] $DATA_DIR has child namespaces, which OpenBao can't yet migrate off \`file\` storage safely (openbao/openbao#3921). Keep this volume on an image with OpenBao 2.6.x." >&2
      exit 1
    fi
  done

  if ! command -v bao-legacy >/dev/null 2>&1; then
    echo "[entrypoint] $DATA_DIR holds \`file\` storage, which this OpenBao can't read, and no bao-legacy binary is available to migrate it" >&2
    exit 1
  fi
  echo "[entrypoint] migrating \`file\` storage to raft ($(bao-legacy version | head -n1))"

  # Move the file-backend tree aside so the migration's walk only sees storage
  # (not audit.log, ui.db or raft/). Backend entries are directories and
  # `_`-prefixed key files.
  mkdir -p "$LEGACY_DIR"
  for entry in "$DATA_DIR"/* "$DATA_DIR"/_*; do
    [ -e "$entry" ] || continue
    name="${entry##*/}"
    case "$name" in raft | legacy-file | lost+found) continue ;; esac
    if [ -d "$entry" ] || [ "${name#_}" != "$name" ]; then
      mv "$entry" "$LEGACY_DIR/"
    fi
  done

  rm -rf "$RAFT_DIR"
  mkdir -p "$RAFT_DIR"
  cat > /tmp/migrate.hcl <<EOF
storage_source "file" {
  path = "$LEGACY_DIR"
}
storage_destination "raft" {
  path    = "$RAFT_DIR"
  node_id = "openbao-ui"
}
cluster_addr = "http://127.0.0.1:8201"
EOF
  bao-legacy operator migrate -config=/tmp/migrate.hcl
  touch "$MIGRATED_MARKER"
  echo "[entrypoint] migration complete; the old files are kept in $LEGACY_DIR"
}

start_openbao() {
  if [ "${BAO_DEV:-0}" = "1" ]; then
    echo "[entrypoint] starting OpenBao in DEV mode (root token: ${BAO_DEV_ROOT_TOKEN_ID:-root})"
    # Dev mode is unsealed and in-memory — convenient, NOT for production.
    BAO_DEV_ROOT_TOKEN_ID="${BAO_DEV_ROOT_TOKEN_ID:-root}" \
      bao server -dev -dev-listen-address=127.0.0.1:8200 &
  else
    migrate_legacy_file_storage
    mkdir -p "$RAFT_DIR"
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

# Minimal non-dev OpenBao config used when BAO_DEV != 1.
# OpenBao only listens on loopback; the Next.js BFF is the public entry point
# and proxies /v1/* to this listener inside the container.
#
# NOTE: the instance starts SEALED (and, on a fresh volume, UNINITIALIZED). You
# must initialize + unseal it (via the UI, API or CLI) before it can be used.
# For a quick start prefer dev mode (BAO_DEV=1).

# Serve OpenBao's stock UI at :8200/ui/. The Next.js BFF proxies /ui/* through
# to it (our own app lives at /ui2/*), so both UIs are reachable side by side.
ui = true

# Integrated storage (raft), single node. OpenBao 2.7 removed the `file`
# backend; volumes written by older images are migrated into this path by the
# entrypoint on first boot (see migrate_legacy_file_storage).
storage "raft" {
  path    = "/bao/file/raft"
  node_id = "openbao-ui"
}

listener "tcp" {
  address     = "127.0.0.1:8200"
  tls_disable = true
}

# Raft needs both, even for a single node that never talks to peers.
api_addr     = "http://127.0.0.1:8200"
cluster_addr = "http://127.0.0.1:8201"

# Declarative file audit device. OpenBao disables enabling audit devices over
# the API, so they are configured here; the UI's audit-log viewer reads this
# file. The device attaches once the instance is unsealed.
audit "file" "file" {
  options {
    file_path = "/bao/file/audit.log"
  }
}

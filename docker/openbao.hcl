# Minimal non-dev OpenBao config used when BAO_DEV != 1.
# OpenBao only listens on loopback; the Next.js BFF is the public entry point
# and proxies /v1/* to this listener inside the container.
#
# NOTE: a fresh persistent instance starts SEALED and UNINITIALIZED. You must
# initialize + unseal it (via the API/CLI) before the UI can be used. For a quick
# start prefer dev mode (BAO_DEV=1). Production deployments should terminate TLS
# at the edge.

# Serve OpenBao's stock UI at :8200/ui/. The Next.js BFF proxies /ui/* through
# to it (our own app lives at /ui2/*), so both UIs are reachable side by side.
ui = true

storage "file" {
  path = "/bao/file"
}

listener "tcp" {
  address     = "127.0.0.1:8200"
  tls_disable = true
}

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


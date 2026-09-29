#!/usr/bin/env bash
# Upgrade test for volumes written with `file` storage (images before raft):
# seed file storage with the last OpenBao that has it, boot IMAGE on the same
# volume, and check the data survives the migration and several restarts
# (openbao/openbao#3921 only fails from the second boot on).
#
#   docker/test-storage-migration.sh <image>
set -euo pipefail

IMAGE="${1:?usage: $0 <image>}"
LEGACY="quay.io/openbao/openbao:${LEGACY_OPENBAO_VERSION:-2.6.3}"
VOL="bao-migration-test-$$"
PORT="${PORT:-38200}"
A="http://127.0.0.1:${PORT}/v1"

CFG="$(mktemp -d)"
cleanup() { docker rm -f "$VOL-legacy" "$VOL-new" >/dev/null 2>&1 || true; docker volume rm -f "$VOL" >/dev/null 2>&1 || true; rm -rf "$CFG"; }
trap cleanup EXIT

wait_up() { for _ in $(seq 90); do curl -sf -o /dev/null "$A/sys/seal-status" && return 0; sleep 1; done; echo "OpenBao never came up" >&2; return 1; }
json() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }

# The volume takes its ownership from IMAGE's /bao/file, as in production.
docker run --rm -v "$VOL:/bao/file" --entrypoint true "$IMAGE"
owner="$(docker run --rm --entrypoint sh "$IMAGE" -c 'echo "$(id -u):$(id -g)"')"

echo "--- seeding \`file\` storage with $LEGACY"
cat > "$CFG/file.hcl" <<'EOF'
storage "file" { path = "/bao/file" }
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true
}
EOF
chmod 644 "$CFG/file.hcl"
docker run -d --name "$VOL-legacy" --user "$owner" -p "127.0.0.1:${PORT}:8200" -v "$VOL:/bao/file" \
  -v "$CFG/file.hcl:/cfg/file.hcl:ro" --entrypoint bao "$LEGACY" server -config=/cfg/file.hcl >/dev/null
wait_up
init="$(curl -sf -X PUT -d '{"secret_shares":1,"secret_threshold":1}' "$A/sys/init")"
KEY="$(echo "$init" | json 'd["keys_base64"][0]')"
TOKEN="$(echo "$init" | json 'd["root_token"]')"
H="X-Vault-Token: $TOKEN"
curl -sf -o /dev/null -X PUT -d "{\"key\":\"$KEY\"}" "$A/sys/unseal"
sleep 2
curl -sf -o /dev/null -H "$H" -X POST -d '{"type":"kv","options":{"version":"2"}}' "$A/sys/mounts/production"
sleep 1
curl -sf -o /dev/null -H "$H" -X POST -d '{"data":{"KEY":"first","PEM":"-----BEGIN-----\nx\n-----END-----"}}' "$A/production/data/app/config"
curl -sf -o /dev/null -H "$H" -X POST -d '{"data":{"KEY":"second"}}' "$A/production/data/app/config"
curl -sf -o /dev/null -H "$H" -X POST -d '{"type":"approle"}' "$A/sys/auth/approle"
curl -sf -o /dev/null -H "$H" -X POST -d '{"token_policies":"default"}' "$A/auth/approle/role/app"
docker stop -t 20 "$VOL-legacy" >/dev/null

for boot in 1 2 3; do
  echo "--- boot $boot with $IMAGE"
  if [ "$boot" = 1 ]; then
    docker run -d --init --name "$VOL-new" -e BAO_DEV=0 -p "127.0.0.1:${PORT}:3000" -v "$VOL:/bao/file" "$IMAGE" >/dev/null
  else
    docker restart -t 20 "$VOL-new" >/dev/null
  fi
  wait_up
  [ "$(curl -sf "$A/sys/seal-status" | json 'd["storage_type"]')" = raft ] || { echo "not on raft" >&2; exit 1; }
  curl -sf -o /dev/null -X PUT -d "{\"key\":\"$KEY\"}" "$A/sys/unseal"
  for _ in $(seq 30); do curl -sf -o /dev/null -H "$H" "$A/sys/leader" && break; sleep 1; done
  got="$(curl -sf -H "$H" "$A/production/data/app/config" | json 'd["data"]["data"]["KEY"]')"
  pem="$(curl -sf -H "$H" "$A/production/data/app/config?version=1" | json 'd["data"]["data"]["PEM"]')"
  role="$(curl -sf -H "$H" "$A/auth/approle/role/app" | json 'd["data"]["token_policies"][0]')"
  if [ "$got" != second ] || [ "$pem" != $'-----BEGIN-----\nx\n-----END-----' ] || [ "$role" != default ]; then
    echo "data mismatch on boot $boot: KEY=$got role=$role" >&2
    docker logs "$VOL-new" 2>&1 | tail -30 >&2
    exit 1
  fi
  echo "ok: unsealed with the original key, secret versions and auth roles intact"
done
if docker logs "$VOL-new" 2>&1 | grep -q '^panic:'; then echo "OpenBao panicked" >&2; exit 1; fi
echo "--- migration test passed"

# Production deployment security

This document describes the deployment boundary for OpenBao UI. It complements
[`SECURITY.md`](../SECURITY.md); it does not replace OpenBao's own operational
security guidance.

## Public surface

Expose only the Next.js application on HTTPS. The supported public surface is:

- `/ui2/*` — the application UI
- `/ui2/api/*` — bounded BFF endpoints

Do **not** proxy any of these paths from the internet to embedded OpenBao:

- `/v1/*` — raw OpenBao HTTP API
- `/ui/*` — OpenBao stock UI
- OpenBao port `8200`

In particular, OpenBao initialization and unseal must be performed by an
operator with local access to the service. They must not be made available as a
browser bootstrap flow or public reverse-proxy route.

## Reverse-proxy rate limiting

Application-level limits are only defense in depth. The main production limiter
belongs at the reverse proxy, WAF, or edge because it can use a trustworthy
client address and applies a quota shared by every app replica.

At minimum, rate-limit credential submission at `/ui2/api/auth/login`. With a
Caddy build that includes the `rate_limit` handler, this is a suitable pattern:

```caddyfile
# Protect the OpenBao UI credential endpoint at the edge.
(rl_openbao_login) {
    @login path /ui2/api/auth/login
    rate_limit @login {
        zone openbao_ui_login_burst {
            key {client_ip}
            events 5
            window 1m
        }

        zone openbao_ui_login_slow {
            key {client_ip}
            events 15
            window 10m
        }
    }
}

bao.example.com {
    import rl_openbao_login
    reverse_proxy openbao-ui:3000
}
```

Adapt quotas to the site's traffic and authentication policy. Apply an
additional, less restrictive limit to the broader public application surface.
If a CDN or load balancer terminates traffic before Caddy, configure trusted
proxies correctly before using a forwarded client-IP header. Never trust a
client-supplied `X-Forwarded-For` header directly.

## TLS and origin configuration

Terminate TLS at the reverse proxy and forward the public host/proto headers
correctly. Set the canonical HTTPS origin explicitly:

```dotenv
OPENBAO_UI_PUBLIC_URL=https://bao.example.com
```

This value is used for OIDC redirect URI construction and CSRF origin checks.
Keep it synchronized with the redirect URI allow-list at the identity provider.
Add HSTS at the TLS edge after confirming the domain is permanently HTTPS-only.

## Container runtime

The production Compose configuration runs the container non-root with dropped
Linux capabilities, `no-new-privileges`, an init process, and a PID limit. It
uses the `openbao-data` named volume so Docker initializes `/bao/file` with the
ownership required by the non-root `bao` user. Keep the storage volume
persistent and protected; do not mount it into unrelated containers and never
run `docker compose down -v` during an upgrade. If you replace the named volume
with a host bind, create the host directory first and make it writable by the
image's `bao` UID/GID (`100:101`) before starting the service.

The bundled configuration currently keeps the existing `storage "file"` path at
`/bao/file` so an image upgrade does not silently replace an initialized
installation with an empty Raft backend. OpenBao 2.6 deprecates file storage and
plans to remove it in 2.7. Migrate deliberately: stop the service, create and
verify a backup, run the documented offline `bao operator migrate` file-to-Raft
procedure into a separate persistent path, update the mounted configuration and
volume mapping together, and keep the original data as rollback until the Raft
instance has been initialized/unsealed and verified. Do not convert storage as a
side effect of pulling a newer UI image.

`BAO_DEV=1` is development-only. Production startup fails if development mode
is enabled. Do not expose a development container publicly.

## Image and configuration hygiene

- Use the repository's digest-pinned OpenBao source in `.openbao-image`.
- Keep secrets, private keys, runtime data, and real `.env` files outside Git
  and outside Docker build context.
- Use `.env.example` only as a non-secret configuration template.
- Re-run Compose rendering and Caddy validation after deployment changes.

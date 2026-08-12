# Security model

This UI is a bounded backend-for-frontend (BFF) in front of OpenBao. OpenBao
remains the source of truth and the authorization enforcement point for secret
operations.

## Public boundary

- Only the Next.js application port is exposed. Embedded OpenBao listens on
  loopback and is not published by Compose.
- The application serves its own UI under `/ui2/*` and its bounded BFF endpoints
  under `/ui2/api/*`.
- The raw OpenBao API (`/v1/*`) and OpenBao stock UI (`/ui/*`) are **not**
  reverse-proxied by the app.
- Initialization and unseal are operator-only local procedures. Do not expose
  OpenBao bootstrap endpoints through a public reverse proxy.

## Token handling

- The OpenBao token is stored in an **httpOnly** cookie, so client-side
  JavaScript cannot read it.
- Production session cookies use `Secure`, `SameSite=Lax`, and path `/`.
- All authenticated OpenBao calls go through `/ui2/api/bao/*`; the BFF injects
  the token server-side. The browser never sends the token directly.

## Authorization

- OpenBao enforces authorization for secret operations. The BFF is no more
  privileged than the user's token.
- Sensitive local metadata and audit-log access require the app's operator
  authorization, not merely a valid OpenBao token.
- UI capability checks are affordances only; they are not a security boundary.

## CSRF and OIDC

- State-changing BFF routes reject cross-site browser requests with Origin /
  `Sec-Fetch-Site` validation.
- OIDC uses a server-generated transaction nonce. In production, transaction
  cookies use `__Host-` names and are cleared immediately after callback
  processing.
- Configure an exact public HTTPS origin with `OPENBAO_UI_PUBLIC_URL` for OIDC
  redirect URI and CSRF origin validation.

## Request limits and rate limiting

- The application enforces request/response body limits, upstream timeouts, and
  a local limiter as defense in depth.
- **The authoritative production request-rate limit must be enforced at the
  reverse proxy, WAF, or edge.** That layer has a trustworthy client address and
  can apply one shared quota across every application replica.
- Do not treat the in-process application limiter as a substitute for edge rate
  limiting. Configure a strict edge limit for `/ui2/api/auth/login` and broader
  limits for the remaining public surface. See
  [`docs/deployment-security.md`](docs/deployment-security.md).

## Response headers

The app sends a restrictive Content Security Policy, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`.
Deploy behind TLS and add HSTS at the TLS reverse proxy.

## Deployment safeguards

- `BAO_DEV=1` is development-only and fails closed in a production runtime.
- The runtime container runs as a non-root user with dropped Linux capabilities,
  `no-new-privileges`, an init process, and a PID limit in Compose.
- `.env*`, runtime state, keys, and local credential files are excluded from Git
  and Docker build context (except the tracked `.env.example` template).
- The embedded OpenBao image is pinned by digest in `.openbao-image`; do not
  replace it with an unverified mutable image tag.

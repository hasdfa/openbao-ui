import type { NextConfig } from "next";

import { BASE_PATH } from "./lib/base-path";

/**
 * The "marry" layer between our custom frontend and the OpenBao backend.
 *
 *   /ui2/*      -> React pages (this app, served under basePath)
 *   /ui2/api/*  -> Next.js route handlers (our BFF: auth, session, ...)
 *   /ui/*       -> rewritten/proxied to OpenBao's own stock web UI
 *   /v1/*       -> rewritten/proxied to the local OpenBao API
 *
 * In the single Docker image OpenBao runs on 127.0.0.1:8200 and Next.js is the
 * only exposed port; it proxies UI + API traffic to OpenBao via the rewrites
 * below. Moving our app to /ui2 lets the stock OpenBao UI keep /ui.
 */
const OPENBAO_ADDR = process.env.OPENBAO_ADDR ?? "http://127.0.0.1:8200";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: BASE_PATH,
  // OpenBao's stock UI canonicalizes to a trailing slash (`/ui` -> 307 -> `/ui/`).
  // Next's default trailing-slash redirect does the opposite (`/ui/` -> 308 ->
  // `/ui`), which would bounce forever against the proxied stock UI. Skip Next's
  // redirect so `/ui/` is proxied straight through and resolves (200).
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        // OpenBao's stock UI canonicalizes to `/ui/`. Proxy the bare root
        // explicitly to `…/ui/` (trailing slash preserved): with the catch-all
        // below, an empty `:path*` makes Next trim the slash to `…/ui`, which
        // OpenBao 307s back to `/ui/` — an infinite loop. These two literal
        // rules short-circuit that.
        source: "/ui",
        destination: `${OPENBAO_ADDR}/ui/`,
        basePath: false,
      },
      {
        source: "/ui/",
        destination: `${OPENBAO_ADDR}/ui/`,
        basePath: false,
      },
      {
        // OpenBao's own stock UI (and its assets) live under /ui — front it so
        // both UIs are reachable. basePath:false keeps it at /ui (NOT /ui2/ui).
        // `:path+` (one-or-more) so the empty-root case is handled above.
        source: "/ui/:path+",
        destination: `${OPENBAO_ADDR}/ui/:path+`,
        basePath: false,
      },
      {
        // basePath:false keeps the proxy at /v1 (NOT /ui2/v1).
        source: "/v1/:path*",
        destination: `${OPENBAO_ADDR}/v1/:path*`,
        basePath: false,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: BASE_PATH,
        basePath: false,
        permanent: false,
      },
      {
        // skipTrailingSlashRedirect (above) also skips `/ui2/` -> `/ui2`, and
        // Next answers the slashed app root with an empty 200. Deeper paths
        // still route with a trailing slash, so only the root needs this.
        source: `${BASE_PATH}/`,
        destination: BASE_PATH,
        basePath: false,
        permanent: false,
      },
    ];
  },
  async headers() {
    // Security headers for a secrets UI: no framing (clickjacking), no MIME
    // sniffing, and no referrer leakage of paths to third parties.
    return [
      {
        source: "/:path*",
        basePath: false,
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;

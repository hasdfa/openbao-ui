import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { API_BASE } from "@/lib/base-path";
import { isCrossSiteRequest } from "@/lib/csrf";
import { getConfig } from "@/lib/db";
import {
  resolveOidcStartRole,
  safeAuthMount,
  withGoogleHostedDomain,
  type OidcDomainRoles,
} from "@/lib/oidc-domains";
import { openbao, OpenBaoRequestError } from "@/lib/openbao";
import { requestOrigin } from "@/lib/request-origin";

/**
 * POST /ui2/api/auth/oidc/start  { mount?, role?, hd?, email? }
 * Returns the provider auth URL to redirect to, and stashes the client nonce +
 * mount in httpOnly cookies for the callback to use.
 *
 * NOTE: requires an OIDC auth method configured in OpenBao with this app's
 * callback registered as an allowed redirect URI.
 */
export async function POST(req: NextRequest) {
  if (isCrossSiteRequest(req)) {
    return NextResponse.json({ error: "cross-site request blocked" }, { status: 403 });
  }
  let body: { mount?: string; role?: string; hd?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const mount = safeAuthMount(body.mount || "oidc");
  if (!mount) {
    return NextResponse.json({ error: "Invalid auth mount" }, { status: 400 });
  }
  const cfg = (getConfig<{ oidcDomainRoles?: OidcDomainRoles }>("ui") ?? {}) as {
    oidcDomainRoles?: OidcDomainRoles;
  };
  const resolved = resolveOidcStartRole({
    spec: cfg.oidcDomainRoles,
    mount,
    email: body.email,
    role: body.role,
  });
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }
  const role = resolved.role;
  const hd = resolved.hd;
  const nonce = crypto.randomUUID();
  // Must match the role's allowed_redirect_uris, which the setup wizard registers
  // from the browser's window.location.origin — so derive the same browser-facing
  // origin here, NOT the standalone server's internal 0.0.0.0 bind address.
  const redirectUri = `${requestOrigin(req)}${API_BASE}/auth/oidc/callback`;

  try {
    const res = await openbao.oidcAuthURL(mount, role, redirectUri, nonce);
    // OpenBao returns 200 with an empty auth_url (no error) when the role's
    // allowed_redirect_uris doesn't include this exact URI, or role_type isn't
    // "oidc". Surface that as an actionable error instead of a silent dead-end.
    if (!res.data.auth_url) {
      return NextResponse.json(
        {
          error: `OpenBao returned no authorization URL. Add "${redirectUri}" to the "${role || "default"}" role's allowed_redirect_uris and ensure role_type is "oidc".`,
        },
        { status: 400 },
      );
    }
    const store = await cookies();
    const opts = {
      httpOnly: true as const,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 300,
    };
    store.set("oidc_nonce", nonce, opts);
    store.set("oidc_mount", mount, opts);
    const authUrl = hd
      ? withGoogleHostedDomain(res.data.auth_url, hd)
      : res.data.auth_url;
    return NextResponse.json({ authUrl });
  } catch (err) {
    const msg =
      err instanceof OpenBaoRequestError
        ? err.errors.join(", ")
        : "Could not start OIDC login";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { BASE_PATH } from "@/lib/base-path";
import { openbao } from "@/lib/openbao";
import { requestOrigin } from "@/lib/request-origin";
import { getOidcTransactionCookieNames, setToken } from "@/lib/session";

/**
 * GET /ui2/api/auth/oidc/callback?code=&state=
 * The OIDC provider redirects here; we exchange the code for a token, store it,
 * and bounce to the app.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";

  const store = await cookies();
  const transactionCookies = getOidcTransactionCookieNames();
  const nonce = store.get(transactionCookies.nonce)?.value ?? "";
  const mount = store.get(transactionCookies.mount)?.value ?? "oidc";
  store.delete(transactionCookies.nonce);
  store.delete(transactionCookies.mount);

  // Redirect back to the browser-facing origin, not the standalone server's
  // internal 0.0.0.0 bind address (see lib/request-origin).
  const origin = requestOrigin(req);
  const loginUrl = new URL(`${BASE_PATH}/login`, origin);

  if (!code || !state || !nonce) {
    loginUrl.searchParams.set("error", "Invalid OIDC callback");
    return NextResponse.redirect(loginUrl);
  }

  try {
    const res = await openbao.oidcCallback(mount, state, code, nonce);
    await setToken(res.auth.client_token, res.auth.lease_duration);
    return NextResponse.redirect(new URL(BASE_PATH, origin));
  } catch {
    loginUrl.searchParams.set("error", "OIDC login failed");
    return NextResponse.redirect(loginUrl);
  }
}

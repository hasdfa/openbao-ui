import { cookies } from "next/headers";
import { NextRequest } from "next/server";

import { API_BASE } from "@/lib/base-path";
import { isCrossSiteRequest } from "@/lib/csrf";
import {
  asJsonResponse,
  Dependency,
  forbidden,
  invalidRequest,
  payloadTooLarge,
  rateLimited,
  serviceUnavailable,
  success,
} from "@/lib/http/response";
import { openbao, OpenBaoRequestError } from "@/lib/openbao";
import { FixedWindowRateLimiter } from "@/lib/rate-limit";
import { parseJsonBody, RequestBodyError } from "@/lib/request-body";
import { requestOrigin } from "@/lib/request-origin";
import { getOidcTransactionCookieNames } from "@/lib/session";

const oidcStartRateLimiter = new FixedWindowRateLimiter(20, 60_000);
const SafeAuthMount = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const MaxOidcStartBodyBytes = 4 * 1024;
type OidcStartPayload = { mount?: string; role?: string };

function isSafeAuthMount(value: unknown): value is string {
  return typeof value === "string" && SafeAuthMount.test(value);
}

function isOidcStartPayload(value: unknown): value is OidcStartPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const payload = value as Record<string, unknown>;
  return (
    (payload.mount === undefined || typeof payload.mount === "string") &&
    (payload.role === undefined || typeof payload.role === "string")
  );
}

function oidcRateLimitKey(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() || "unknown"
  );
}
function bodyFailure(error: unknown) {
  return error instanceof RequestBodyError && error.status === 413
    ? payloadTooLarge("The OIDC start request body is too large.")
    : invalidRequest("The request body must be valid JSON.");
}

export async function POST(req: NextRequest) {
  if (isCrossSiteRequest(req))
    return asJsonResponse(forbidden("Cross-site requests are not allowed."));
  let body: OidcStartPayload;
  try {
    const parsed = await parseJsonBody<unknown>(req, MaxOidcStartBodyBytes);
    if (!isOidcStartPayload(parsed)) {
      return asJsonResponse(
        invalidRequest("The OIDC start request body is invalid."),
      );
    }
    body = parsed;
  } catch (error) {
    return asJsonResponse(bodyFailure(error));
  }
  const mount = body.mount ?? "oidc";
  if (
    !isSafeAuthMount(mount) ||
    (body.role !== undefined && !isSafeAuthMount(body.role))
  ) {
    return asJsonResponse(invalidRequest("OIDC mount or role is invalid."));
  }
  if (!oidcStartRateLimiter.consume(oidcRateLimitKey(req)))
    return asJsonResponse(rateLimited());

  const nonce = crypto.randomUUID();
  const redirectUri = `${requestOrigin(req)}${API_BASE}/auth/oidc/callback`;
  try {
    const result = await openbao.oidcAuthURL(
      mount,
      body.role,
      redirectUri,
      nonce,
    );
    if (!result.data.auth_url)
      return asJsonResponse(
        invalidRequest("OpenBao did not return an authorization URL."),
      );
    const store = await cookies();
    const cookieOptions = {
      httpOnly: true as const,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 300,
    };
    const transactionCookies = getOidcTransactionCookieNames();
    store.set(transactionCookies.nonce, nonce, cookieOptions);
    store.set(transactionCookies.mount, mount, cookieOptions);
    return asJsonResponse(success({ authUrl: result.data.auth_url }));
  } catch (error) {
    if (error instanceof OpenBaoRequestError) {
      return asJsonResponse(
        error.status === 400 || error.status === 403
          ? invalidRequest("OpenBao rejected the OIDC configuration.")
          : serviceUnavailable(Dependency.OpenBao),
      );
    }
    return asJsonResponse(serviceUnavailable(Dependency.OpenBao));
  }
}

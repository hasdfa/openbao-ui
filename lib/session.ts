import { cookies } from "next/headers";

import { openbao, OpenBaoRequestError } from "@/lib/openbao";

/**
 * The OpenBao token is stored in an httpOnly cookie so it is never exposed to
 * client-side JavaScript. All authenticated calls go through the BFF, which
 * reads the token from this cookie server-side.
 */
const isProd = process.env.NODE_ENV === "production";

/**
 * __Host- cookies cannot be set by a subdomain, preventing cookie tossing for
 * the bearer token. HTTP development keeps a separate non-production name
 * because browsers reject Secure cookies on localhost HTTP.
 */
export function getCookieName(nodeEnv = process.env.NODE_ENV): string {
  return (
    process.env.BAO_COOKIE_NAME ??
    (nodeEnv === "production" ? "__Host-bao_token" : "bao_token")
  );
}

export function getOidcTransactionCookieNames(nodeEnv = process.env.NODE_ENV): {
  nonce: string;
  mount: string;
} {
  return nodeEnv === "production"
    ? { nonce: "__Host-bao_oidc_nonce", mount: "__Host-bao_oidc_mount" }
    : { nonce: "bao_oidc_nonce", mount: "bao_oidc_mount" };
}

export const COOKIE_NAME = getCookieName();

export async function getToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value;
}

/**
 * Validates the bearer with OpenBao before local UI metadata relies on it.
 * Cookie presence alone is not authentication: callers can forge Cookie headers.
 */
export async function getValidatedToken(
  namespace?: string,
): Promise<string | undefined> {
  const token = await getToken();
  if (!token) return undefined;

  try {
    await openbao.lookupSelf(token, namespace);
    return token;
  } catch (error) {
    if (error instanceof OpenBaoRequestError && error.status === 403) {
      await clearToken();
      return undefined;
    }
    throw error;
  }
}

export async function setToken(token: string, maxAgeSeconds: number) {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    // Fall back to a session cookie when OpenBao reports no lease duration.
    maxAge: maxAgeSeconds > 0 ? maxAgeSeconds : undefined,
  });
}

export async function clearToken() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

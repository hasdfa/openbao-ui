import type { NextRequest } from "next/server";

/**
 * Fixed external origin for redirects and CSRF validation. Reject malformed
 * configured values rather than silently falling back to attacker-controlled
 * proxy headers.
 */
export function configuredOrigin(): string | undefined {
  const raw = process.env.OPENBAO_UI_PUBLIC_URL?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/**
 * Production redirects need an explicit immutable public origin. Development
 * can safely use the request URL, but never accepts forwarded host/proto as an
 * origin source because a direct client can forge those headers.
 */
export function requestOrigin(req: NextRequest): string {
  const override = configuredOrigin();
  if (override) return override;
  if (process.env.NODE_ENV === "production") {
    throw new Error("OPENBAO_UI_PUBLIC_URL must be a valid http(s) origin in production");
  }
  return new URL(req.url).origin;
}

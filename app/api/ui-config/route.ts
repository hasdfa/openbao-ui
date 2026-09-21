import { NextRequest, NextResponse } from "next/server";

import { isCrossSiteRequest } from "@/lib/csrf";
import { getConfig, setConfig } from "@/lib/db";
import {
  googleLoginHint,
  normalizeDomain,
  safeAuthMount,
  type OidcDomainRoles,
} from "@/lib/oidc-domains";
import { configuredOrigin } from "@/lib/request-origin";
import { getToken } from "@/lib/session";
import { isOperator } from "@/lib/ui-admin";

/**
 * UI configuration (branding + login customization).
 *   GET  /ui2/api/ui-config  — PUBLIC, returns only whitelisted presentation
 *                             fields so the unauthenticated login page can brand
 *                             itself. Never returns secrets.
 *   PUT  /ui2/api/ui-config  — root-namespace operator only. This is a single
 *                             server-global blob (one CONFIG_KEY, not
 *                             per-namespace), so authorization is checked in the
 *                             root namespace regardless of the caller's current
 *                             namespace — a child-namespace operator must not be
 *                             able to change server-wide login branding.
 *
 * Phase 1 establishes the route + store; Phase 2 (login customization) fills in
 * branding/default-method/ordering on top of it.
 */
export const dynamic = "force-dynamic";

function parseOidcDomainRoles(
  raw: unknown,
): { spec: OidcDomainRoles } | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "oidcDomainRoles must be an object" };
  }
  const value = raw as Record<string, unknown>;
  const mount = safeAuthMount(typeof value.mount === "string" ? value.mount : "");
  if (!mount) return { error: "oidcDomainRoles.mount is invalid" };
  const rolesIn = Array.isArray(value.roles) ? value.roles : null;
  if (!rolesIn) return { error: "oidcDomainRoles.roles must be an array" };
  const roles: OidcDomainRoles["roles"] = [];
  for (const row of rolesIn) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { error: "oidcDomainRoles.roles entries must be objects" };
    }
    const rec = row as Record<string, unknown>;
    const domain = typeof rec.domain === "string" ? normalizeDomain(rec.domain) : null;
    const role = typeof rec.role === "string" ? rec.role.trim() : "";
    if (!domain || !role) return { error: "oidcDomainRoles.roles need a domain and role" };
    roles.push({ domain, role });
  }
  const fallbackRole =
    typeof value.fallbackRole === "string" && value.fallbackRole.trim()
      ? value.fallbackRole.trim()
      : undefined;
  return { spec: { mount, roles, fallbackRole } };
}

const CONFIG_KEY = "ui";

// Fields safe to expose without authentication (login page branding).
const PUBLIC_KEYS = [
  "branding",
  "defaultLoginMethod",
  "hideTokenLogin",
  "loginMethodOrder",
] as const;

type UiConfig = Record<string, unknown>;

export async function GET() {
  const cfg = (getConfig<UiConfig>(CONFIG_KEY) ?? {}) as UiConfig;
  const pub: UiConfig = {};
  for (const k of PUBLIC_KEYS) {
    if (k in cfg) pub[k] = cfg[k];
  }
  // Surface the OPENBAO_UI_PUBLIC_URL override (if set) so client-side setup —
  // e.g. the Google wizard registering allowed_redirect_uris — derives the same
  // redirect URI the server's login route will send, instead of the browser's
  // origin. Env-derived and read-only; not persisted via PUT.
  const publicUrl = configuredOrigin();
  if (publicUrl) pub.publicUrl = publicUrl;
  const spec = cfg.oidcDomainRoles as OidcDomainRoles | undefined;
  if (spec) {
    pub.oidcNeedsEmail = googleLoginHint(spec.roles ?? [], spec.fallbackRole).askEmail;
  }
  return NextResponse.json({ config: pub });
}

export async function PUT(req: NextRequest) {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ errors: ["not authenticated"] }, { status: 401 });
  }
  if (isCrossSiteRequest(req)) {
    return NextResponse.json(
      { errors: ["cross-site request blocked"] },
      { status: 403 },
    );
  }
  // Global setting → require mount-management capability in the ROOT namespace,
  // not whatever namespace the caller is currently browsing.
  if (!(await isOperator(token, ""))) {
    return NextResponse.json(
      { errors: ["forbidden: requires mount-management capability"] },
      { status: 403 },
    );
  }

  let body: UiConfig;
  try {
    body = (await req.json()) as UiConfig;
  } catch {
    return NextResponse.json({ errors: ["invalid JSON"] }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { errors: ["body must be a JSON object"] },
      { status: 400 },
    );
  }

  if ("oidcDomainRoles" in body && body.oidcDomainRoles != null) {
    const parsed = parseOidcDomainRoles(body.oidcDomainRoles);
    if ("error" in parsed) {
      return NextResponse.json({ errors: [parsed.error] }, { status: 400 });
    }
    body.oidcDomainRoles = parsed.spec;
  }

  const current = (getConfig<UiConfig>(CONFIG_KEY) ?? {}) as UiConfig;
  const merged = { ...current, ...body };
  try {
    setConfig(CONFIG_KEY, merged);
    return NextResponse.json({ config: merged });
  } catch {
    return NextResponse.json(
      { errors: ["could not save config"] },
      { status: 500 },
    );
  }
}

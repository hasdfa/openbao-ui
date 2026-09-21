/**
 * Google / OIDC email-domain restriction and per-domain role routing.
 *
 * OpenBao is the authority: each planned role carries `bound_claims` on
 * `email` (glob). The UI config map is only a login hint for which role to
 * request *before* Google redirects — a mismatched or stale hint still fails
 * closed at OpenBao.
 */

export type OidcDomainRoute = {
  domain: string;
  role: string;
};

export type OidcDomainRoles = {
  mount: string;
  roles: OidcDomainRoute[];
};

export type DomainPolicyRow = {
  domain: string;
  policies: string;
};

export type PlannedOidcRole = {
  name: string;
  domains: string[];
  policies: string[];
  body: Record<string, unknown>;
};

export type GoogleOidcPlan = {
  roles: PlannedOidcRole[];
  defaultRole: string;
  domainRoutes: OidcDomainRoute[];
};

const DOMAIN_RE =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/** Normalize a domain or `@domain` / `user@domain` token. Null if invalid. */
export function normalizeDomain(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  const at = value.lastIndexOf("@");
  if (at >= 0) value = value.slice(at + 1);
  value = value.replace(/^\.+|\.+$/g, "");
  if (value.length > 253 || !DOMAIN_RE.test(value)) return null;
  return value;
}

export function parseDomains(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,\s]+/)) {
    if (!part.trim()) continue;
    const domain = normalizeDomain(part);
    if (!domain) {
      throw new Error(`Invalid email domain: ${part.trim()}`);
    }
    if (!seen.has(domain)) {
      seen.add(domain);
      out.push(domain);
    }
  }
  return out;
}

export function parsePolicies(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const name = part.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function emailDomain(email: string): string | null {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  return normalizeDomain(trimmed.slice(at + 1));
}

/** Exact domain match only — `mail.acme.com` does not inherit `acme.com`. */
export function matchDomainRole(
  email: string,
  roles: OidcDomainRoute[],
): OidcDomainRoute | null {
  const domain = emailDomain(email);
  if (!domain) return null;
  return roles.find((r) => r.domain === domain) ?? null;
}

export function uniqueRoleNames(roles: OidcDomainRoute[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const r of roles) {
    if (seen.has(r.role)) continue;
    seen.add(r.role);
    names.push(r.role);
  }
  return names;
}

/** How the unauthenticated login page should start Google OIDC. */
export function googleLoginHint(routes: OidcDomainRoute[]): {
  askEmail: boolean;
  role?: string;
  hd?: string;
} {
  if (uniqueRoleNames(routes).length > 1) return { askEmail: true };
  return {
    askEmail: false,
    role: routes[0]?.role,
    hd: routes.length === 1 ? routes[0].domain : undefined,
  };
}

export function slugDomain(domain: string): string {
  return domain.replace(/\./g, "-");
}

export function emailGlobs(domains: string[]): string[] {
  return domains.map((d) => `*@${d}`);
}

export function boundClaimsForDomains(domains: string[]) {
  return {
    bound_claims_type: "glob" as const,
    bound_claims: { email: emailGlobs(domains) },
  };
}

/** Hint Google's account picker; OpenBao `bound_claims` still authorize. */
export function withGoogleHostedDomain(
  authUrl: string,
  domain: string | undefined,
): string {
  const hd = domain ? normalizeDomain(domain) : null;
  if (!hd) return authUrl;
  let url: URL;
  try {
    url = new URL(authUrl);
  } catch {
    return authUrl;
  }
  if (
    url.hostname !== "accounts.google.com" &&
    !url.hostname.endsWith(".google.com")
  ) {
    return authUrl;
  }
  url.searchParams.set("hd", hd);
  return url.toString();
}

function oidcRoleBody(opts: {
  redirectUri: string;
  policies: string[];
  domains: string[];
  groupsClaim: string;
}): Record<string, unknown> {
  return {
    role_type: "oidc",
    user_claim: "email",
    oidc_scopes: ["openid", "email", "profile"],
    allowed_redirect_uris: [opts.redirectUri],
    token_policies: opts.policies,
    ...(opts.groupsClaim.trim()
      ? { groups_claim: opts.groupsClaim.trim() }
      : {}),
    ...(opts.domains.length ? boundClaimsForDomains(opts.domains) : {}),
  };
}

function parseDomainPolicyRows(rows: DomainPolicyRow[]): {
  domain: string;
  policies: string[];
}[] {
  const out: { domain: string; policies: string[] }[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const raw = row.domain.trim();
    if (!raw) continue;
    const domain = normalizeDomain(raw);
    if (!domain) throw new Error(`Invalid email domain: ${raw}`);
    if (seen.has(domain)) throw new Error(`Duplicate email domain: ${domain}`);
    const policies = parsePolicies(row.policies);
    if (policies.length === 0) {
      throw new Error(`Policies required for ${domain}`);
    }
    seen.add(domain);
    out.push({ domain, policies });
  }
  return out;
}

/**
 * Build the OpenBao OIDC roles + login routes for the Google wizard.
 *
 * - No domains and no per-domain rows → one unrestricted role (today's behavior).
 * - Allowed domains only → one role bound to every domain, shared policies.
 * - Per-domain rows → one role per domain (login asks for work email when more
 *   than one role exists). Allowed-only domains not in the table get the
 *   default policies on the base role name.
 */
export function planGoogleOidcRoles(input: {
  role: string;
  policies: string;
  allowedDomains: string;
  domainPolicies: DomainPolicyRow[];
  groupsClaim: string;
  redirectUri: string;
}): GoogleOidcPlan {
  const base = input.role.trim() || "default";
  const defaultPolicies = parsePolicies(input.policies);
  if (defaultPolicies.length === 0) {
    throw new Error("At least one token policy is required");
  }
  const allowed = parseDomains(input.allowedDomains);
  const overrides = parseDomainPolicyRows(input.domainPolicies);
  const overrideDomains = new Set(overrides.map((o) => o.domain));
  const leftover = allowed.filter((d) => !overrideDomains.has(d));

  const roles: PlannedOidcRole[] = [];

  const pushRole = (name: string, domains: string[], policies: string[]) => {
    roles.push({
      name,
      domains,
      policies,
      body: oidcRoleBody({
        redirectUri: input.redirectUri,
        policies,
        domains,
        groupsClaim: input.groupsClaim,
      }),
    });
  };

  if (overrides.length === 0) {
    pushRole(base, allowed, defaultPolicies);
  } else {
    const split = overrides.length + (leftover.length > 0 ? 1 : 0) > 1;
    for (const row of overrides) {
      const name = split ? `${base}-${slugDomain(row.domain)}` : base;
      pushRole(name, [row.domain], row.policies);
    }
    if (leftover.length > 0) {
      pushRole(base, leftover, defaultPolicies);
    }
  }

  const domainRoutes: OidcDomainRoute[] = [];
  for (const role of roles) {
    for (const domain of role.domains) {
      domainRoutes.push({ domain, role: role.name });
    }
  }

  return {
    roles,
    defaultRole: roles[0]?.name ?? base,
    domainRoutes,
  };
}

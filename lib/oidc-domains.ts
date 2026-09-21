/**
 * Google / OIDC email-domain restriction and Team-role assignment.
 *
 * OpenBao is the authority: `bound_claims` on `email` is the allowlist and
 * OIDC `token_policies` grant the Team role at login. The UI-config map is
 * only a server-side hint for which role to request before Google redirects.
 */

export const DEFAULT_POLICY = "default";

export type OidcDomainRoute = {
  domain: string;
  role: string;
};

export type OidcDomainRoles = {
  mount: string;
  roles: OidcDomainRoute[];
  /** Unrestricted catch-all OIDC role name. Unknown emails use this. */
  fallbackRole?: string;
};

export type DomainRoleRow = {
  domain: string;
  teamRole: string;
};

export type PlannedOidcRole = {
  name: string;
  domains: string[];
  teamRole: string;
  policies: string[];
  body: Record<string, unknown>;
};

export type GoogleOidcPlan = {
  roles: PlannedOidcRole[];
  defaultOidcRole?: string;
  domainRoutes: OidcDomainRoute[];
  fallbackRole?: string;
  teamRolesToEnsure: string[];
};

const DOMAIN_RE =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

export function ssoGroupName(teamRole: string): string {
  return `sso-${teamRole}`;
}

export function isSsoGroup(name: string, type?: string): boolean {
  return type === "external" || name.startsWith("sso-");
}

export function displayTeamRole(groupName: string): string {
  return groupName.startsWith("sso-") ? groupName.slice(4) : groupName;
}

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

export function addDomain(list: string[], raw: string): string[] {
  const domain = normalizeDomain(raw);
  if (!domain) throw new Error(`Invalid email domain: ${raw.trim()}`);
  if (list.includes(domain)) return list;
  return [...list, domain];
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

export function googleLoginHint(
  routes: OidcDomainRoute[],
  fallbackRole?: string,
): {
  askEmail: boolean;
  role?: string;
  hd?: string;
} {
  const names = uniqueRoleNames(routes);
  if (fallbackRole && !names.includes(fallbackRole)) names.push(fallbackRole);
  if (names.length > 1) return { askEmail: true };
  return {
    askEmail: false,
    role: names[0] ?? fallbackRole,
    hd: routes.length === 1 && !fallbackRole ? routes[0].domain : undefined,
  };
}

export function resolveGoogleLogin(
  email: string,
  routes: OidcDomainRoute[],
  fallbackRole?: string,
): { role: string; hd?: string } | { error: string } {
  const match = matchDomainRole(email, routes);
  if (match) return { role: match.role, hd: match.domain };
  if (fallbackRole) {
    if (!emailDomain(email)) return { error: "Enter a work email." };
    return { role: fallbackRole };
  }
  if (routes.length > 0) return { error: "That email domain isn't allowed." };
  return { error: "That email domain isn't allowed." };
}

export function slugDomain(domain: string): string {
  return domain.replace(/\./g, "-");
}

const AUTH_MOUNT_RE = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

/** Reject path traversal before interpolating an unauthenticated OIDC mount. */
/** Names interpolated into OpenBao paths (roles, policies, apps). */
export function safeBaoName(raw: string | undefined): string | null {
  const name = (raw ?? "").trim();
  if (!name || name === "." || name === "..") return null;
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(name)) return null;
  return name;
}

export function safeAuthMount(raw: string | undefined): string | null {
  const mount = (raw || "oidc").replace(/\/+$/g, "");
  if (!mount || !AUTH_MOUNT_RE.test(mount)) return null;
  if (mount.split("/").some((part) => part === "." || part === "..")) return null;
  return mount;
}

export function resolveOidcStartRole(opts: {
  spec: OidcDomainRoles | undefined;
  mount: string;
  email?: string;
  role?: string;
}): { role?: string; hd?: string } | { error: string } {
  if (opts.spec) {
    const specMount = safeAuthMount(opts.spec.mount);
    if (!specMount) return { error: "Sign-in is misconfigured." };
    if (specMount !== opts.mount) {
      return { role: opts.role };
    }
  }
  const spec =
    opts.spec && safeAuthMount(opts.spec.mount) === opts.mount ? opts.spec : undefined;
  if (opts.email) {
    if (!spec) return { role: opts.role };
    return resolveGoogleLogin(opts.email, spec.roles ?? [], spec.fallbackRole);
  }
  const allowed = new Set([
    ...(spec?.roles ?? []).map((r) => r.role),
    ...(spec?.fallbackRole ? [spec.fallbackRole] : []),
  ]);
  if (!spec || allowed.size === 0) return { role: opts.role };
  if (opts.role) {
    if (!allowed.has(opts.role)) return { error: "Unknown sign-in role." };
    return { role: opts.role };
  }
  if (allowed.size === 1) return { role: [...allowed][0] };
  return { error: "Work email is required." };
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

export function policiesForTeamRole(teamRole: string): string[] {
  const name = teamRole.trim() || DEFAULT_POLICY;
  return [name];
}

function oidcRoleBody(opts: {
  redirectUri: string;
  policies: string[];
  domains: string[];
}): Record<string, unknown> {
  return {
    role_type: "oidc",
    user_claim: "email",
    oidc_scopes: ["openid", "email", "profile"],
    allowed_redirect_uris: [opts.redirectUri],
    token_policies: opts.policies,
    ...(opts.domains.length ? boundClaimsForDomains(opts.domains) : {}),
  };
}

/** Existing ACL policies are left alone; missing ones need a template. */
export function teamPolicyWrite(
  exists: boolean,
  hasTemplate: boolean,
): "skip" | "create" | "missing" {
  if (exists) return "skip";
  if (hasTemplate) return "create";
  return "missing";
}

function parseDomainRoleRows(rows: DomainRoleRow[]): {
  domain: string;
  teamRole: string;
}[] {
  const out: { domain: string; teamRole: string }[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const raw = row.domain.trim();
    if (!raw) continue;
    const domain = normalizeDomain(raw);
    if (!domain) throw new Error(`Invalid email domain: ${raw}`);
    if (seen.has(domain)) throw new Error(`Duplicate email domain: ${domain}`);
    const teamRole = row.teamRole.trim() || DEFAULT_POLICY;
    seen.add(domain);
    out.push({ domain, teamRole });
  }
  return out;
}

/**
 * Build OpenBao OIDC roles, login routes, and SSO group aliases.
 *
 * - Default Team role is granted to everyone who can join.
 * - Per-domain rows override that role for that domain.
 * - Restricted mode allowlists domains (fail closed).
 * - Per-domain role overrides require an allowlist: an unrestricted fallback
 *   role has no bound_claims, so a typed email could pick a more privileged
 *   role than OpenBao would later grant from the real Google account.
 */
export function planGoogleOidcRoles(input: {
  oidcRoleName: string;
  defaultTeamRole: string;
  restrict: boolean;
  allowedDomains: string[];
  domainRoles: DomainRoleRow[];
  redirectUri: string;
}): GoogleOidcPlan {
  const base = input.oidcRoleName.trim() || "default";
  const defaultTeamRole = input.defaultTeamRole.trim() || DEFAULT_POLICY;
  const overrides = parseDomainRoleRows(input.domainRoles);
  if (overrides.length > 0 && !input.restrict) {
    throw new Error("Per-domain roles require restricting sign-in to those domains");
  }
  if (!input.restrict && defaultTeamRole === "admin") {
    throw new Error("Admin cannot be granted to every Google account. Restrict to email domains first.");
  }
  const overrideDomains = new Set(overrides.map((o) => o.domain));

  const allowed: string[] = [];
  const seen = new Set<string>();
  for (const raw of input.allowedDomains) {
    const domain = normalizeDomain(raw);
    if (!domain) throw new Error(`Invalid email domain: ${raw}`);
    if (seen.has(domain)) continue;
    seen.add(domain);
    allowed.push(domain);
  }
  if (input.restrict) {
    for (const row of overrides) {
      if (!seen.has(row.domain)) {
        seen.add(row.domain);
        allowed.push(row.domain);
      }
    }
    if (allowed.length === 0) {
      throw new Error("Add at least one email domain, or allow any Google account");
    }
  }

  const leftover = input.restrict
    ? allowed.filter((d) => !overrideDomains.has(d))
    : [];

  const roles: PlannedOidcRole[] = [];
  const pushRole = (opts: {
    name: string;
    domains: string[];
    teamRole: string;
  }) => {
    const policies = policiesForTeamRole(opts.teamRole);
    roles.push({
      name: opts.name,
      domains: opts.domains,
      teamRole: opts.teamRole,
      policies,
      body: oidcRoleBody({
        redirectUri: input.redirectUri,
        policies,
        domains: opts.domains,
      }),
    });
  };

  if (overrides.length === 0) {
    if (input.restrict) {
      pushRole({
        name: base,
        domains: allowed,
        teamRole: defaultTeamRole,
      });
    } else {
      pushRole({
        name: base,
        domains: [],
        teamRole: defaultTeamRole,
      });
    }
  } else {
    const needFallback = leftover.length > 0;
    const split = overrides.length + (needFallback ? 1 : 0) > 1;
    for (const row of overrides) {
      pushRole({
        name: split ? `${base}-${slugDomain(row.domain)}` : base,
        domains: [row.domain],
        teamRole: row.teamRole,
      });
    }
    if (needFallback) {
      pushRole({
        name: base,
        domains: leftover,
        teamRole: defaultTeamRole,
      });
    }
  }

  const domainRoutes: OidcDomainRoute[] = [];
  for (const role of roles) {
    for (const domain of role.domains) {
      domainRoutes.push({ domain, role: role.name });
    }
  }

  const unrestricted = roles.find((r) => r.domains.length === 0);
  const fallbackRole = unrestricted?.name;
  const uniqueNames = uniqueRoleNames(domainRoutes);
  if (fallbackRole && !uniqueNames.includes(fallbackRole)) uniqueNames.push(fallbackRole);

  const teamRolesToEnsure = [
    ...new Set(roles.map((r) => r.teamRole).filter((n) => n !== DEFAULT_POLICY)),
  ];

  return {
    roles,
    defaultOidcRole: uniqueNames.length === 1 ? uniqueNames[0] : fallbackRole,
    domainRoutes,
    fallbackRole,
    teamRolesToEnsure,
  };
}

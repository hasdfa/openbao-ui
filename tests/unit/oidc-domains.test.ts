import { describe, expect, it } from "vitest";

import {
  DEFAULT_POLICY,
  addDomain,
  boundClaimsForDomains,
  displayTeamRole,
  emailDomain,
  googleLoginHint,
  isSsoGroup,
  matchDomainRole,
  normalizeDomain,
  parseDomains,
  planGoogleOidcRoles,
  resolveGoogleLogin,
  resolveOidcStartRole,
  safeAuthMount,
  ssoGroupName,
  teamPolicyWrite,
  uniqueRoleNames,
  withGoogleHostedDomain,
} from "@/lib/oidc-domains";

const redirectUri = "http://localhost/ui2/api/auth/oidc/callback";
const base = {
  oidcRoleName: "default",
  redirectUri,
};

describe("normalizeDomain", () => {
  it("accepts a bare domain, @prefix, and email", () => {
    expect(normalizeDomain("Acme.com")).toBe("acme.com");
    expect(normalizeDomain("@acme.com")).toBe("acme.com");
    expect(normalizeDomain("ada@acme.com")).toBe("acme.com");
  });

  it("rejects labels and hostnames without a dot", () => {
    expect(normalizeDomain("acme")).toBeNull();
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("acme.com/admin")).toBeNull();
  });
});

describe("parseDomains / addDomain", () => {
  it("splits, lowercases, and de-dupes domains", () => {
    expect(parseDomains("acme.com, @ACME.com vendor.io")).toEqual([
      "acme.com",
      "vendor.io",
    ]);
  });

  it("adds a chip without duplicates", () => {
    expect(addDomain(["acme.com"], "@Acme.com")).toEqual(["acme.com"]);
    expect(addDomain(["acme.com"], "vendor.io")).toEqual(["acme.com", "vendor.io"]);
  });
});

describe("matchDomainRole / resolveGoogleLogin", () => {
  const roles = [
    { domain: "acme.com", role: "default-acme-com" },
    { domain: "vendor.io", role: "default-vendor-io" },
  ];

  it("matches the exact email domain", () => {
    expect(matchDomainRole("Ada@Acme.com", roles)).toEqual(roles[0]);
  });

  it("does not let a subdomain inherit the parent domain", () => {
    expect(matchDomainRole("ada@mail.acme.com", roles)).toBeNull();
  });

  it("fails closed on an unknown domain when restricted", () => {
    expect(resolveGoogleLogin("ada@other.com", roles)).toEqual({
      error: "That email domain isn't allowed.",
    });
  });

  it("uses the fallback role for an unknown domain when open", () => {
    expect(resolveGoogleLogin("ada@gmail.com", roles, "default")).toEqual({
      role: "default",
    });
  });
});

describe("planGoogleOidcRoles", () => {
  it("writes one unrestricted role with the default Team role", () => {
    const plan = planGoogleOidcRoles({
      ...base,
      defaultTeamRole: "viewer",
      restrict: false,
      allowedDomains: [],
      domainRoles: [],
    });
    expect(plan.roles).toHaveLength(1);
    expect(plan.roles[0].body.bound_claims).toBeUndefined();
    expect(plan.roles[0].body.token_policies).toEqual(["viewer"]);
    expect(plan.roles[0].body.groups_claim).toBeUndefined();
    expect(plan.fallbackRole).toBe("default");
    expect(plan.defaultOidcRole).toBe("default");
    expect(plan.teamRolesToEnsure).toEqual(["viewer"]);
  });

  it("skips SSO aliases when the default is the OpenBao default policy", () => {
    const plan = planGoogleOidcRoles({
      ...base,
      defaultTeamRole: DEFAULT_POLICY,
      restrict: false,
      allowedDomains: [],
      domainRoles: [],
    });
    expect(plan.roles[0].body.groups_claim).toBeUndefined();
    expect(plan.teamRolesToEnsure).toEqual([]);
  });

  it("binds every allowed domain on a single shared role", () => {
    const plan = planGoogleOidcRoles({
      ...base,
      defaultTeamRole: "editor",
      restrict: true,
      allowedDomains: ["acme.com", "vendor.io"],
      domainRoles: [],
    });
    expect(plan.roles).toHaveLength(1);
    expect(plan.roles[0].body).toMatchObject({
      token_policies: ["editor"],
      ...boundClaimsForDomains(["acme.com", "vendor.io"]),
    });
    expect(plan.roles[0].body.groups_claim).toBeUndefined();
    expect(plan.domainRoutes).toEqual([
      { domain: "acme.com", role: "default" },
      { domain: "vendor.io", role: "default" },
    ]);
    expect(plan.defaultOidcRole).toBe("default");
    expect(uniqueRoleNames(plan.domainRoutes)).toEqual(["default"]);
    expect(plan.fallbackRole).toBeUndefined();
  });

  it("splits OIDC roles when Team roles differ per domain", () => {
    const plan = planGoogleOidcRoles({
      ...base,
      defaultTeamRole: "viewer",
      restrict: true,
      allowedDomains: [],
      domainRoles: [
        { domain: "acme.com", teamRole: "admin" },
        { domain: "vendor.io", teamRole: "viewer" },
      ],
    });
    expect(plan.roles.map((r) => r.name)).toEqual([
      "default-acme-com",
      "default-vendor-io",
    ]);
    expect(plan.roles[0].body).toMatchObject({
      token_policies: ["admin"],
      ...boundClaimsForDomains(["acme.com"]),
    });
    expect(plan.defaultOidcRole).toBeUndefined();
  });

  it("keeps leftover allowed domains on the default Team role", () => {
    const plan = planGoogleOidcRoles({
      ...base,
      defaultTeamRole: "viewer",
      restrict: true,
      allowedDomains: ["acme.com", "vendor.io"],
      domainRoles: [{ domain: "acme.com", teamRole: "admin" }],
    });
    expect(plan.roles.map((r) => ({ name: r.name, domains: r.domains, teamRole: r.teamRole }))).toEqual([
      { name: "default-acme-com", domains: ["acme.com"], teamRole: "admin" },
      { name: "default", domains: ["vendor.io"], teamRole: "viewer" },
    ]);
  });

  it("refuses admin for unrestricted Google join", () => {
    expect(() =>
      planGoogleOidcRoles({
        ...base,
        defaultTeamRole: "admin",
        restrict: false,
        allowedDomains: [],
        domainRoles: [],
      }),
    ).toThrow(/Admin cannot be granted/);
  });

  it("refuses per-domain roles without an allowlist (unrestricted fallback is unbound)", () => {
    expect(() =>
      planGoogleOidcRoles({
        ...base,
        defaultTeamRole: "admin",
        restrict: false,
        allowedDomains: [],
        domainRoles: [{ domain: "acme.com", teamRole: "viewer" }],
      }),
    ).toThrow(/restricting sign-in/);
  });

  it("refuses a restricted join with no domains", () => {
    expect(() =>
      planGoogleOidcRoles({
        ...base,
        defaultTeamRole: "viewer",
        restrict: true,
        allowedDomains: [],
        domainRoles: [],
      }),
    ).toThrow(/at least one email domain/);
  });
});

describe("googleLoginHint", () => {
  it("one-clicks an unrestricted mount", () => {
    expect(googleLoginHint([], "default")).toEqual({
      askEmail: false,
      role: "default",
      hd: undefined,
    });
  });

  it("hints hd only when a single domain is allowed", () => {
    expect(googleLoginHint([{ domain: "acme.com", role: "default" }])).toEqual({
      askEmail: false,
      role: "default",
      hd: "acme.com",
    });
  });

  it("asks for email when a fallback and an override both exist", () => {
    expect(
      googleLoginHint([{ domain: "acme.com", role: "default-acme-com" }], "default"),
    ).toEqual({ askEmail: true });
  });
});

describe("teamPolicyWrite", () => {
  it("does not overwrite an existing ACL policy", () => {
    expect(teamPolicyWrite(true, true)).toBe("skip");
    expect(teamPolicyWrite(true, false)).toBe("skip");
  });

  it("creates from a template only when the policy is missing", () => {
    expect(teamPolicyWrite(false, true)).toBe("create");
    expect(teamPolicyWrite(false, false)).toBe("missing");
  });
});

describe("sso group names", () => {
  it("prefixes external SSO groups and strips them for display", () => {
    expect(ssoGroupName("editor")).toBe("sso-editor");
    expect(displayTeamRole("sso-editor")).toBe("editor");
    expect(isSsoGroup("sso-editor", "external")).toBe(true);
    expect(isSsoGroup("editor", "internal")).toBe(false);
  });
});

describe("safeAuthMount / resolveOidcStartRole", () => {
  it("rejects path-traversal mounts", () => {
    expect(safeAuthMount("../../sys/init")).toBeNull();
    expect(safeAuthMount("oidc/")).toBe("oidc");
  });

  it("allowlists roles from the stored spec and requires email when several exist", () => {
    const spec = {
      mount: "oidc",
      roles: [
        { domain: "acme.com", role: "default-acme-com" },
        { domain: "vendor.io", role: "default-vendor-io" },
      ],
    };
    expect(resolveOidcStartRole({ spec, mount: "oidc", role: "other" })).toEqual({
      error: "Unknown sign-in role.",
    });
    expect(resolveOidcStartRole({ spec, mount: "oidc" })).toEqual({
      error: "Work email is required.",
    });
    expect(
      resolveOidcStartRole({ spec, mount: "oidc", email: "ada@acme.com" }),
    ).toEqual({ role: "default-acme-com", hd: "acme.com" });
  });
});

describe("withGoogleHostedDomain / emailDomain", () => {
  it("sets hd on accounts.google.com", () => {
    const url = withGoogleHostedDomain(
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=x",
      "acme.com",
    );
    expect(new URL(url).searchParams.get("hd")).toBe("acme.com");
  });

  it("reads the domain from an email", () => {
    expect(emailDomain("Ada@Acme.com")).toBe("acme.com");
  });
});

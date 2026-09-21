import { describe, expect, it } from "vitest";

import {
  boundClaimsForDomains,
  emailDomain,
  googleLoginHint,
  matchDomainRole,
  normalizeDomain,
  parseDomains,
  parsePolicies,
  planGoogleOidcRoles,
  uniqueRoleNames,
  withGoogleHostedDomain,
} from "@/lib/oidc-domains";

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
    expect(normalizeDomain("not a domain")).toBeNull();
  });
});

describe("parseDomains / parsePolicies", () => {
  it("splits, lowercases, and de-dupes domains", () => {
    expect(parseDomains("acme.com, @ACME.com vendor.io")).toEqual([
      "acme.com",
      "vendor.io",
    ]);
  });

  it("throws on an invalid token in a list", () => {
    expect(() => parseDomains("acme.com, nope")).toThrow(/Invalid email domain/);
  });

  it("parses policy names", () => {
    expect(parsePolicies(" default, admin, default ")).toEqual(["default", "admin"]);
    expect(parsePolicies("")).toEqual([]);
  });
});

describe("matchDomainRole", () => {
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

  it("fails closed on missing @ or unknown domain", () => {
    expect(matchDomainRole("ada", roles)).toBeNull();
    expect(matchDomainRole("ada@other.com", roles)).toBeNull();
  });
});

describe("planGoogleOidcRoles", () => {
  const base = {
    role: "default",
    policies: "default",
    groupsClaim: "",
    redirectUri: "http://localhost/ui2/api/auth/oidc/callback",
  };

  it("writes one unrestricted role when no domains are set", () => {
    const plan = planGoogleOidcRoles({
      ...base,
      allowedDomains: "",
      domainPolicies: [],
    });
    expect(plan.roles).toHaveLength(1);
    expect(plan.roles[0].name).toBe("default");
    expect(plan.roles[0].body.bound_claims).toBeUndefined();
    expect(plan.domainRoutes).toEqual([]);
    expect(plan.roles[0].body.token_policies).toEqual(["default"]);
  });

  it("binds every allowed domain on a single shared role", () => {
    const plan = planGoogleOidcRoles({
      ...base,
      allowedDomains: "acme.com, vendor.io",
      domainPolicies: [],
    });
    expect(plan.roles).toHaveLength(1);
    expect(plan.roles[0].body).toMatchObject(boundClaimsForDomains(["acme.com", "vendor.io"]));
    expect(plan.domainRoutes).toEqual([
      { domain: "acme.com", role: "default" },
      { domain: "vendor.io", role: "default" },
    ]);
    expect(uniqueRoleNames(plan.domainRoutes)).toEqual(["default"]);
  });

  it("splits OIDC roles when policies differ per domain", () => {
    const plan = planGoogleOidcRoles({
      ...base,
      allowedDomains: "",
      domainPolicies: [
        { domain: "acme.com", policies: "admin" },
        { domain: "vendor.io", policies: "viewer" },
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
    expect(plan.roles[1].body).toMatchObject({
      token_policies: ["viewer"],
      ...boundClaimsForDomains(["vendor.io"]),
    });
    expect(plan.defaultRole).toBe("default-acme-com");
  });

  it("keeps leftover allowed domains on the base role with default policies", () => {
    const plan = planGoogleOidcRoles({
      ...base,
      allowedDomains: "acme.com, vendor.io",
      domainPolicies: [{ domain: "acme.com", policies: "admin" }],
    });
    expect(plan.roles.map((r) => ({ name: r.name, domains: r.domains }))).toEqual([
      { name: "default-acme-com", domains: ["acme.com"] },
      { name: "default", domains: ["vendor.io"] },
    ]);
  });

  it("refuses empty default policies", () => {
    expect(() =>
      planGoogleOidcRoles({
        ...base,
        policies: "  ",
        allowedDomains: "",
        domainPolicies: [],
      }),
    ).toThrow(/token policy/);
  });
});

describe("withGoogleHostedDomain", () => {
  it("sets hd on accounts.google.com", () => {
    const url = withGoogleHostedDomain(
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=x",
      "acme.com",
    );
    expect(new URL(url).searchParams.get("hd")).toBe("acme.com");
  });

  it("leaves non-Google issuers alone", () => {
    const src = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
    expect(withGoogleHostedDomain(src, "acme.com")).toBe(src);
  });
});

describe("emailDomain", () => {
  it("reads the domain from an email", () => {
    expect(emailDomain("Ada@Acme.com")).toBe("acme.com");
    expect(emailDomain("not-an-email")).toBeNull();
  });
});

describe("googleLoginHint", () => {
  it("one-clicks an unrestricted mount", () => {
    expect(googleLoginHint([])).toEqual({ askEmail: false, role: undefined, hd: undefined });
  });

  it("hints hd only when a single domain is allowed", () => {
    expect(
      googleLoginHint([{ domain: "acme.com", role: "default" }]),
    ).toEqual({ askEmail: false, role: "default", hd: "acme.com" });
  });

  it("does not pin hd when several domains share one role", () => {
    expect(
      googleLoginHint([
        { domain: "acme.com", role: "default" },
        { domain: "vendor.io", role: "default" },
      ]),
    ).toEqual({ askEmail: false, role: "default", hd: undefined });
  });

  it("asks for email when policies (roles) differ per domain", () => {
    expect(
      googleLoginHint([
        { domain: "acme.com", role: "default-acme-com" },
        { domain: "vendor.io", role: "default-vendor-io" },
      ]),
    ).toEqual({ askEmail: true });
  });
});

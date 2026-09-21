import { describe, expect, it } from "vitest";

import { buildAccessPolicy } from "@/lib/access-policy";

describe("buildAccessPolicy", () => {
  it("grants the selected paths across mount-per-env targets (editor)", () => {
    const hcl = buildAccessPolicy({
      envs: [{ mount: "prod" }, { mount: "dev" }],
      level: "editor",
      paths: ["payments/*"],
    });
    expect(hcl).toContain('path "prod/data/payments/*"');
    expect(hcl).toContain('path "dev/data/payments/*"');
    expect(hcl).toContain('path "prod/metadata/payments/*"');
    // editor data caps include write/delete; metadata stays read/list
    expect(hcl).toContain('create", "read", "update", "delete", "list"');
  });

  it("supports the single-mount + env-folder layout", () => {
    const hcl = buildAccessPolicy({
      envs: [{ mount: "secret", envPath: "prod" }],
      level: "viewer",
      paths: ["payments/*"],
    });
    expect(hcl).toContain('path "secret/data/prod/payments/*"');
    expect(hcl).toContain('path "secret/metadata/prod/payments/*"');
    // viewer is read-only
    expect(hcl).not.toContain("update");
  });

  it("mixes a folder path and a single shared secret path (read-only)", () => {
    const hcl = buildAccessPolicy({
      envs: [{ mount: "prod" }],
      level: "viewer",
      paths: ["backend/*", "shared/stripe/config"],
    });
    expect(hcl).toContain('path "prod/data/backend/*"');
    expect(hcl).toContain('path "prod/data/shared/stripe/config"');
    expect(hcl).toContain('path "prod/metadata/shared/stripe/config"');
    // viewer keeps read,list on data
    expect(hcl).toMatch(/path "prod\/data\/backend\/\*" \{\s*capabilities = \["read", "list"\]/);
  });

  it("grants the whole environment when no paths are given", () => {
    const hcl = buildAccessPolicy({ envs: [{ mount: "prod" }], level: "editor" });
    expect(hcl).toContain('path "prod/data/*"');
    expect(hcl).toContain('path "prod/metadata/*"');
  });

  it("admin adds sudo on data", () => {
    const hcl = buildAccessPolicy({ envs: [{ mount: "prod" }], level: "admin", paths: ["x/*"] });
    expect(hcl).toContain('"sudo"');
  });

  it.each(["é", "\"", "", "   ", "foo?bar", "../other", "a//b"])("rejects invalid explicit path %j", (path) => {
    expect(() => buildAccessPolicy({ envs: [{ mount: "prod" }], level: "viewer", paths: [path] })).toThrow();
  });

  it("rejects mixed valid and invalid paths instead of silently dropping one", () => {
    expect(() => buildAccessPolicy({ envs: [{ mount: "prod" }], level: "viewer", paths: ["app/*", "é"] })).toThrow();
  });

  it.each([{ mount: "prod space" }, { mount: "" }, { mount: "secret", envPath: "é" }])("rejects altered environment identities", (env) => {
    expect(() => buildAccessPolicy({ envs: [env], level: "viewer", paths: ["*"] })).toThrow();
  });

  it("de-duplicates and normalizes slashes", () => {
    const hcl = buildAccessPolicy({
      envs: [{ mount: "/prod/" }, { mount: "prod" }],
      level: "viewer",
      paths: ["/payments/*"],
    });
    expect(hcl.match(/path "prod\/data\/payments\/\*"/g)?.length).toBe(1);
    expect(hcl).not.toContain("//");
  });
});

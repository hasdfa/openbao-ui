import { describe, expect, it } from "vitest";

import { credNames, envIdent } from "@/lib/app-credentials";

describe("credNames", () => {
  it("uses a fresh unique identity even when display slugs collide", () => {
    const first = credNames("app-prod", "east", "viewer");
    const second = credNames("app", "prod-east", "viewer");
    expect(first.role).not.toBe(second.role);
    expect(first.policy).toBe(`${first.role}-read`);
    expect(first.role).toMatch(/^[a-zA-Z0-9_.-]+$/);
  });

  it("isolates repeated issuances and permission levels", () => {
    const first = credNames("app", "prod", "viewer");
    const second = credNames("app", "prod", "editor");
    expect(first.role).not.toBe(second.role);
    expect(second.policy).toBe(`${second.role}-editor`);
  });

  it("does not identify roles by lossy slugs", () => {
    expect(credNames("My App!", "prod/east", "viewer").role)
      .not.toBe(credNames("My-App", "prod-east", "viewer").role);
  });
});

describe("envIdent", () => {
  it("is the mount for the mount-per-env layout", () => {
    expect(envIdent({ mount: "prod" })).toBe("prod");
  });
  it("disambiguates env folders in a single mount", () => {
    expect(envIdent({ mount: "secret", envPath: "prod" })).toBe("secret-prod");
  });
});

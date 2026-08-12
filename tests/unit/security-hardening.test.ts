import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isCrossSiteRequest } from "@/lib/csrf";
import { getCookieName, getOidcTransactionCookieNames } from "@/lib/session";
import { FixedWindowRateLimiter } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/request-body";

describe("session cookie hardening", () => {
  it("uses a host-only cookie prefix in production", () => {
    expect(getCookieName("production")).toBe("__Host-bao_token");
  });

  it("keeps the development cookie explicitly separate", () => {
    expect(getCookieName("development")).toBe("bao_token");
  });

  it("uses host-only OIDC transaction cookies in production", () => {
    expect(getOidcTransactionCookieNames("production")).toEqual({
      nonce: "__Host-bao_oidc_nonce",
      mount: "__Host-bao_oidc_mount",
    });
  });
});

describe("request-origin CSRF fallback", () => {
  it("rejects a same-host request that changes scheme", () => {
    const req = new Request("https://vault.example.test/ui2/api/auth/login", {
      method: "POST",
      headers: { origin: "http://vault.example.test" },
    });
    expect(isCrossSiteRequest(req)).toBe(true);
  });
});

describe("bounded JSON parsing", () => {
  it("rejects a body over the configured byte limit", async () => {
    const req = new Request("http://localhost/api", {
      method: "POST",
      body: JSON.stringify({ value: "x".repeat(32) }),
    });
    await expect(parseJsonBody(req, 16)).rejects.toMatchObject({ status: 413 });
  });

  it("rejects malformed JSON with a client error", async () => {
    const req = new Request("http://localhost/api", {
      method: "POST",
      body: "{",
    });
    await expect(parseJsonBody(req, 1024)).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("login rate limiting", () => {
  it("blocks attempts after the configured threshold and resets after the window", () => {
    const limiter = new FixedWindowRateLimiter(2, 1_000);
    expect(limiter.consume("127.0.0.1", 100)).toBe(true);
    expect(limiter.consume("127.0.0.1", 101)).toBe(true);
    expect(limiter.consume("127.0.0.1", 102)).toBe(false);
    expect(limiter.consume("127.0.0.1", 1_101)).toBe(true);
  });
});

describe("production OpenBao storage wiring", () => {
  it("keeps the configured storage path persistent in Compose and present in the image", () => {
    const root = process.cwd();
    const hcl = readFileSync(join(root, "docker/openbao.hcl"), "utf8");
    const compose = readFileSync(join(root, "docker-compose.yml"), "utf8");
    const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");
    const storagePath = hcl.match(
      /storage\s+"(?:file|raft)"\s*\{[\s\S]*?path\s*=\s*"([^"]+)"/,
    )?.[1];

    expect(storagePath).toBeDefined();
    expect(compose).toContain(`:${storagePath}`);
    expect(dockerfile).toContain(`mkdir -p ${storagePath}`);
  });
});

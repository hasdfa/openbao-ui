import { describe, expect, it } from "vitest";

import { readHttpEnvelope } from "@/lib/http/client";

describe("HTTP client contract", () => {
  it("unwraps canonical successful responses", async () => {
    const response = Response.json({ ok: true, data: { ttl: 60 } });
    await expect(readHttpEnvelope<{ ttl: number }>(response)).resolves.toEqual({ ttl: 60 });
  });

  it("throws a typed error for canonical failures", async () => {
    const response = Response.json(
      {
        ok: false,
        error: { code: "unauthenticated", message: "Authentication is required." },
      },
      { status: 401 },
    );

    await expect(readHttpEnvelope(response)).rejects.toMatchObject({
      status: 401,
      code: "unauthenticated",
    });
  });

  it("rejects a failure envelope paired with a successful HTTP status", async () => {
    const response = Response.json({
      ok: false,
      error: { code: "unauthenticated", message: "Authentication is required." },
    });

    await expect(readHttpEnvelope(response)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("rejects an HTTP response that violates the application contract", async () => {
    const response = Response.json({ ttl: 60 });
    await expect(readHttpEnvelope(response)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("rejects an unknown error code instead of treating an arbitrary string as a contract", async () => {
    const response = Response.json(
      { ok: false, error: { code: "made_up", message: "Unexpected." } },
      { status: 500 },
    );
    await expect(readHttpEnvelope(response)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  asJsonResponse,
  Dependency,
  HttpErrorCode,
  invalidRequest,
  serviceUnavailable,
  success,
  unauthorized,
} from "@/lib/http/response";

describe("HTTP response contract", () => {
  it("wraps successful data in the canonical envelope", () => {
    expect(success({ id: "policy" }, 201)).toEqual({
      status: 201,
      body: { ok: true, data: { id: "policy" } },
    });
  });

  it("expresses authentication failures with a stable code and status", () => {
    expect(unauthorized()).toEqual({
      status: 401,
      body: {
        ok: false,
        error: {
          code: HttpErrorCode.Unauthenticated,
          message: "Authentication is required.",
        },
      },
    });
  });

  it("does not expose upstream details from unavailable dependencies", () => {
    expect(serviceUnavailable(Dependency.OpenBao)).toEqual({
      status: 503,
      body: {
        ok: false,
        error: {
          code: HttpErrorCode.DependencyUnavailable,
          message: "The OpenBao service is temporarily unavailable.",
        },
      },
    });
  });

  it("makes invalid input machine-readable without a stringly typed status", () => {
    expect(invalidRequest("Request body must be valid JSON.")).toEqual({
      status: 400,
      body: {
        ok: false,
        error: {
          code: HttpErrorCode.InvalidRequest,
          message: "Request body must be valid JSON.",
        },
      },
    });
  });

  it("serializes the canonical contract as a JSON HTTP response", async () => {
    const response = asJsonResponse(success({ id: "policy" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ ok: true, data: { id: "policy" } });
  });
});

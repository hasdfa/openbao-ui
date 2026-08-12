import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setConfig = vi.fn();

vi.mock("@/lib/session", () => ({
  getValidatedToken: vi.fn().mockResolvedValue("operator-token"),
}));
vi.mock("@/lib/ui-admin", () => ({
  isOperator: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/db", () => ({
  getConfig: vi.fn(),
  setConfig,
}));

const { PUT } = await import("@/app/api/access-roles/route");

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/ui2/api/access-roles", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      cookie: "bao_token=test-session",
    },
    body,
  });
}

describe("PUT /api/access-roles", () => {
  beforeEach(() => setConfig.mockReset());

  it("persists a valid scoped role and returns the saved role", async () => {
    const role = {
      name: "payments-prod-viewer",
      level: "viewer",
      env: { kind: "mounts", mounts: ["payments-prod"] },
      paths: ["*"],
    };

    const response = await PUT(request(JSON.stringify({ roles: [role] })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { roles: [role] },
    });
    expect(setConfig).toHaveBeenCalledWith("access-roles::", [role]);
  });

  it("rejects malformed JSON without writing any role", async () => {
    const response = await PUT(request('{"roles":['));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { message: "The request body must be valid JSON." },
    });
    expect(setConfig).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ token: vi.fn(), lookup: vi.fn(), capabilities: vi.fn(), operator: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/session", () => ({ getToken: mocks.token }));
vi.mock("@/lib/openbao", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/openbao")>(),
  openbao: { lookupSelf: mocks.lookup, capabilitiesSelf: mocks.capabilities },
}));
vi.mock("@/lib/ui-admin", () => ({ isOperator: mocks.operator }));
vi.mock("@/lib/db", () => ({ getConfig: mocks.read, listLabels: mocks.read, setConfig: mocks.write, upsertLabel: mocks.write }));

import { OpenBaoRequestError } from "@/lib/openbao";
import * as labels from "@/app/api/labels/route";
import * as roles from "@/app/api/access-roles/route";
import * as credentials from "@/app/api/project-credentials/route";
import * as templates from "@/app/api/role-templates/route";
import * as onboarding from "@/app/api/onboarding/route";

const routes = [labels, roles, credentials, templates, onboarding];
const request = (namespace = "team", method = "GET") => new NextRequest("http://localhost/ui2/api/test", {
  method, headers: { "x-vault-namespace": namespace, "sec-fetch-site": "same-origin", "content-type": "application/json" },
  ...(method === "PUT" ? { body: JSON.stringify({ dismissed: true }) } : {}),
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.token.mockResolvedValue("token");
  mocks.lookup.mockResolvedValue({ data: { namespace_path: "team/" } });
  mocks.capabilities.mockRejectedValue(new OpenBaoRequestError(403, ["denied"]));
  mocks.operator.mockResolvedValue(false);
});

describe("metadata route boundaries", () => {
  it("rejects revoked cookies on every GET before reading SQLite", async () => {
    mocks.lookup.mockRejectedValue(new OpenBaoRequestError(403, ["revoked"]));
    for (const route of routes) expect((await route.GET(request())).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects foreign namespaces on every GET before reading SQLite", async () => {
    for (const route of routes) expect((await route.GET(request("other"))).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("allows same-namespace reads for valid non-operators", async () => {
    for (const route of routes) expect((await route.GET(request())).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledTimes(routes.length);
  });
  it("allows a token that can enter a foreign namespace to read metadata", async () => {
    mocks.capabilities.mockResolvedValue({ data: { "sys/mounts": ["read"] } });
    expect((await labels.GET(request("other"))).status).toBe(200);
    expect(mocks.read).toHaveBeenCalled();
  });
  it("fails closed on namespace probe errors before SQLite", async () => {
    mocks.capabilities.mockRejectedValue(new Error("offline"));
    expect((await labels.GET(request("other"))).status).toBe(502);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects revoked and cross-namespace onboarding writes before SQLite", async () => {
    expect((await onboarding.PUT(request("other", "PUT"))).status).toBe(403);
    mocks.lookup.mockRejectedValue(new OpenBaoRequestError(403, ["revoked"]));
    expect((await onboarding.PUT(request("team", "PUT"))).status).toBe(401);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("canonicalizes the authorized namespace in storage keys", async () => {
    expect((await onboarding.PUT(request("/team/", "PUT"))).status).toBe(200);
    expect(mocks.write).toHaveBeenCalledWith("onboarding::team", expect.objectContaining({ dismissed: true }));
  });
});

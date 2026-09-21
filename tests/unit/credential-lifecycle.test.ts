import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bao-client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/bao-client")>(),
  baoFetch: vi.fn(),
}));

import { baoFetch, BaoError } from "@/lib/bao-client";
import { deleteCredentialResources, assertCredentialNamesAvailable, type AppCredential } from "@/lib/app-credentials";

const fetchBao = vi.mocked(baoFetch);
const cred: AppCredential = {
  app: "api", level: "viewer", env: { kind: "mounts", mounts: ["prod"] },
  mount: "approle", paths: ["api/*"], createdAt: 1,
  roles: [{ env: "prod", role: "legacy-api-prod", policy: "legacy-api-read" }],
};

beforeEach(() => vi.resetAllMocks());

describe("credential revocation", () => {
  it("propagates a denied role deletion", async () => {
    fetchBao.mockRejectedValueOnce(new BaoError(403, ["denied"]));
    await expect(deleteCredentialResources(cred, "team")).rejects.toThrow("denied");
    expect(fetchBao).toHaveBeenCalledTimes(1);
  });
  it("propagates a failed policy deletion after removing the role", async () => {
    fetchBao.mockResolvedValueOnce(null).mockRejectedValueOnce(new BaoError(503, ["sealed"]));
    await expect(deleteCredentialResources(cred, "team")).rejects.toThrow("sealed");
  });
  it("can retry partially completed deletion using saved legacy names", async () => {
    fetchBao.mockRejectedValueOnce(new BaoError(404, ["missing"])).mockResolvedValueOnce(null);
    await expect(deleteCredentialResources(cred, "team")).resolves.toBeUndefined();
    expect(fetchBao).toHaveBeenLastCalledWith({ path: "sys/policies/acl/legacy-api-read", method: "DELETE", namespace: "team" });
  });
});

describe("credential resource ownership", () => {
  const names = { role: "new-role", policy: "new-policy" };
  it("rejects an occupied role before any writes", async () => {
    fetchBao.mockResolvedValue({ data: {} });
    await expect(assertCredentialNamesAvailable(names, "approle", "team")).rejects.toThrow(/already exists/);
    expect(fetchBao.mock.calls.every(([request]) => request.method === undefined)).toBe(true);
  });
  it("rejects an occupied policy", async () => {
    fetchBao.mockRejectedValueOnce(new BaoError(404, ["missing"])).mockResolvedValueOnce({ data: {} });
    await expect(assertCredentialNamesAvailable(names, "approle", "team")).rejects.toThrow(/already exists/);
  });
  it("does not treat permission failures as missing resources", async () => {
    fetchBao.mockRejectedValue(new BaoError(403, ["denied"]));
    await expect(assertCredentialNamesAvailable(names, "approle", "team")).rejects.toThrow("denied");
  });
  it("allows names only when both resources are absent", async () => {
    fetchBao.mockRejectedValue(new BaoError(404, ["missing"]));
    await expect(assertCredentialNamesAvailable(names, "approle", "team")).resolves.toBeUndefined();
  });
});

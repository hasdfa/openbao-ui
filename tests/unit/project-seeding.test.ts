import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/bao-client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/bao-client")>(), baoFetch: vi.fn(),
}));
import { baoFetch, BaoError } from "@/lib/bao-client";
import { seedProjectConfigs } from "@/lib/projects";
const fetchBao = vi.mocked(baoFetch);
beforeEach(() => vi.resetAllMocks());

describe("app config seeding", () => {
  it("uses create-only CAS so an existing config cannot be overwritten", async () => {
    fetchBao.mockResolvedValue({});
    await seedProjectConfigs("app", [{ mount: "prod", v2: true }], "team");
    expect(fetchBao).toHaveBeenCalledWith({ path: "prod/data/app/config", method: "POST", namespace: "team", body: { data: {}, options: { cas: 0 } } });
  });
  it("treats a CAS conflict as already seeded", async () => {
    fetchBao.mockRejectedValue(new BaoError(400, ["check-and-set parameter did not match the current version"]));
    await expect(seedProjectConfigs("app", [{ mount: "prod", v2: true }], "team")).resolves.toBeUndefined();
  });
  it.each([400, 403, 503])("surfaces rejected writes (%i) instead of reporting success", async (status) => {
    fetchBao.mockRejectedValue(new BaoError(status, ["write rejected"]));
    await expect(seedProjectConfigs("app", [{ mount: "prod", v2: true }], "")).rejects.toThrow(/prod/);
  });
  it("rejects KV v1 before any environment is written", async () => {
    await expect(seedProjectConfigs("app", [{ mount: "dev", v2: true }, { mount: "legacy", v2: false }], "")).rejects.toThrow(/KV v1/);
    expect(fetchBao).not.toHaveBeenCalled();
  });
  it("reports a partial failure without continuing to later environments", async () => {
    fetchBao.mockResolvedValueOnce({}).mockRejectedValueOnce(new BaoError(403, ["denied"]));
    await expect(seedProjectConfigs("app", [{ mount: "dev", v2: true }, { mount: "prod", v2: true }, { mount: "later", v2: true }], "")).rejects.toThrow(/earlier environments/);
    expect(fetchBao).toHaveBeenCalledTimes(2);
  });
});

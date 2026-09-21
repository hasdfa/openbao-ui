import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bao-client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/bao-client")>(),
  baoFetch: vi.fn(),
}));

import { baoFetch, BaoError } from "@/lib/bao-client";
import { deleteAppTrees, listAppSecretPaths } from "@/lib/apps";

const fetchBao = vi.mocked(baoFetch);
beforeEach(() => vi.resetAllMocks());

describe("listAppSecretPaths", () => {
  it("walks nested folders and returns leaf secret paths", async () => {
    fetchBao
      .mockResolvedValueOnce({ data: { keys: ["config", "db/"] } })
      .mockResolvedValueOnce({ data: { keys: ["password"] } });
    await expect(listAppSecretPaths("payments", { mount: "prod", v2: true }, "team"))
      .resolves.toEqual(["payments/config", "payments/db/password"]);
    expect(fetchBao).toHaveBeenNthCalledWith(1, {
      path: "prod/metadata/payments",
      namespace: "team",
      list: true,
    });
    expect(fetchBao).toHaveBeenNthCalledWith(2, {
      path: "prod/metadata/payments/db",
      namespace: "team",
      list: true,
    });
  });

  it("treats a missing folder as empty", async () => {
    fetchBao.mockRejectedValue(new BaoError(404, ["missing"]));
    await expect(listAppSecretPaths("ghost", { mount: "prod", v2: true }, "")).resolves.toEqual([]);
  });
});

describe("deleteAppTrees", () => {
  it("deletes listed secrets with create-only-safe 404s ignored", async () => {
    fetchBao
      .mockResolvedValueOnce({ data: { keys: ["config"] } })
      .mockRejectedValueOnce(new BaoError(404, ["already gone"]))
      .mockResolvedValueOnce({ data: { keys: ["token"] } })
      .mockResolvedValueOnce({});
    await deleteAppTrees(
      "api",
      [{ mount: "dev", v2: true }, { mount: "prod", v2: false }],
      "team",
    );
    expect(fetchBao).toHaveBeenCalledWith({
      path: "dev/metadata/api/config",
      method: "DELETE",
      namespace: "team",
    });
    expect(fetchBao).toHaveBeenCalledWith({
      path: "prod/api/token",
      method: "DELETE",
      namespace: "team",
    });
  });

  it("stops on a denied delete and keeps later environments untouched", async () => {
    fetchBao
      .mockResolvedValueOnce({ data: { keys: ["config"] } })
      .mockRejectedValueOnce(new BaoError(403, ["denied"]));
    await expect(deleteAppTrees("api", [{ mount: "prod", v2: true }, { mount: "later", v2: true }], ""))
      .rejects.toThrow(/prod/);
    expect(fetchBao.mock.calls.some(([req]) => String(req.path).includes("later"))).toBe(false);
  });
});

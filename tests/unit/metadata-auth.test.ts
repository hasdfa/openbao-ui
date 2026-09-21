import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ token: vi.fn(), lookup: vi.fn(), capabilities: vi.fn() }));
vi.mock("@/lib/session", () => ({ getToken: mocks.token }));
vi.mock("@/lib/openbao", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/openbao")>(),
  openbao: { lookupSelf: mocks.lookup, capabilitiesSelf: mocks.capabilities },
}));
import { OpenBaoRequestError } from "@/lib/openbao";

import { authorizeMetadata } from "@/lib/metadata-auth";

describe("metadata authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.token.mockResolvedValue("valid-token");
    mocks.lookup.mockResolvedValue({ data: { namespace_path: "team/" } });
    mocks.capabilities.mockRejectedValue(new OpenBaoRequestError(403, ["denied"]));
  });

  it("rejects missing, invented and revoked tokens", async () => {
    mocks.token.mockResolvedValueOnce(undefined);
    expect((await authorizeMetadata(new Request("http://localhost"))).error?.status).toBe(401);
    mocks.lookup.mockRejectedValue(new OpenBaoRequestError(403, ["invalid token"]));
    expect((await authorizeMetadata(new Request("http://localhost"))).error?.status).toBe(401);
  });

  it("allows a limited token in its own canonical namespace", async () => {
    const result = await authorizeMetadata(new Request("http://localhost", { headers: { "x-vault-namespace": "/team/" } }));
    expect(result).toEqual({ token: "valid-token", namespace: "team" });
    expect(mocks.capabilities).not.toHaveBeenCalled();
  });

  it("denies foreign namespaces, including root", async () => {
    for (const namespace of ["", "other", "team/child"]) {
      expect((await authorizeMetadata(new Request("http://localhost", { headers: { "x-vault-namespace": namespace } }))).error?.status).toBe(403);
    }
  });

  it("allows a token that can enter the requested namespace", async () => {
    mocks.capabilities.mockResolvedValue({ data: { "sys/capabilities-self": ["deny"] } });
    const result = await authorizeMetadata(new Request("http://localhost", { headers: { "x-vault-namespace": "other" } }));
    expect(result.error).toBeUndefined();
    expect(mocks.capabilities).toHaveBeenCalledWith("valid-token", ["sys/capabilities-self"], "other");
  });

  it("fails closed on upstream failure", async () => {
    mocks.lookup.mockRejectedValue(new Error("offline"));
    expect((await authorizeMetadata(new Request("http://localhost"))).error?.status).toBe(502);
  });

  it("fails closed when the namespace probe is unavailable", async () => {
    mocks.capabilities.mockRejectedValue(new Error("offline"));
    expect((await authorizeMetadata(new Request("http://localhost", { headers: { "x-vault-namespace": "other" } }))).error?.status).toBe(502);
  });

  it("rejects traversal namespace headers before lookup", async () => {
    expect((await authorizeMetadata(new Request("http://localhost", { headers: { "x-vault-namespace": "team/../other" } }))).error?.status).toBe(400);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("accepts OpenBao's omitted namespace_path for root tokens", async () => {
    mocks.lookup.mockResolvedValue({ data: {} });
    expect((await authorizeMetadata(new Request("http://localhost"))).namespace).toBe("");
  });
});

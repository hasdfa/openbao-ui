import { describe, expect, it, vi } from "vitest";

import { BaoError, baoFetch } from "@/lib/bao-client";

describe("OpenBao BFF client", () => {
  it("turns a canonical local proxy failure into the established BaoError contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            ok: false,
            error: {
              code: "dependency_unavailable",
              message: "The OpenBao service is temporarily unavailable.",
            },
          },
          { status: 503 },
        ),
      ),
    );

    await expect(baoFetch({ path: "sys/health" })).rejects.toMatchObject({
      name: BaoError.name,
      status: 503,
      errors: ["The OpenBao service is temporarily unavailable."],
    });

    vi.unstubAllGlobals();
  });
});

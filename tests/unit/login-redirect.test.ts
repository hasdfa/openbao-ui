import { expect, it } from "vitest";
import { safeNext } from "@/lib/login-redirect";
it("safeNext", () => {
  expect(safeNext("/ui2/access/tokens?x=1")).toBe("/ui2/access/tokens?x=1");
  expect(safeNext("/ui2")).toBe("/ui2");
  for (const bad of ["//evil.com", "https://evil.com", "/ui2evil", "/ui2/login", "/\\evil.com", null, "/other"]) expect(safeNext(bad)).toBe("/ui2");
});

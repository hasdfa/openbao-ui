import { expect, test } from "@playwright/test";

test("google login rejects an unknown email domain before redirect", async ({ page }) => {
  await page.route("**/ui2/api/ui-config", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({
      json: {
        config: {
          oidcDomainRoles: {
            mount: "oidc",
            roles: [
              { domain: "acme.com", role: "default-acme-com" },
              { domain: "vendor.io", role: "default-vendor-io" },
            ],
          },
        },
      },
    });
  });
  await page.route("**/v1/sys/internal/ui/mounts", (route) =>
    route.fulfill({
      json: {
        data: {
          auth: { "oidc/": { type: "oidc", description: "Sign in with Google" } },
          secret: {},
        },
      },
    }),
  );

  await page.goto("/ui2/login");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await page.getByLabel("Work email").fill("ada@other.com");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByText("That email domain isn't allowed.")).toBeVisible();
});

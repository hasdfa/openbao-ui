import { expect, test } from "@playwright/test";

test("google login rejects an unknown email domain before redirect", async ({ page }) => {
  await page.route("**/ui2/api/ui-config", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { config: { oidcNeedsEmail: true } } });
  });
  await page.route("**/ui2/api/auth/oidc/start", async (route) => {
    const body = route.request().postDataJSON() as { email?: string };
    if (body.email?.endsWith("@other.com")) {
      return route.fulfill({
        status: 400,
        json: { error: "That email domain isn't allowed." },
      });
    }
    return route.fulfill({ json: { authUrl: "https://accounts.google.com/o/oauth2/v2/auth" } });
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

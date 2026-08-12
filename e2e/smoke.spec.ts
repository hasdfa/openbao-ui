import { expect, test } from "@playwright/test";

const TOKEN = process.env.E2E_TOKEN ?? "root";

// Smoke test of the Phase 2 happy path against a live stack:
// login -> overview status -> secret engines -> KV folder browser.
test("login method selector opens an accessible option list and switches credentials", async ({ page }) => {
  await page.goto("/ui2/login");

  const method = page.getByRole("combobox", { name: "Method" });
  await method.click();
  await page.getByRole("option", { name: "AppRole" }).click();

  await expect(method).toHaveText("AppRole");
  await expect(page.getByPlaceholder("approle")).toBeVisible();
});

test("overview does not create horizontal scrolling on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("button", { name: "System details" }).click();
  await expect(page.getByText("Token access")).toBeVisible();

  for (const action of [
    async () => undefined,
    async () => {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(page.getByRole("button", { name: "Close navigation" }).first()).toBeVisible();
      const closeButton = page.getByRole("button", { name: "Close navigation" }).last();
      const themeToggle = page.getByRole("button", { name: /Switch to (dark|light)/ });
      const [closeBox, themeBox] = await Promise.all([closeButton.boundingBox(), themeToggle.boundingBox()]);
      expect(closeBox).not.toBeNull();
      expect(themeBox).not.toBeNull();
      expect(Math.abs((closeBox?.y ?? 0) - (themeBox?.y ?? 0))).toBeLessThan(12);
    },
  ]) {
    await action();
    const widths = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(widths.documentWidth).toBeLessThanOrEqual(widths.viewportWidth);
  }
  await page.getByRole("button", { name: "Close navigation" }).last().click();
});

test("access policies use a stacked master-detail layout on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.goto("/ui2/access");
  await expect(page.getByRole("heading", { name: "Access" })).toBeVisible();

  const geometry = await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('aside[aria-label="Policies"]');
    const editor = document.querySelector<HTMLElement>('section[aria-label="Policy editor"]');
    const listBox = list?.getBoundingClientRect();
    const editorBox = editor?.getBoundingClientRect();
    return {
      listBottom: listBox?.bottom ?? 0,
      listLeft: listBox?.left ?? 0,
      listWidth: listBox?.width ?? 0,
      editorTop: editorBox?.top ?? 0,
      editorLeft: editorBox?.left ?? 0,
      editorWidth: editorBox?.width ?? 0,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect(geometry.editorTop).toBeGreaterThanOrEqual(geometry.listBottom);
  expect(geometry.editorLeft).toBeCloseTo(geometry.listLeft, 0);
  expect(geometry.listWidth).toBeCloseTo(geometry.editorWidth, 0);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
});

test("access policy list keeps a desktop left inset", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.goto("/ui2/access");
  await expect(page.getByRole("heading", { name: "Access" })).toBeVisible();

  const inset = await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('aside[aria-label="Policies"]');
    const button = list?.querySelector("button");
    if (!list || !button) return 0;
    return button.getBoundingClientRect().left - list.getBoundingClientRect().left;
  });

  expect(inset).toBeGreaterThanOrEqual(20);
});

test("login and browse the KV engine", async ({ page }) => {
  // redirected to /ui2/login
  await page.goto("/");
  await expect(page.getByText("Sign in to OpenBao")).toBeVisible();
  await expect(page).toHaveURL(/\/ui2\/login/);

  // token login -> overview
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Unsealed")).toBeVisible();

  // navigate to the secret engine list and into the KV mount
  await page.getByRole("link", { name: "Secrets" }).click();
  await expect(page.getByText("secret/")).toBeVisible();
  await page.getByRole("link", { name: "secret/" }).click();

  // the KV browser renders (breadcrumb shows the mount)
  await expect(page.getByRole("link", { name: "secret", exact: true })).toBeVisible();

  // comparison matrix page is reachable and renders
  await page.goto("/ui2/secrets/compare");
  await expect(page.getByRole("heading", { name: "Compare environments" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Compare" })).toBeVisible();
});

test("secrets dashboards do not create horizontal scrolling on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  for (const path of ["/ui2/secrets", "/ui2/secrets/secret"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const widths = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(widths.documentWidth).toBeLessThanOrEqual(widths.viewportWidth);
  }
});

test("kv lifecycle: create, view, delete a secret", async ({ page }) => {
  const name = `e2e/secret-${Date.now()}`;
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.goto("/ui2/secrets/secret");
  await page.getByRole("button", { name: "New secret" }).click();
  await page.fill("#secret-name", name);
  await page.getByPlaceholder("key").first().fill("api_key");
  await page.getByPlaceholder("value").first().fill("s3cr3t-value");
  await page.getByRole("button", { name: "Create secret" }).click();

  // the new secret is selected and its key is shown
  await expect(page.getByText("version 1")).toBeVisible();
  await expect(page.getByText("api_key")).toBeVisible();

  // delete it via the danger-zone disclosure + typed confirm
  await page.getByRole("button", { name: /Advanced & danger zone/ }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.locator("#confirm-input").fill("delete");
  await page.getByRole("button", { name: "Delete everything" }).click();

  // detail panel clears
  await expect(page.getByText("No secret selected")).toBeVisible();
});

test("kv: deep-link straight to a secret resolves (no 404)", async ({ page }) => {
  const name = `deeplink/probe-${Date.now()}`;
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  // create a nested secret
  await page.goto("/ui2/secrets/secret");
  await page.getByRole("button", { name: "New secret" }).click();
  await page.fill("#secret-name", name);
  await page.getByPlaceholder("key").first().fill("api_key");
  await page.getByPlaceholder("value").first().fill("v");
  await page.getByRole("button", { name: "Create secret" }).click();
  await expect(page.getByText("version 1")).toBeVisible();

  // navigate directly to the secret's own URL: the browser lists its parent
  // folder and auto-selects the leaf instead of 404-ing on it
  await page.goto(`/ui2/secrets/secret/${name}`);
  await expect(page.getByText("Request failed (404)")).toHaveCount(0);
  await expect(page.getByText(name)).toBeVisible();
  await expect(page.getByText("version 1")).toBeVisible();
});

test("structure: cross-environment tree shows a secret and its values", async ({ page }) => {
  const folder = `struct-${Date.now()}`;
  const path = `${folder}/cfg`;
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  // seed a secret so the unified tree has something to show
  await page.goto("/ui2/secrets/secret");
  await page.getByRole("button", { name: "New secret" }).click();
  await page.fill("#secret-name", path);
  await page.getByPlaceholder("key").first().fill("api_key");
  await page.getByPlaceholder("value").first().fill("s3cr3t-value");
  await page.getByRole("button", { name: "Create secret" }).click();
  await expect(page.getByText("version 1")).toBeVisible();

  // the Structure page is reachable from Secrets and renders the env picker
  await page.goto("/ui2/secrets");
  await page.getByRole("link", { name: "Structure" }).click();
  await expect(page.getByRole("heading", { name: "Structure" })).toBeVisible();
  await expect(page.getByText("Environments", { exact: true })).toBeVisible();

  // drill into the union tree: folder -> secret -> per-environment column
  await page.getByRole("button", { name: new RegExp(folder) }).click();
  await page.getByRole("button", { name: "cfg" }).click();
  // the secret's field is shown in the (single dev) environment column
  await expect(page.getByText("api_key")).toBeVisible();

  // revealing values surfaces the seeded value
  await page.getByRole("button", { name: /Show values/ }).click();
  await expect(page.getByText("s3cr3t-value")).toBeVisible();
});

test("access section: policies, capabilities, tokens", async ({ page }) => {
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("link", { name: "Access" }).click();

  // Policies tab lists the built-in policies and loads HCL into the editor
  await expect(page.getByRole("button", { name: "default" })).toBeVisible();
  await page.getByRole("button", { name: "default" }).click();
  await expect(page.locator("textarea")).toBeVisible();

  // Capabilities tester returns capabilities for a path
  await page.getByRole("link", { name: "Capabilities" }).click();
  await page.fill("#cap-path", "secret/data/anything");
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("Capabilities on")).toBeVisible();

  // Tokens tab shows the active-tokens table
  await page.getByRole("link", { name: "Tokens" }).click();
  await expect(page.getByText("active token")).toBeVisible();
});

test("foundation: command palette and dark mode", async ({ page }) => {
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  // ⌘K / Ctrl+K opens the command palette and can navigate
  await page.keyboard.press("Control+k");
  const input = page.getByPlaceholder("Jump to…");
  await expect(input).toBeVisible();
  await input.fill("secrets");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/ui2\/secrets/);

  // dark mode toggles the root .dark class
  await page.getByRole("button", { name: "Switch to dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("access management: auth methods and identity", async ({ page }) => {
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  // Auth Methods tab lists enabled methods (token is always present)
  await page.goto("/ui2/access/auth");
  await expect(page.getByRole("button", { name: /token\// })).toBeVisible();

  // Identity tab shows the Entities/Groups switcher
  await page.goto("/ui2/access/identity");
  await expect(page.getByRole("tab", { name: "Entities" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Groups" })).toBeVisible();

  // MFA tab shows TOTP methods + login enforcements
  await page.goto("/ui2/access/mfa");
  await expect(page.getByRole("heading", { name: "TOTP methods" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Login enforcements" })).toBeVisible();
});

test("operations: status, quotas, plugins", async ({ page }) => {
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("link", { name: "Operations" }).click();
  await expect(page.getByText("Seal status")).toBeVisible();
  await expect(page.getByText("Maintenance")).toBeVisible();

  await page.getByRole("link", { name: "Plugins" }).click();
  await expect(page.getByRole("heading", { name: "auth" })).toBeVisible();

  // audit-log viewer renders (Recent activity section)
  await page.getByRole("link", { name: "Audit" }).click();
  await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible();
});

test("guides: generate an integration snippet for an environment", async ({ page }) => {
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("link", { name: "Guides", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Integration guides" })).toBeVisible();

  // the default (token) CLI snippet is wired to the dev `secret` KV mount
  await expect(page.getByText("bao kv get -mount=secret")).toBeVisible();

  // switching to AppRole regenerates the snippet with the login flow
  await page.getByRole("button", { name: "AppRole" }).click();
  await expect(page.getByText("auth/approle/login").first()).toBeVisible();
});

test("guides: wrapped tabs do not overlap their panel on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.goto("/ui2/guides");
  await expect(page.getByRole("heading", { name: "Integration guides" })).toBeVisible();

  const geometry = await page.evaluate(() => {
    const tabBottoms = Array.from(document.querySelectorAll<HTMLElement>("[role=tab]")).map(
      (tab) => tab.getBoundingClientRect().bottom,
    );
    const panelTop =
      document.querySelector<HTMLElement>("[role=tabpanel]")?.getBoundingClientRect().top ?? 0;
    return {
      maxTabBottom: Math.max(...tabBottoms),
      panelTop,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect(geometry.panelTop).toBeGreaterThanOrEqual(geometry.maxTabBottom);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);

  await page.getByRole("tab", { name: "Agent" }).click();
  await expect(page.getByRole("tab", { name: "Agent" })).toHaveAttribute("aria-selected", "true");
});

test("environments: customize a friendly display name", async ({ page }) => {
  const friendly = `Prod ${Date.now()}`;
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.goto("/ui2/secrets");
  // root token is an operator, so the customize control is available
  await page.getByRole("button", { name: "Customize secret/" }).click();
  await page.fill("#lbl-name", friendly);
  await page.getByRole("button", { name: "Save" }).click();

  // A friendly label is also used in the Guides select. It must truncate on a narrow phone
  // instead of forcing the page wider than the viewport.
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/ui2/guides");
  const geometry = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
});

test("settings: about exposes build provenance and the source repository", async ({ page }) => {
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.goto("/ui2/settings/about");
  await expect(page.getByText("Build")).toBeVisible();
  await expect(page.getByText(/development|[0-9a-f]{7,40}/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Source repository" })).toHaveAttribute(
    "href",
    "https://github.com/krolbot/openbao-ui",
  );
});

test("settings: preference selectors use an interactive accessible listbox", async ({ page }) => {
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/ui2\/?$/);

  await page.goto("/ui2/settings/preferences");
  const toastDuration = page.getByText("Toast duration").locator("..").getByRole("combobox");
  await toastDuration.click();
  await page.getByRole("option", { name: "10 seconds" }).click();

  await expect(toastDuration).toHaveText("10 seconds");
});

test("settings: profile, preferences, namespaces", async ({ page }) => {
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  // preferences: theme options present
  await page.getByRole("link", { name: "Preferences" }).click();
  await expect(page.getByRole("heading", { name: "Theme" })).toBeVisible();

  // namespaces management page
  await page.getByRole("link", { name: "Namespaces" }).click();
  await expect(page.getByRole("button", { name: "New namespace" })).toBeVisible();

  // password policies tab
  await page.getByRole("link", { name: "Password Policies" }).click();
  await expect(page.getByRole("button", { name: "New policy" })).toBeVisible();
});

test("onboarding: getting-started checklist + dismiss persists", async ({ page }) => {
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  // checklist renders with derived progress (dev ships a `secret` KV mount,
  // so at least the "create an environment" step is already complete)
  await expect(page.getByText("Getting started")).toBeVisible();
  await expect(page.getByText(/of 5 complete/)).toBeVisible();

  // dismiss it, and the dismissal sticks across a reload (stored in the BFF)
  await page.getByRole("button", { name: "Dismiss getting started" }).click();
  await expect(page.getByText("Getting started")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Getting started")).toHaveCount(0);
});

test("team: create a role and assign it to a member", async ({ page }) => {
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  // create a member entity via Identity
  const member = `alice-${Date.now()}`;
  await page.goto("/ui2/access/identity");
  await page.getByRole("button", { name: "New entity" }).click();
  await page.getByRole("dialog").getByRole("textbox").first().fill(member);
  await page.getByRole("button", { name: "Create", exact: true }).click();

  // Team: materialize the "viewer" role, then assign it to the member
  await page.goto("/ui2/access/team");
  const viewerCard = page.locator("li").filter({ hasText: "viewer" });
  await viewerCard.getByRole("button", { name: "Create role" }).click();
  await expect(viewerCard.getByText("Created")).toBeVisible();

  await page.getByRole("button", { name: member }).click();
  await expect(page.getByText("No roles assigned.")).toBeVisible();
  const rolePicker = page.getByText("Assign a role").locator("..").getByRole("combobox");
  await rolePicker.click();
  await page.getByRole("option", { name: "viewer" }).click();

  // the role badge + its remove control appear
  await expect(page.getByRole("button", { name: "Remove viewer" })).toBeVisible();
});

test("secrets: create a new environment (KV mount + label) in one step", async ({ page }) => {
  const mount = `billing${Date.now()}`;
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.goto("/ui2/secrets");
  await page.getByRole("button", { name: "New environment" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("prod", { exact: true }).fill(mount);
  await dialog.getByPlaceholder("Production").fill("Billing Prod");
  await dialog.getByRole("button", { name: "Create environment" }).click();

  // the new environment shows up with its friendly name
  await expect(page.getByText("Billing Prod").first()).toBeVisible();

  // disable it again (typed-confirm) — full lifecycle
  await page.getByLabel(`Disable ${mount}/`).click();
  const confirm = page.getByRole("dialog");
  await confirm.locator("#confirm-input").fill(mount);
  await confirm.getByRole("button", { name: "Disable environment" }).click();
  await expect(page.getByText("Billing Prod")).toHaveCount(0);
});

test("secrets: ?new=1 deep-link auto-opens the New environment dialog", async ({ page }) => {
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.goto("/ui2/secrets?new=1");
  await expect(page.getByRole("heading", { name: "New environment" })).toBeVisible();
});

test("secrets: disabling an env warns about referencing scoped roles", async ({ page }) => {
  const env = `warnenv${Date.now()}`;
  const role = `warnrole${Date.now()}`;
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  // create an environment
  await page.goto("/ui2/secrets");
  await page.getByRole("button", { name: "New environment" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("prod", { exact: true }).fill(env);
  await dialog.getByRole("button", { name: "Create environment" }).click();
  await expect(page.getByText(`${env}/`).first()).toBeVisible();

  // grant a scoped role over that specific environment
  await page.goto("/ui2/access/team");
  await page.getByRole("button", { name: "Grant access" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("payments-prod-viewer").fill(role);
  await dialog.getByRole("button", { name: "Specific environments" }).click();
  await dialog.locator("label").filter({ hasText: env }).locator("input").check();
  // grant on all paths in that env
  await dialog.locator("label").filter({ hasText: "Everything" }).locator("input").check();
  await dialog.getByRole("button", { name: "Grant access", exact: true }).click();
  await expect(page.getByText(role)).toBeVisible();

  // disabling the env now warns that the role still targets it
  await page.goto("/ui2/secrets");
  await page.getByLabel(`Disable ${env}/`).click();
  await expect(page.getByText(role)).toBeVisible();
  await expect(page.getByText(/scoped role/)).toBeVisible();
});

test("team: grant scoped access (app-specific role) with live policy preview", async ({ page }) => {
  const role = `payments-editor-${Date.now()}`;
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.goto("/ui2/access/team");
  await page.getByRole("button", { name: "Grant access" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("payments-prod-viewer").fill(role);
  // scope to specific environments (the dev `secret` mount is always present)
  await dialog.getByRole("button", { name: "Specific environments" }).click();
  for (const c of await dialog.getByRole("checkbox").all()) await c.check();
  // grant the whole environment via the path picker
  await dialog.locator("label").filter({ hasText: "Everything" }).locator("input").check();

  // the generated policy preview reflects the selection
  await expect(dialog.getByText("secret/data/*")).toBeVisible();

  await dialog.getByRole("button", { name: "Grant access", exact: true }).click();

  // the scoped role is now listed (which means policy + group were created)
  await expect(page.getByText(role)).toBeVisible();
});

test("access: issue an app credential reveals role_id/secret_id", async ({ page }) => {
  const app = `svc${Date.now()}`;
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.goto("/ui2/access/app-credentials");
  await page.getByRole("button", { name: "Issue credential" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("backend").fill(app);
  // scope to a specific environment (the dev `secret` mount is always present)
  await dialog.getByRole("button", { name: "Specific environments" }).click();
  await dialog.getByRole("checkbox").first().check();
  // grant the whole environment via the path picker
  await dialog.locator("label").filter({ hasText: "Everything" }).locator("input").check();
  await dialog.getByRole("button", { name: "Issue credential" }).click();

  // reveal step shows the one-time credentials
  await expect(page.getByText("Credentials issued")).toBeVisible();
  await expect(page.getByText("role_id").first()).toBeVisible();
  await expect(page.getByText("secret_id").first()).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  // the credential is now listed
  await expect(page.getByText(app, { exact: true })).toBeVisible();
});

test("secrets: apps view + register a new app", async ({ page }) => {
  const app = `app${Date.now()}`;
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.goto("/ui2/secrets/apps");
  await expect(page.getByRole("heading", { name: "Apps" })).toBeVisible();
  await page.getByRole("button", { name: "New app" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("payments", { exact: true }).fill(app);
  await dialog.getByRole("button", { name: "Create app" }).click();
  // the registered app shows up in the grid
  await expect(page.getByText(app, { exact: true })).toBeVisible();
});

test("auth: Google sign-in wizard renders", async ({ page }) => {
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.goto("/ui2/access/auth");
  await page.getByRole("button", { name: "Set up Google sign-in" }).click();
  await expect(page.getByRole("heading", { name: "Set up Google sign-in" })).toBeVisible();
  // the callback redirect URI the operator must register with Google is shown
  await expect(page.getByText("/ui2/api/auth/oidc/callback")).toBeVisible();
  await expect(page.getByText("Client ID")).toBeVisible();
  // close without submitting (no external network needed)
  await page.getByRole("button", { name: "Cancel" }).click();
});

test("public OpenBao transport and stock UI are not exposed", async ({ page }) => {
  // A real external request must never reach OpenBao's raw transport or stock
  // UI. Either route would expose bootstrap/control-plane behavior before the
  // operator has initialized the server.
  const [rawApi, stockUi] = await Promise.all([
    page.request.get("/v1/sys/seal-status"),
    page.request.get("/ui/"),
  ]);

  expect(rawApi.status()).toBe(404);
  expect(stockUi.status()).toBe(404);
  await expect(page.getByText("Sign in to OpenBao")).toHaveCount(0);
});

// NOTE: keep this LAST — it enables an unauth auth method and sets branding,
// which changes the shared login page for any test that runs afterwards.
test("login customization: branding + method discovery", async ({ page }) => {
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  // enable an OIDC method and surface it on the login page (listing_visibility)
  await page.goto("/ui2/access/auth");
  await page.getByRole("button", { name: "Enable method" }).click();
  const authTypePicker = page.getByRole("dialog").getByRole("combobox");
  await authTypePicker.click();
  await page.getByRole("option", { name: "oidc" }).click();
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  // select the freshly enabled method from the list, then open Tune
  await page.getByRole("button", { name: /oidc\// }).click();
  await page.getByRole("button", { name: /^Tune/ }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save tune" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // brand the login page via Settings → Login Page
  await page.goto("/ui2/settings/login");
  await page.getByPlaceholder("Sign in to OpenBao").fill("Acme Vault");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // the login page reflects branding + discovered method, token tucked away
  await page.goto("/ui2/login");
  await expect(page.getByText("Acme Vault")).toBeVisible();
  // An enabled but unconfigured OIDC mount must not advertise a dead external
  // login path. Token fallback remains explicitly available.
  await expect(
    page.getByRole("button", { name: "Continue with OIDC" }),
  ).toHaveCount(0);
  await expect(page.locator("#token")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});


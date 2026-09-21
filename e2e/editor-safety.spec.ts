import { expect, type Page, test } from "@playwright/test";

const TOKEN = process.env.E2E_TOKEN ?? "root";

type MockState = {
  data?: Record<string, unknown>;
  dataStatus?: number;
  delayData?: boolean;
  currentVersion?: number;
  deletionTime?: string;
  destroyed?: boolean;
  writes: Array<{ namespace: string; body: unknown }>;
  undeletes: number;
};

async function login(page: Page) {
  await page.goto("/");
  await page.fill("#token", TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
}

async function mockSecret(page: Page, state: MockState) {
  let releaseData: (() => void) | undefined;
  const dataGate = new Promise<void>((resolve) => {
    releaseData = resolve;
  });

  await page.route("**/ui2/api/bao/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = decodeURIComponent(url.pathname.split("/api/bao/")[1] ?? "");
    const namespace = request.headers()["x-vault-namespace"] ?? "";
    const version = state.currentVersion ?? 4;
    const versionMeta = {
      created_time: "2026-01-01T00:00:00Z",
      deletion_time: state.deletionTime ?? "",
      destroyed: state.destroyed ?? false,
    };

    if (path === "sys/internal/ui/mounts") {
      return route.fulfill({
        json: { data: { secret: { "secret/": { type: "kv", options: { version: "2" } } } } },
      });
    }
    if (path === "secret/metadata/demo" && url.searchParams.get("list") === "true") {
      return route.fulfill({ status: 404, json: { errors: ["not a folder"] } });
    }
    if ((path === "secret/metadata/" || path === "secret/metadata") && url.searchParams.get("list") === "true") {
      return route.fulfill({ json: { data: { keys: ["demo"] } } });
    }
    if (path === "secret/metadata/demo") {
      return route.fulfill({
        json: {
          data: {
            current_version: version,
            oldest_version: 1,
            max_versions: 0,
            cas_required: false,
            custom_metadata: null,
            created_time: "2026-01-01T00:00:00Z",
            updated_time: "2026-01-01T00:00:00Z",
            versions: { [String(version)]: versionMeta },
          },
        },
      });
    }
    if (path === "secret/data/demo" && request.method() === "POST") {
      state.writes.push({ namespace, body: request.postDataJSON() });
      return route.fulfill({ json: { data: {} } });
    }
    if (path === "secret/undelete/demo") {
      state.undeletes += 1;
      return route.fulfill({ json: {} });
    }
    if (path === "secret/data/demo") {
      if (state.delayData) await dataGate;
      if (state.dataStatus) {
        return route.fulfill({
          status: state.dataStatus,
          json: { errors: [state.dataStatus === 403 ? "permission denied" : "missing"] },
        });
      }
      return route.fulfill({
        json: {
          data: {
            data: state.data ?? { token: namespace ? "other" : "original" },
            metadata: { version, ...versionMeta, custom_metadata: null },
          },
        },
      });
    }
    return route.fallback();
  });

  return { releaseData: () => releaseData?.() };
}

test("edit stays gated while a read is delayed and after it is denied", async ({ page }) => {
  await login(page);
  const state: MockState = { delayData: true, dataStatus: 403, writes: [], undeletes: 0 };
  const control = await mockSecret(page, state);

  await page.goto("/ui2/secrets/secret/demo");
  await expect(page.getByText("Loading secret data…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);

  control.releaseData();
  await expect(page.getByText("permission denied")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
});

test("namespace switching discards an open cached draft", async ({ page }) => {
  await login(page);
  const state: MockState = { writes: [], undeletes: 0 };
  await mockSecret(page, state);

  // Warm the alternate namespace's query cache before returning to root.
  await page.getByRole("button", { name: /Workspace/ }).click();
  await page.getByPlaceholder("enter namespace path…").fill("team-a");
  await page.getByRole("button", { name: "Go" }).click();
  await page.goto("/ui2/secrets/secret/demo");
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  await page.getByRole("button", { name: /Workspace/ }).click();
  await page.getByRole("button", { name: "root", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByPlaceholder("value").fill("unsaved-root-draft");
  await page.getByRole("button", { name: /Workspace/ }).click();
  await page.getByPlaceholder("enter namespace path…").fill("team-a");
  await page.getByRole("button", { name: "Go" }).click();

  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(page.locator('input[value="unsaved-root-draft"]')).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("an editor keeps its opening CAS across a metadata refetch", async ({ page, context }) => {
  await login(page);
  const state: MockState = { currentVersion: 4, writes: [], undeletes: 0 };
  await mockSecret(page, state);
  await page.goto("/ui2/secrets/secret/demo");
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByPlaceholder("value").fill("edited");

  state.currentVersion = 5;
  await page.clock.install();
  await page.clock.fastForward(6_000);
  await context.setOffline(true);
  await context.setOffline(false);
  await expect(page.getByText("version 5")).toBeVisible();

  await page.getByRole("button", { name: "Save new version" }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].body).toMatchObject({ options: { cas: 4 } });
});

test("structure editor snapshots CAS and closes a draft on namespace change", async ({ page, context }) => {
  await login(page);
  const state: MockState = { currentVersion: 4, writes: [], undeletes: 0 };
  await mockSecret(page, state);
  await page.goto("/ui2/secrets/structure");
  await page.getByRole("button", { name: /demo/ }).click();
  await page.getByRole("button", { name: "edit" }).click();
  await page.getByPlaceholder("value").fill("structure-edit");

  state.currentVersion = 5;
  await page.clock.install();
  await page.clock.fastForward(6_000);
  await context.setOffline(true);
  await context.setOffline(false);
  await expect(page.getByPlaceholder("value")).toHaveValue("structure-edit");
  await page.getByRole("button", { name: "Save new version" }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].body).toMatchObject({ options: { cas: 4 } });

  await page.getByRole("button", { name: "edit" }).click();
  await page.getByPlaceholder("value").fill("discard-structure-draft");
  await page.getByRole("button", { name: /Workspace/ }).click();
  await page.getByPlaceholder("enter namespace path…").fill("team-a");
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page.locator('input[value="discard-structure-draft"]')).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
});

test("invalid and typed JSON remain in the raw editor", async ({ page }) => {
  await login(page);
  const state: MockState = { writes: [], undeletes: 0 };
  await mockSecret(page, state);
  await page.goto("/ui2/secrets/secret/demo");
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Raw JSON" }).click();

  const textarea = page.locator("textarea");
  await textarea.fill('{"token":');
  await page.getByRole("button", { name: "Key/value editor" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(textarea).toHaveValue('{"token":');

  await textarea.fill('{"nested":{"enabled":true}}');
  await page.getByRole("button", { name: "Key/value editor" }).click();
  await expect(page.getByRole("alert")).toContainText("only supports string values");
  await expect(textarea).toHaveValue('{"nested":{"enabled":true}}');
});

test("logout and login in one context do not reuse cached secret data", async ({ page }) => {
  await login(page);
  const state: MockState = { data: { token: "first-session" }, writes: [], undeletes: 0 };
  await mockSecret(page, state);
  await page.goto("/ui2/secrets/secret/demo");
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByPlaceholder("value")).toHaveValue("first-session");

  state.data = { token: "second-session" };
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("Sign in to OpenBao")).toBeVisible();

  await login(page);
  await page.goto("/ui2/secrets/secret/demo");
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByPlaceholder("value")).toHaveValue("second-session");
  await expect(page.locator('input[value="first-session"]')).toHaveCount(0);
});

test("metadata-confirmed deleted versions retain undelete recovery", async ({ page }) => {
  await login(page);
  const state: MockState = {
    dataStatus: 404,
    deletionTime: "2026-01-02T00:00:00Z",
    writes: [],
    undeletes: 0,
  };
  await mockSecret(page, state);
  await page.goto("/ui2/secrets/secret/demo");

  await expect(page.getByText("This version is soft-deleted.")).toBeVisible();
  await page.getByRole("button", { name: "Undelete" }).click();
  await expect.poll(() => state.undeletes).toBe(1);
});

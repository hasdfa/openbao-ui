import { defineConfig } from "@playwright/test";

// E2E runs against an already-running stack (UI + OpenBao). The easiest way to
// get one is the single image:
//   docker run --init -p 3000:3000 -e BAO_DEV=1 -e BAO_DEV_ROOT_TOKEN_ID=root openbao-ui
// then: E2E_TOKEN=root pnpm e2e
export default defineConfig({
  testDir: "./e2e",
  // Suites share one OpenBao instance and mutate auth/branding configuration.
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1366, height: 900 },
    screenshot: "only-on-failure",
  },
});

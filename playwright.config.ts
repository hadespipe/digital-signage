import { defineConfig } from "@playwright/test";
// Playwright sets FORCE_COLOR for workers; avoid inherited conflicting switches.
delete process.env.NO_COLOR;
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3187" },
  webServer: {
    command: "~/.bun/bin/bun tests/e2e/server.ts",
    url: "http://127.0.0.1:3187/api/health",
    reuseExistingServer: false,
  },
});

import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./test/browser",
  timeout: 30_000,
  expect: { timeout: 12_000 },
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["json", { outputFile: "test-results/playwright.json" }]]
    : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      testIgnore: /native\.spec\.mjs/,
      use: {
        browserName: "chromium",
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      },
    },
    {
      name: "firefox",
      testIgnore: /(?:native|benchmark|soak)\.spec\.mjs/,
      use: { browserName: "firefox" },
    },
    {
      name: "native",
      testMatch: /native\.spec\.mjs/,
      use: { browserName: "webkit" },
    },
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});

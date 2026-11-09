import { defineConfig } from "@playwright/test";

const port = Number(process.env.SOAK_PORT ?? 4174);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./test/qualification",
  outputDir: process.env.SOAK_OUTPUT ?? "test-results/soak",
  workers: 1,
  use: { browserName: "chromium", baseURL },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/blank.html`,
  },
});

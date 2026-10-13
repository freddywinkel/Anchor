import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:8800/Anchor/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    contextOptions: { reducedMotion: "reduce" },
    ...devices["Desktop Chrome"],
    channel: process.env.CI ? undefined : "chrome",
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    serviceWorkers: "allow",
  },
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 8800 --strictPort",
    url: "http://127.0.0.1:8800/Anchor/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});

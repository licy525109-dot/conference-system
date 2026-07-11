import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/frontend",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.015
    }
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:5173",
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    locale: "zh-CN",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: [
    {
      command: "pnpm --filter @conference/user dev:h5",
      url: "http://localhost:5173",
      timeout: 120_000,
      reuseExistingServer: true
    },
    {
      command: "pnpm --filter @conference/admin dev",
      url: "http://localhost:5174",
      timeout: 120_000,
      reuseExistingServer: true
    }
  ]
});

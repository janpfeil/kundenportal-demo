import { defineConfig, devices } from "@playwright/test";

/** Runs against the live portal; see .github/workflows/e2e.yml. */
export default defineConfig({
  testDir: "src",
  timeout: 120_000,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PORTAL_URL ?? "https://kundenportal-demo.rypox.com",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

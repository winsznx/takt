import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
/** Set TAKT_BASE_URL to run against a deployment instead of a local server. */
const REMOTE = process.env.TAKT_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: REMOTE ?? `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: REMOTE
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        port: PORT,
        reuseExistingServer: !process.env.CI,
        env: { GEMINI_API_KEY: "" },
      },
});

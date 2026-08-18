import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;

/**
 * The end-to-end suite drives a real build against a real database.
 *
 * The database is rebuilt from scratch on every run, so the suite always starts
 * from the same seeded state — a test that depends on whatever was left in
 * ./.pglite from yesterday is worse than no test.
 *
 * It runs against a production build rather than the dev server. That is what
 * gets deployed, and the dev server's cross-origin protection for its own
 * chunks blocks them when the host is not exactly `localhost`, which fails in a
 * way that looks like a broken login form.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // one seeded database, shared
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : "list",
  retries: process.env.CI ? 1 : 0,

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: `rm -rf .pglite-e2e && npm run setup && npm run build && npx next start --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      AUTH_SECRET:
        process.env.AUTH_SECRET ?? "e2e-secret-not-used-outside-the-test-run",
      PGLITE_DATA_DIR: "./.pglite-e2e",
      // Deliberately blank, whatever is in .env. These tests assert the exact
      // contents of the brief — the grounding score, the planted unsupported
      // claim, the wording of a conflict — which only holds against the
      // recorded analysis. Inheriting a real key made the suite spend money,
      // take minutes, and fail for reasons that have nothing to do with the
      // code: a spent quota, a rate limit, a model returning something
      // slightly different this time.
      ANTHROPIC_API_KEY: "",
    },
  },
});

import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // Vitest's default glob picks up *.spec.ts, which would drag the Playwright
    // suite in here — where its test.describe throws, since it expects to be
    // run by Playwright. The two runners stay in their own directories.
    include: ["tests/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    // PGlite boots a WASM Postgres per test file; give it room on a cold run.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "./src") },
  },
});

import type { Config } from "drizzle-kit";

/**
 * Schema generation only. Migrations are applied by scripts/migrate.ts, which
 * picks the driver (PGlite locally, Neon in deployed environments) the same way
 * the app does — see src/db/index.ts.
 */
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  verbose: true,
  strict: true,
} satisfies Config;

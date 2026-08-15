/**
 * Every test file gets its own in-memory Postgres, migrated exactly the way a
 * deployed environment is — same migration files, same RLS policies. Nothing
 * touches the developer's ./.pglite directory, and there is no server to start.
 *
 * These assignments are at module scope, not inside a hook, and that placement
 * is load-bearing: vitest evaluates setup files before it imports the test
 * module, but hooks registered here do not run until after that import. The
 * database module reads its configuration once when it is first imported, so
 * anything set inside beforeAll would arrive too late and the suite would
 * quietly run against the developer's own database.
 */
process.env.PGLITE_DATA_DIR = "memory://";
delete process.env.DATABASE_URL;
process.env.AUTH_SECRET ??= "test-secret-not-used-outside-tests";

import { beforeAll } from "vitest";

beforeAll(async () => {
  const { applyMigrations } = await import("../src/db/migrate");
  await applyMigrations();
});

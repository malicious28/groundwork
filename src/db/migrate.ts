import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { getDb, isNeon } from "./index";

/**
 * Schema migrations followed by the row-level security policies, as one unit.
 * Shared by the CLI (scripts/migrate.ts) and the test setup so the database a
 * test runs against is built exactly the way production's is.
 */
export async function applyMigrations(
  migrationsFolder = resolve(process.cwd(), "drizzle"),
): Promise<void> {
  const db = getDb();

  if (isNeon) {
    const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder });
  }

  // Split on the same marker drizzle-kit writes into its own migrations. Both
  // drivers send statements through the extended query protocol, which accepts
  // exactly one command per round trip, so a multi-statement file has to be
  // fed in one piece at a time. Splitting on a marker rather than on `;` keeps
  // the `$$ … $$` bodies intact.
  const policies = readFileSync(
    resolve(migrationsFolder, "policies.sql"),
    "utf8",
  );
  const statements = policies
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(--[^\n]*\n?)*$/.test(s));

  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
}

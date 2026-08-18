import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";
import { claimDataDirectory } from "./lock";

/**
 * One schema, two drivers.
 *
 *   local dev / test / CI  →  PGlite, Postgres compiled to WASM, running in
 *                             process with its data in ./.pglite. No Docker,
 *                             no server, no cloud account: `npm run setup`
 *                             then `npm run dev` and the app is live.
 *
 *   staging / production   →  Neon over its WebSocket pool driver.
 *
 * The pool driver is deliberate rather than the (lighter) HTTP one: row-level
 * security needs `set_config('app.current_org', …, true)` and the statements it
 * guards to share a transaction, and only a real connection gives us that.
 *
 * Both drivers are imported statically — neither does any work until it is
 * constructed, so the unused one costs nothing but a module reference.
 */

export type Db = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export const isNeon = Boolean(process.env.DATABASE_URL);

/** Where PGlite keeps its data. Deleting this directory resets local state. */
export const PGLITE_DATA_DIR = process.env.PGLITE_DATA_DIR ?? "./.pglite";

/*
 * Next.js re-evaluates modules on every hot reload in development. Without a
 * global cache each reload would open a second PGlite instance against the same
 * data directory. Within one process that is what this cache prevents; across
 * processes it is what `claimDataDirectory` prevents, and that one matters more
 * because PGlite does not refuse a second opener — it corrupts.
 */
const globalForDb = globalThis as unknown as { __groundworkDb?: Db };

function create(): Db {
  if (isNeon) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    return drizzleNeon(pool, { schema }) as unknown as Db;
  }
  claimDataDirectory(PGLITE_DATA_DIR);
  const client = new PGlite(PGLITE_DATA_DIR);
  return drizzlePglite(client, { schema }) as unknown as Db;
}

export function getDb(): Db {
  if (!globalForDb.__groundworkDb) {
    globalForDb.__groundworkDb = create();
  }
  return globalForDb.__groundworkDb;
}

/**
 * Lazily-resolved handle so importing this module never opens a connection —
 * which matters for the parsers and their unit tests, none of which touch the
 * database.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});

export { schema };

export const describeDriver = (): string =>
  isNeon ? "neon (websocket pool)" : `pglite (${PGLITE_DATA_DIR})`;

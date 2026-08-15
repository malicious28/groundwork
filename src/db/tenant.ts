import { sql } from "drizzle-orm";
import { getDb, type Db } from "./index";
import type { MemberRole } from "./schema";

/**
 * Tenant scoping.
 *
 * Every read or write of customer data goes through `withTenant`. It opens a
 * transaction, pins `app.current_org` for the life of that transaction, and
 * hands the caller a database handle. The row-level security policies in
 * drizzle/policies.sql compare `org_id` against that setting, so a query that
 * forgets its `where org_id = …` returns nothing rather than someone else's
 * data.
 *
 * `set_config(..., true)` makes the setting transaction-local, so it cannot
 * leak to the next request that reuses the same pooled connection. That detail
 * is the whole reason this is a transaction and not a bare `SET`.
 *
 * The application-level filters are still written by hand everywhere. Two
 * layers is the point: the filters make intent obvious in review, and the
 * policies are what still holds when someone forgets one.
 */

export type TenantContext = {
  orgId: string;
  userId: string;
  role: MemberRole;
};

export async function withTenant<T>(
  orgId: string,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  const database = getDb();
  return database.transaction(async (tx) => {
    // Drop to the restricted role first. Migrations connect as the owner (and
    // in local development as a superuser), and RLS is bypassed for both — so
    // without this line the policies below would never actually apply.
    await tx.execute(sql`set local role groundwork_app`);
    await tx.execute(sql`select set_config('app.current_org', ${orgId}, true)`);
    return fn(tx as unknown as Db);
  });
}

/** Convenience overload for a resolved session. */
export async function withTenantContext<T>(
  ctx: TenantContext,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return withTenant(ctx.orgId, fn);
}

/**
 * There is deliberately no bypass helper. Because the policies are FORCED, an
 * unscoped handle cannot read or write a tenant table at all — seeding creates
 * the organization row first (the directory tables carry no policy) and then
 * does everything else inside withTenant, exactly like a request does.
 */

export const ROLE_RANK: Record<MemberRole, number> = {
  client: 0,
  consultant: 1,
  owner: 2,
};

export function atLeast(role: MemberRole, required: MemberRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

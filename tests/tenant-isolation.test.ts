import { describe, it, expect, beforeAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../src/db";
import { organizations, projects, sources } from "../src/db/schema";
import { withTenant } from "../src/db/tenant";

/**
 * The claim this suite defends: when the application reads customer data, it
 * sees one tenant's rows and no others — and that holds because of the database
 * policies, not because someone remembered a `where` clause.
 *
 * Every query below is deliberately written *without* an `org_id` filter, so a
 * pass means row-level security is doing the work on its own.
 */

let orgA: string;
let orgB: string;
let alphaProjectId: string;

beforeAll(async () => {
  const db = getDb();

  const [a] = await db
    .insert(organizations)
    .values({ name: "Alpha Consulting", slug: "alpha" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "Beta Digital", slug: "beta" })
    .returning();
  if (!a || !b) throw new Error("failed to create test organizations");
  orgA = a.id;
  orgB = b.id;

  await withTenant(orgA, async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        orgId: orgA,
        name: "Alpha's confidential engagement",
        clientName: "Confidential Ltd",
      })
      .returning();
    alphaProjectId = project!.id;

    await tx.insert(sources).values({
      orgId: orgA,
      projectId: project!.id,
      ref: "kickoff-call",
      kind: "transcript",
      label: "Kickoff call",
      rawText: "Alpha's private transcript text.",
      parseStatus: "ready",
    });
  });

  await withTenant(orgB, async (tx) => {
    await tx.insert(projects).values({
      orgId: orgB,
      name: "Beta's own engagement",
      clientName: "Beta Client",
    });
  });
});

describe("row-level security", () => {
  it("shows a tenant only its own rows", async () => {
    const seenByA = await withTenant(orgA, (tx) => tx.select().from(projects));
    const seenByB = await withTenant(orgB, (tx) => tx.select().from(projects));

    expect(seenByA).toHaveLength(1);
    expect(seenByA[0]!.name).toBe("Alpha's confidential engagement");
    expect(seenByB).toHaveLength(1);
    expect(seenByB[0]!.name).toBe("Beta's own engagement");
  });

  it("hides another tenant's row even when its id is known", async () => {
    const stolen = await withTenant(orgB, (tx) =>
      tx.select().from(projects).where(eq(projects.id, alphaProjectId)),
    );
    expect(stolen).toHaveLength(0);
  });

  it("refuses a cross-tenant write", async () => {
    await expect(
      withTenant(orgB, async (tx) => {
        await tx.insert(projects).values({
          orgId: orgA, // lying about the tenant
          name: "planted by Beta",
          clientName: "x",
        });
      }),
    ).rejects.toThrow();
  });

  it("protects evidence, not just projects", async () => {
    const rows = await withTenant(orgB, (tx) => tx.select().from(sources));
    expect(rows).toHaveLength(0);
  });

  it("fails closed when the application role has no tenant set", async () => {
    // The state a bug would produce: request-time role, no org pinned. The
    // policy compares against NULL, which matches nothing, so the query
    // returns empty rather than everything.
    const db = getDb();
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role groundwork_app`);
      return tx.select().from(projects);
    });
    expect(rows).toHaveLength(0);
  });

  it("still lets the owner role through, which is how migrations run", async () => {
    // Documented on purpose: the owner bypasses RLS, and that is why every
    // request path drops to groundwork_app inside withTenant. If this ever
    // starts failing, migrations and seeding will have broken too.
    const db = getDb();
    const rows = await db.select().from(projects);
    expect(rows.length).toBeGreaterThan(0);
  });
});

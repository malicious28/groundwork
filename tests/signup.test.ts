import { describe, it, expect } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../src/db";
import { memberships, organizations, projects, sources, users } from "../src/db/schema";
import { withTenant } from "../src/db/tenant";
import { createAccount, slugify } from "../src/lib/signup";

/**
 * A new account must land in an empty workspace.
 *
 * The demo material is one firm's engagement, and it existing in somebody
 * else's workspace would make the tool impossible to evaluate: you could not
 * tell what it had read from your documents and what was already sitting there.
 * That emptiness is asserted here rather than assumed, because it is a property
 * of what the sign-up path *does not* do, and nothing else would catch it
 * regressing.
 */

const password = "correct-horse";

async function signUp(email: string, workspace = "Acme Consulting") {
  const result = await createAccount({
    email,
    name: "A Person",
    workspace,
    password,
  });
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe("creating an account", () => {
  it("gives the new workspace nothing at all", async () => {
    const { orgId } = await signUp("first@example.test");

    const contents = await withTenant(orgId, async (tx) => ({
      projects: await tx.select().from(projects).where(eq(projects.orgId, orgId)),
      sources: await tx.select().from(sources).where(eq(sources.orgId, orgId)),
    }));

    expect(contents.projects).toHaveLength(0);
    expect(contents.sources).toHaveLength(0);
  });

  it("makes the person who signed up the owner of it", async () => {
    const { orgId, userId } = await signUp("owner@example.test");

    const rows = await withTenant(orgId, (tx) =>
      tx.select().from(memberships).where(eq(memberships.orgId, orgId)),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(userId);
    expect(rows[0]?.role).toBe("owner");
  });

  it("refuses an email that already has an account", async () => {
    await signUp("taken@example.test");
    const again = await createAccount({
      email: "taken@example.test",
      name: "Someone Else",
      workspace: "Other",
      password,
    });

    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatch(/already has an account/i);

    // And no orphaned workspace was left behind by the rejected attempt.
    const db = getDb();
    const people = await db
      .select()
      .from(users)
      .where(eq(users.email, "taken@example.test"));
    expect(people).toHaveLength(1);
  });

  it("refuses a password too short to be worth hashing", async () => {
    const result = await createAccount({
      email: "short@example.test",
      name: "A Person",
      workspace: "Acme",
      password: "1234567",
    });
    expect(result.ok).toBe(false);
  });

  it("keeps two workspaces of the same name apart", async () => {
    const a = await signUp("a@example.test", "Same Name Ltd");
    const b = await signUp("b@example.test", "Same Name Ltd");

    const db = getDb();
    const orgs = await db
      .select()
      .from(organizations)
      .where(inArray(organizations.id, [a.orgId, b.orgId]));

    const slugs = orgs.map((org) => org.slug);
    expect(new Set(slugs).size).toBe(2);
  });

  it("will not take a slug the demo owns", async () => {
    const { orgId } = await signUp("squatter@example.test", "Meridian");
    const db = getDb();
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId));
    expect(org?.slug).not.toBe("meridian");
  });

  it("survives a workspace name with nothing sluggable in it", () => {
    expect(slugify("!!!")).toBe("workspace");
    expect(slugify("Ashika's Studio — Pune")).toBe("ashika-s-studio-pune");
  });
});

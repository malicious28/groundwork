import "dotenv/config";
import { getDb, describeDriver } from "../src/db";
import {
  organizations,
  users,
  memberships,
  projects,
} from "../src/db/schema";
import { withTenant } from "../src/db/tenant";
import { hashPassword } from "../src/lib/auth/password";

/**
 * A clean workspace: one account, one empty project, no demo content.
 *
 * `db:seed` loads the Nova Interiors story so the product can be demonstrated
 * without uploading anything. This is the opposite — it exists to walk the real
 * flow end to end with your own documents, starting from nothing.
 *
 * An account and an organization are still created, because there is no way to
 * sign in without them. Everything below that is left empty.
 */

const EMAIL = process.env.FRESH_EMAIL ?? "you@example.com";
const PASSWORD = process.env.FRESH_PASSWORD ?? "demo1234";

async function main() {
  const db = getDb();
  console.log(`→ driver: ${describeDriver()}`);

  // Deleting the organizations cascades to every project, source, span,
  // artifact, claim, citation, conflict and question beneath them.
  const orgs = await db.delete(organizations).returning();
  const people = await db.delete(users).returning();
  console.log(
    `✓ removed ${orgs.length} organization(s) and ${people.length} user(s), and everything belonging to them`,
  );

  const [org] = await db
    .insert(organizations)
    .values({ name: "My Workspace", slug: "my-workspace" })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      email: EMAIL,
      name: "You",
      passwordHash: await hashPassword(PASSWORD),
    })
    .returning();
  if (!org || !user) throw new Error("could not create the workspace");

  await withTenant(org.id, async (tx) => {
    await tx.insert(memberships).values({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });
    await tx.insert(projects).values({
      orgId: org.id,
      name: "My first project",
      clientName: "My client",
      summary: "Empty. Upload your own documents to begin.",
      createdBy: user.id,
    });
  });

  console.log("\n✓ clean workspace ready — no demo data\n");
  console.log(`  Sign in at /login`);
  console.log(`    email:    ${EMAIL}`);
  console.log(`    password: ${PASSWORD}`);
  console.log(`\n  Then open "My first project" and upload your files.`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(
      "\n  ⚠ ANTHROPIC_API_KEY is not set. Uploading and reading files will work,",
    );
    console.log(
      "    but Run discovery needs a key to analyse documents that are not the",
    );
    console.log("    seeded demo. Add one to .env and restart.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("✗ failed");
  console.error(err);
  process.exit(1);
});

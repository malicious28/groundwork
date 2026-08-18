import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, organizations, users } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { hashPassword } from "@/lib/auth/password";

/**
 * Creating an account, and the workspace it owns.
 *
 * A new account gets a genuinely empty workspace: no project, no sources,
 * nothing carried over from the demo. That is not laziness about onboarding —
 * the demo material is one firm's real-looking engagement, and finding
 * somebody else's client project sitting in your own workspace would make it
 * impossible to tell what the tool had actually read from *your* documents.
 * The demo lives in one account, and that account is the only place it exists.
 *
 * Signing up always creates an organization as well as a user, because an
 * account with no workspace has nothing it is allowed to read — every table
 * below the organization is scoped by it.
 */

export type SignupInput = {
  email: string;
  name: string;
  workspace: string;
  password: string;
};

export type SignupResult =
  | { ok: true; userId: string; orgId: string }
  | { ok: false; error: string };

/** Reserved because the demo owns them, and a collision would be confusing. */
const RESERVED_SLUGS = new Set(["meridian", "northwind", "demo", "admin"]);

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "workspace";
}

/** Appends a counter until the slug is free. Slugs are unique in the schema. */
async function freeSlug(base: string): Promise<string> {
  let candidate = RESERVED_SLUGS.has(base) ? `${base}-1` : base;
  for (let n = 2; n < 500; n += 1) {
    const [taken] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, candidate));
    if (!taken) return candidate;
    candidate = `${base}-${n}`;
  }
  throw new Error("could not find a free workspace address");
}

export async function createAccount(input: SignupInput): Promise<SignupResult> {
  const email = input.email.toLowerCase().trim();
  const name = input.name.trim();
  const workspace = input.workspace.trim();

  if (input.password.length < 8) {
    return { ok: false, error: "Choose a password of at least 8 characters." };
  }
  if (!name) return { ok: false, error: "Tell us your name." };
  if (!workspace) return { ok: false, error: "Name your workspace." };

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (existing) {
    // Deliberately explicit rather than vague. This is a sign-up form, where
    // "that address is already registered" is the only useful thing to say —
    // the enumeration concern belongs on the sign-in form, and is handled
    // there.
    return {
      ok: false,
      error: "That email address already has an account. Sign in instead.",
    };
  }

  const [org] = await db
    .insert(organizations)
    .values({ name: workspace, slug: await freeSlug(slugify(workspace)) })
    .returning();
  if (!org) return { ok: false, error: "Could not create the workspace." };

  const [user] = await db
    .insert(users)
    .values({ email, name, passwordHash: await hashPassword(input.password) })
    .returning();
  if (!user) return { ok: false, error: "Could not create the account." };

  // Through the tenant path like everything else, so this writes under the same
  // policies a request does rather than around them.
  await withTenant(org.id, async (tx) => {
    await tx
      .insert(memberships)
      .values({ orgId: org.id, userId: user.id, role: "owner" });
  });

  return { ok: true, userId: user.id, orgId: org.id };
}

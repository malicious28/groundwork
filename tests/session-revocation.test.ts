import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "../src/db";
import { memberships, organizations, users } from "../src/db/schema";
import { withTenant } from "../src/db/tenant";
import { claimsForUser } from "../src/lib/auth/session";
import { changeRole, removeMember } from "../src/lib/team";
import { hashPassword } from "../src/lib/auth/password";

/**
 * A signed token says who signed in. It does not say what they may still do.
 *
 * `getSession` resolves the token against the membership on every request, and
 * these tests pin the reason: without that lookup, removing somebody from a
 * workspace or demoting an owner did nothing at all until their token expired,
 * which is up to eight hours of access after the moment they were removed.
 *
 * The lookup itself is exercised here rather than the cookie wrapper around it,
 * because that wrapper needs a request context; what matters is that a session
 * rebuilt from a token's claims comes back empty once the membership is gone.
 */

let orgId: string;
let ownerId: string;
let memberId: string;

beforeAll(async () => {
  const db = getDb();
  const [org] = await db
    .insert(organizations)
    .values({ name: "Revocation Co", slug: "revocation-co" })
    .returning();
  orgId = org!.id;

  const passwordHash = await hashPassword("password1234");
  const inserted = await db
    .insert(users)
    .values([
      { email: "owner@revocation.example", name: "Owner", passwordHash },
      { email: "member@revocation.example", name: "Member", passwordHash },
    ])
    .returning();
  ownerId = inserted[0]!.id;
  memberId = inserted[1]!.id;

  await withTenant(orgId, (tx) =>
    tx.insert(memberships).values([
      { orgId, userId: ownerId, role: "owner" },
      { orgId, userId: memberId, role: "consultant" },
    ]),
  );
});

describe("a session is only as good as the membership behind it", () => {
  it("resolves while the membership stands", async () => {
    const claims = await claimsForUser(memberId, orgId);
    expect(claims?.orgId).toBe(orgId);
    expect(claims?.role).toBe("consultant");
  });

  it("stops resolving the moment the person is removed", async () => {
    await removeMember(orgId, memberId);
    expect(await claimsForUser(memberId, orgId)).toBeNull();
  });

  it("reports the current role, not the one held when the token was signed", async () => {
    const db = getDb();
    const [second] = await db
      .insert(users)
      .values({
        email: "demoted@revocation.example",
        name: "Demoted",
        passwordHash: await hashPassword("password1234"),
      })
      .returning();
    await withTenant(orgId, (tx) =>
      tx.insert(memberships).values({
        orgId,
        userId: second!.id,
        role: "owner",
      }),
    );

    expect((await claimsForUser(second!.id, orgId))?.role).toBe("owner");
    await changeRole(orgId, second!.id, "client");
    expect((await claimsForUser(second!.id, orgId))?.role).toBe("client");
  });

  it("will not resolve against an organization that no longer exists", async () => {
    // Exactly what a cookie held across `db:reset` looks like: the signature is
    // valid, the ids in it are not.
    const claims = await claimsForUser(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    );
    expect(claims).toBeNull();
  });

  it("keeps somebody in the workspace they signed into", async () => {
    const db = getDb();
    const [other] = await db
      .insert(organizations)
      .values({ name: "Elsewhere", slug: "elsewhere-co" })
      .returning();
    await withTenant(other!.id, (tx) =>
      tx.insert(memberships).values({
        orgId: other!.id,
        userId: ownerId,
        role: "owner",
      }),
    );

    // Belongs to both; asking for one must never hand back the other.
    expect((await claimsForUser(ownerId, orgId))?.orgId).toBe(orgId);
    expect((await claimsForUser(ownerId, other!.id))?.orgId).toBe(other!.id);
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "../src/db";
import { organizations, users } from "../src/db/schema";
import { withTenant } from "../src/db/tenant";
import { memberships } from "../src/db/schema";
import {
  acceptInvite,
  changeRole,
  inviteToOrg,
  listMembers,
  removeMember,
  resolveInvite,
  revokeInvite,
  TeamError,
} from "../src/lib/team";
import { hashPassword } from "../src/lib/auth/password";

/**
 * Inviting people is the point at which a workspace stops being one person's,
 * so the failure modes matter more than the happy path: an invitation must not
 * outlive its usefulness, must not be reusable, and must never let the holder
 * of a link decide which address they are claiming.
 */

let orgId: string;
let ownerId: string;

beforeAll(async () => {
  const db = getDb();
  const [org] = await db
    .insert(organizations)
    .values({ name: "Team Co", slug: "team-co" })
    .returning();
  orgId = org!.id;

  const [owner] = await db
    .insert(users)
    .values({
      email: "owner@team.example",
      name: "Owner",
      passwordHash: await hashPassword("demo1234"),
    })
    .returning();
  ownerId = owner!.id;

  await withTenant(orgId, (tx) =>
    tx.insert(memberships).values({ orgId, userId: ownerId, role: "owner" }),
  );
});

describe("inviting", () => {
  it("issues a token that resolves to the right workspace and role", async () => {
    const token = await inviteToOrg(orgId, ownerId, "New@Team.example", "consultant");
    const invite = await resolveInvite(token);

    expect(invite?.orgId).toBe(orgId);
    expect(invite?.role).toBe("consultant");
    // Addresses are normalised, so re-inviting a differently-cased duplicate is
    // recognised as the same person.
    expect(invite?.email).toBe("new@team.example");
  });

  it("refuses to invite someone already in the workspace", async () => {
    await expect(
      inviteToOrg(orgId, ownerId, "owner@team.example", "consultant"),
    ).rejects.toThrow(TeamError);
  });

  it("replaces an outstanding invitation rather than duplicating it", async () => {
    const first = await inviteToOrg(orgId, ownerId, "again@team.example", "client");
    const second = await inviteToOrg(orgId, ownerId, "again@team.example", "consultant");

    expect(await resolveInvite(first)).toBeNull();
    expect((await resolveInvite(second))?.role).toBe("consultant");
  });

  it("stops resolving once revoked", async () => {
    const token = await inviteToOrg(orgId, ownerId, "gone@team.example", "consultant");
    const invite = await resolveInvite(token);
    await revokeInvite(orgId, invite!.invitationId);

    expect(await resolveInvite(token)).toBeNull();
  });

  it("rejects unknown and trivially short tokens", async () => {
    expect(await resolveInvite("nope")).toBeNull();
    expect(await resolveInvite("")).toBeNull();
  });
});

describe("accepting", () => {
  it("creates the account, joins the workspace, and burns the invitation", async () => {
    const token = await inviteToOrg(orgId, ownerId, "joiner@team.example", "consultant");

    const accepted = await acceptInvite(token, "Joiner", "a-good-password");
    expect(accepted?.orgId).toBe(orgId);
    expect(accepted?.role).toBe("consultant");

    const members = await listMembers(orgId);
    expect(members.map((m) => m.email)).toContain("joiner@team.example");

    // Single use — a forwarded link cannot add a second person.
    expect(await acceptInvite(token, "Someone Else", "another-password")).toBeNull();
  });

  it("uses the invited address, not anything the joiner supplies", async () => {
    const token = await inviteToOrg(orgId, ownerId, "fixed@team.example", "client");
    const accepted = await acceptInvite(token, "Fixed", "a-good-password");

    const members = await listMembers(orgId);
    const joined = members.find((m) => m.userId === accepted!.userId);
    expect(joined?.email).toBe("fixed@team.example");
  });
});

describe("roles", () => {
  it("will not leave the workspace without an owner", async () => {
    await expect(changeRole(orgId, ownerId, "consultant")).rejects.toThrow(
      TeamError,
    );
    await expect(removeMember(orgId, ownerId)).rejects.toThrow(TeamError);
  });

  it("allows demotion once somebody else can manage the workspace", async () => {
    const token = await inviteToOrg(orgId, ownerId, "second@team.example", "owner");
    const second = await acceptInvite(token, "Second Owner", "a-good-password");

    await changeRole(orgId, ownerId, "consultant");
    const members = await listMembers(orgId);

    expect(members.find((m) => m.userId === ownerId)?.role).toBe("consultant");
    expect(members.find((m) => m.userId === second!.userId)?.role).toBe("owner");
  });
});

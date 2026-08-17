import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { withTenant } from "@/db/tenant";
import {
  invitations,
  memberships,
  organizations,
  users,
  type MemberRole,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";

/**
 * Teams: inviting people into an organization, and accepting.
 *
 * The invitation itself is the second place in this codebase that reads outside
 * a tenant scope, for the same reason share links do — resolving the token is
 * what establishes which organization the person is joining. It is confined to
 * one function, selects only what it must, and refuses anything expired or
 * already used.
 */

const INVITE_TTL_DAYS = 7;

export function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export type TeamMember = {
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  joinedAt: Date;
};

export async function listMembers(orgId: string): Promise<TeamMember[]> {
  return withTenant(orgId, async (tx) => {
    const rows = await tx
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        role: memberships.role,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, orgId));

    // owner → consultant → client, then alphabetical.
    const rank = { owner: 0, consultant: 1, client: 2 } as const;
    return rows.sort(
      (a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name),
    );
  });
}

export async function listPendingInvites(orgId: string) {
  return withTenant(orgId, (tx) =>
    tx
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.orgId, orgId),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      ),
  );
}

export class TeamError extends Error {}

export async function inviteToOrg(
  orgId: string,
  invitedBy: string,
  email: string,
  role: MemberRole,
): Promise<string> {
  const normalised = email.trim().toLowerCase();

  // Already a member? Say so rather than sending an invitation that would do
  // nothing when accepted.
  const existing = await withTenant(orgId, (tx) =>
    tx
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.orgId, orgId), eq(users.email, normalised))),
  );
  if (existing.length > 0) {
    throw new TeamError(`${normalised} is already in this workspace.`);
  }

  const token = newInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 864e5);

  await withTenant(orgId, async (tx) => {
    // Re-inviting replaces the outstanding invitation rather than failing, so a
    // mistyped role or a lost link is fixed by inviting again.
    await tx
      .delete(invitations)
      .where(
        and(eq(invitations.orgId, orgId), eq(invitations.email, normalised)),
      );
    await tx.insert(invitations).values({
      orgId,
      email: normalised,
      role,
      token,
      invitedBy,
      expiresAt,
    });
  });

  return token;
}

export async function revokeInvite(orgId: string, id: string): Promise<void> {
  await withTenant(orgId, (tx) =>
    tx
      .delete(invitations)
      .where(and(eq(invitations.orgId, orgId), eq(invitations.id, id))),
  );
}

export type PendingInvite = {
  orgId: string;
  orgName: string;
  email: string;
  role: MemberRole;
  invitationId: string;
};

/**
 * Resolves an invitation token. Privileged by necessity — this is what tells us
 * which organization the caller is joining — and deliberately narrow: expired
 * and already-accepted invitations resolve to nothing.
 */
export async function resolveInvite(
  token: string,
): Promise<PendingInvite | null> {
  if (!token || token.length < 12) return null;

  const [row] = await getDb()
    .select({
      invitationId: invitations.id,
      orgId: invitations.orgId,
      orgName: organizations.name,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
    })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.orgId))
    .where(eq(invitations.token, token))
    .limit(1);

  if (!row || row.acceptedAt || row.expiresAt < new Date()) return null;
  return {
    orgId: row.orgId,
    orgName: row.orgName,
    email: row.email,
    role: row.role,
    invitationId: row.invitationId,
  };
}

/**
 * Accepts an invitation, creating the account if this is a new person.
 *
 * The email is taken from the invitation, never from the form — otherwise
 * anyone holding a link could claim any address they liked.
 */
export async function acceptInvite(
  token: string,
  name: string,
  password: string,
): Promise<{ userId: string; orgId: string; role: MemberRole } | null> {
  const invite = await resolveInvite(token);
  if (!invite) return null;

  const db = getDb();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, invite.email));

  const userId =
    existing?.id ??
    (
      await db
        .insert(users)
        .values({
          email: invite.email,
          name: name.trim() || invite.email,
          passwordHash: await hashPassword(password),
        })
        .returning()
    )[0]!.id;

  await withTenant(invite.orgId, async (tx) => {
    await tx.insert(memberships).values({
      orgId: invite.orgId,
      userId,
      role: invite.role,
    });
    await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, invite.invitationId));
  });

  return { userId, orgId: invite.orgId, role: invite.role };
}

export async function changeRole(
  orgId: string,
  userId: string,
  role: MemberRole,
): Promise<void> {
  const members = await listMembers(orgId);
  const owners = members.filter((m) => m.role === "owner");

  // Removing the last owner would leave the workspace with nobody able to
  // manage it, and no way back in.
  if (owners.length === 1 && owners[0]!.userId === userId && role !== "owner") {
    throw new TeamError(
      "This is the only owner. Make somebody else an owner first.",
    );
  }

  await withTenant(orgId, (tx) =>
    tx
      .update(memberships)
      .set({ role })
      .where(
        and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)),
      ),
  );
}

export async function removeMember(
  orgId: string,
  userId: string,
): Promise<void> {
  const members = await listMembers(orgId);
  const owners = members.filter((m) => m.role === "owner");
  if (owners.length === 1 && owners[0]!.userId === userId) {
    throw new TeamError("This is the only owner and cannot be removed.");
  }

  await withTenant(orgId, (tx) =>
    tx
      .delete(memberships)
      .where(
        and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)),
      ),
  );
}

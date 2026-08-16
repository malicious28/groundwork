import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { withTenant } from "@/db/tenant";
import { projects } from "@/db/schema";

/**
 * Share links.
 *
 * Nova's constraint was explicit: clients will not install an app, and the link
 * has to keep working if it is forwarded to someone else — a spouse, an adult
 * child handling things for a parent. So a share link carries its own bearer
 * token and needs no account.
 *
 * That creates the one place in this codebase where a read happens outside a
 * tenant scope, because resolving the token is what *establishes* the tenant.
 * It is deliberately confined to the single function below: the token is
 * exchanged for an org id, and every subsequent read re-enters withTenant with
 * it. Nothing else in the request path is privileged.
 */

/** 32 bytes of randomness, URL-safe. Guessing one is not a realistic attack. */
export function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}

export type ResolvedShare = { orgId: string; projectId: string };

export async function resolveShareToken(
  token: string,
): Promise<ResolvedShare | null> {
  if (!token || token.length < 12) return null;

  // Privileged read, by necessity — see the note above. It selects two ids and
  // nothing else, so even a bug here leaks no customer content.
  const [row] = await getDb()
    .select({ orgId: projects.orgId, id: projects.id })
    .from(projects)
    .where(eq(projects.shareToken, token))
    .limit(1);

  return row ? { orgId: row.orgId, projectId: row.id } : null;
}

/**
 * Issues a link, or rotates it. Rotation is the revoke button: the old token
 * stops resolving the moment a new one is written, which is what a consultant
 * needs when a link has gone somewhere it should not have.
 */
export async function issueShareToken(
  orgId: string,
  projectId: string,
): Promise<string> {
  const token = newShareToken();

  await withTenant(orgId, (tx) =>
    tx
      .update(projects)
      .set({ shareToken: token })
      .where(and(eq(projects.orgId, orgId), eq(projects.id, projectId))),
  );

  return token;
}

export async function revokeShareToken(
  orgId: string,
  projectId: string,
): Promise<void> {
  await withTenant(orgId, (tx) =>
    tx
      .update(projects)
      .set({ shareToken: null })
      .where(and(eq(projects.orgId, orgId), eq(projects.id, projectId))),
  );
}

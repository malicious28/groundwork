import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { memberships, organizations, users } from "@/db/schema";
import type { MemberRole } from "@/db/schema";
import { atLeast, type TenantContext } from "@/db/tenant";
import {
  SESSION_COOKIE,
  signSession,
  verifySession,
  type SessionClaims,
} from "./jwt";

/**
 * Reading and enforcing the session on the server.
 *
 * Middleware gates whole route trees cheaply, but it is a convenience layer and
 * not a security boundary — it never touches the database and it can be skipped
 * by any code path that does not match its matcher. Everything that reads or
 * writes tenant data calls `requireSession` here as well.
 *
 * A signed token is evidence of who signed in, not of what they may still do.
 * The membership behind it is therefore re-read on every request rather than
 * trusted for the token's lifetime, and the role that comes back is the live
 * one. Without that, removing somebody from a workspace or demoting an owner
 * did nothing until their token expired — up to eight hours of access after the
 * moment they were removed. The cost is one indexed lookup per request, de-
 * duplicated by React's cache, which is a great deal cheaper than being wrong
 * about it.
 */

const EIGHT_HOURS = 60 * 60 * 8;

export async function createSessionCookie(claims: SessionClaims) {
  const token = await signSession(claims);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: EIGHT_HOURS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * The session as it stands right now: the token verified, and the membership
 * behind it confirmed to still exist.
 *
 * De-duplicated per request by React's cache, so a page that checks the session
 * in three components does one lookup. Returns null for a token whose signature
 * is bad, whose membership has been revoked, or whose organization no longer
 * exists — all three mean the same thing to a caller, which is that this
 * request has no session.
 */
export const getSession = cache(async (): Promise<SessionClaims | null> => {
  const store = await cookies();
  const token = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!token) return null;

  // Scoped to the organization in the token: somebody who belongs to two
  // workspaces must stay in the one they signed into, not be silently moved.
  const live = await claimsForUser(token.userId, token.orgId);
  if (!live) return null;

  // The live row wins over the token on every field it covers, so a rename or
  // a change of role takes effect on the next request rather than the next
  // sign-in.
  return live;
});

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * For route handlers: throws rather than redirects, so the handler can map it
 * to a status code.
 */
export async function requireSession(
  minimumRole: MemberRole = "client",
): Promise<TenantContext & { email: string; name: string; orgSlug: string }> {
  const session = await getSession();
  if (!session) throw new AuthError("Sign in to continue.", 401);

  if (!atLeast(session.role, minimumRole)) {
    throw new AuthError(
      `This action needs the ${minimumRole} role; you have ${session.role}.`,
      403,
    );
  }

  return {
    orgId: session.orgId,
    userId: session.userId,
    role: session.role,
    email: session.email,
    name: session.name,
    orgSlug: session.orgSlug,
  };
}

/**
 * For pages: sends somebody to the right place instead of throwing.
 *
 * A page that throws here renders an error screen, which is the wrong answer to
 * every case it covers. A revoked or stale session is indistinguishable from
 * not being signed in, so it goes to the sign-in screen; a client who reaches a
 * consultant page goes to the surface they do have, which is what middleware
 * already does for the routes it covers.
 */
export async function requireSessionPage(
  minimumRole: MemberRole = "client",
): Promise<TenantContext & { email: string; name: string; orgSlug: string }> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!atLeast(session.role, minimumRole)) redirect("/shared");

  return {
    orgId: session.orgId,
    userId: session.userId,
    role: session.role,
    email: session.email,
    name: session.name,
    orgSlug: session.orgSlug,
  };
}

/**
 * Builds the claims for a user's active organization. Membership is looked up
 * rather than trusted from input, so the org id inside a token is always one
 * this user genuinely belongs to.
 */
export async function claimsForUser(
  userId: string,
  preferredOrgId?: string,
): Promise<SessionClaims | null> {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      orgId: organizations.id,
      orgSlug: organizations.slug,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(
      preferredOrgId
        ? and(
            eq(memberships.userId, userId),
            eq(memberships.orgId, preferredOrgId),
          )
        : eq(memberships.userId, userId),
    );

  return rows[0] ?? null;
}

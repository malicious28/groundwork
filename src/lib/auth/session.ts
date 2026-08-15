import { cookies } from "next/headers";
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
 * De-duplicated per request by React's cache, so a page that checks the session
 * in three components still verifies the token once.
 */
export const getSession = cache(async (): Promise<SessionClaims | null> => {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
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

/** Throws rather than redirects, so route handlers can map it to a status. */
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

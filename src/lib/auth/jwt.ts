import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { MemberRole } from "@/db/schema";

/**
 * Session tokens.
 *
 * `jose` rather than `jsonwebtoken` because it is built on Web Crypto, so the
 * same verification code runs in middleware on the edge and in route handlers
 * on Node. `jsonwebtoken` depends on Node's crypto module and cannot.
 */

export const SESSION_COOKIE = "gw_session";
const ISSUER = "groundwork";
const AUDIENCE = "groundwork:app";
const TTL = "8h";

export type SessionClaims = {
  userId: string;
  email: string;
  name: string;
  /** The organization this session is acting in. */
  orgId: string;
  orgSlug: string;
  role: MemberRole;
};

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 24) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Copy .env.example to .env and set it — " +
        'generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }
  return new TextEncoder().encode(value);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims } satisfies JWTPayload & SessionClaims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secret());
}

/** Returns null for anything malformed, expired or wrongly signed. */
export async function verifySession(
  token: string | undefined,
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const { userId, email, name, orgId, orgSlug, role } =
      payload as Partial<SessionClaims>;
    if (!userId || !email || !name || !orgId || !orgSlug || !role) return null;

    return { userId, email, name, orgId, orgSlug, role };
  } catch {
    return null;
  }
}

import bcrypt from "bcryptjs";

/**
 * bcryptjs rather than native bcrypt: it is pure JavaScript, so it installs
 * without a build toolchain and runs unchanged on Vercel's Node runtime.
 *
 * Hashing only ever happens in route handlers on the Node runtime. Middleware
 * verifies a signed token instead, because bcrypt cannot run on the edge.
 */

const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

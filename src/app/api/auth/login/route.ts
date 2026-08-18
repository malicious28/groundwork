import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { claimsForUser, createSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

const LoginInput = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = LoginInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter an email address and a password." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase().trim();
  const [user] = await db.select().from(users).where(eq(users.email, email));

  // One message for both "no such user" and "wrong password", so the response
  // cannot be used to work out which addresses are registered.
  const invalid = NextResponse.json(
    { error: "That email and password combination doesn't match an account." },
    { status: 401 },
  );

  if (!user) {
    // Still spend the time a real comparison would, so response timing does not
    // give away whether the account exists.
    await verifyPassword(parsed.data.password, PLACEHOLDER_HASH);
    return invalid;
  }

  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return invalid;
  }

  const claims = await claimsForUser(user.id);
  if (!claims) {
    return NextResponse.json(
      { error: "This account isn't a member of any workspace yet." },
      { status: 403 },
    );
  }

  await createSessionCookie(claims);
  return NextResponse.json({
    ok: true,
    redirectTo: claims.role === "client" ? "/shared" : "/dashboard",
  });
}

/** A real bcrypt hash of a value nobody knows, used only to equalise timing. */
const PLACEHOLDER_HASH =
  "$2b$12$C6UzMDM.H6dfI/f/IKcEe.9Zd5.5H9m3rQxg3nDbGZP5vHnJq3sJK";

import { NextResponse } from "next/server";
import { z } from "zod";
import { createAccount } from "@/lib/signup";
import { claimsForUser, createSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

const SignupInput = z.object({
  email: z.email(),
  name: z.string().min(1).max(120),
  workspace: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  const parsed = SignupInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Fill in every field. The password needs 8 characters." },
      { status: 400 },
    );
  }

  const result = await createAccount(parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const claims = await claimsForUser(result.userId);
  if (!claims) {
    return NextResponse.json(
      { error: "The account was created but the workspace could not be opened." },
      { status: 500 },
    );
  }

  await createSessionCookie(claims);
  // The root routes by role rather than guessing at it here, so this stays
  // correct if the signed-in home ever moves.
  return NextResponse.json({ ok: true, redirectTo: "/" });
}

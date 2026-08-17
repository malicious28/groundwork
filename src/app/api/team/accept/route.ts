import { z } from "zod";
import { acceptInvite } from "@/lib/team";
import { claimsForUser, createSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

const Input = z.object({
  token: z.string().min(12),
  name: z.string().max(120).optional(),
  password: z.string().min(8).max(200),
});

/**
 * Accepting an invitation signs the person straight in. Asking them to accept
 * and then log in separately is a step with no purpose.
 */
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Choose a password of at least 8 characters." },
      { status: 400 },
    );
  }

  const accepted = await acceptInvite(
    parsed.data.token,
    parsed.data.name ?? "",
    parsed.data.password,
  );
  if (!accepted) {
    return Response.json(
      { error: "That invitation has expired or has already been used." },
      { status: 410 },
    );
  }

  const claims = await claimsForUser(accepted.userId, accepted.orgId);
  if (!claims) {
    return Response.json({ error: "Could not sign you in." }, { status: 500 });
  }
  await createSessionCookie(claims);

  return Response.json({
    ok: true,
    redirectTo: claims.role === "client" ? "/shared" : "/projects",
  });
}

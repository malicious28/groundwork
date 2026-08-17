import { z } from "zod";
import { requireSession, AuthError } from "@/lib/auth/session";
import { inviteToOrg, TeamError } from "@/lib/team";

export const runtime = "nodejs";

const Input = z.object({
  email: z.string().email().max(200),
  role: z.enum(["owner", "consultant", "client"]),
});

/** Only owners may invite — a consultant adding owners would defeat the point. */
export async function POST(request: Request) {
  try {
    const session = await requireSession("owner");
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: "Enter a valid email address and role." },
        { status: 400 },
      );
    }

    const token = await inviteToOrg(
      session.orgId,
      session.userId,
      parsed.data.email,
      parsed.data.role,
    );
    return Response.json({ token, path: `/join/${token}` });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof TeamError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

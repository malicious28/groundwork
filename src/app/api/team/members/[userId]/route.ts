import { z } from "zod";
import { requireSession, AuthError } from "@/lib/auth/session";
import { changeRole, removeMember, TeamError } from "@/lib/team";

export const runtime = "nodejs";

const Input = z.object({ role: z.enum(["owner", "consultant", "client"]) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const session = await requireSession("owner");
    const { userId } = await params;
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "Pick a valid role." }, { status: 400 });
    }

    await changeRole(session.orgId, userId, parsed.data.role);
    return Response.json({ ok: true });
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const session = await requireSession("owner");
    const { userId } = await params;
    await removeMember(session.orgId, userId);
    return Response.json({ ok: true });
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

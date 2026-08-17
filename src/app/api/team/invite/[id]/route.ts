import { requireSession, AuthError } from "@/lib/auth/session";
import { revokeInvite } from "@/lib/team";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession("owner");
    const { id } = await params;
    await revokeInvite(session.orgId, id);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

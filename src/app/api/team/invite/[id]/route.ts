import { requireSession, AuthError } from "@/lib/auth/session";
import { isUuid } from "@/lib/ids";
import { revokeInvite } from "@/lib/team";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession("owner");
    const { id } = await params;
    if (!isUuid(id)) {
      return Response.json({ error: "That could not be found." }, { status: 404 });
    }
    await revokeInvite(session.orgId, id);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

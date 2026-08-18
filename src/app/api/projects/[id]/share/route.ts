import { and, eq } from "drizzle-orm";
import { requireSession, AuthError } from "@/lib/auth/session";
import { isUuid } from "@/lib/ids";
import { withTenant } from "@/db/tenant";
import { projects } from "@/db/schema";
import { issueShareToken, revokeShareToken } from "@/lib/share";

export const runtime = "nodejs";

async function authorise(id: string) {
  const session = await requireSession("consultant");
  const [project] = await withTenant(session.orgId, (tx) =>
    tx
      .select({ id: projects.id, shareToken: projects.shareToken })
      .from(projects)
      .where(and(eq(projects.orgId, session.orgId), eq(projects.id, id))),
  );
  return { session, project };
}

/** Issues a link, or rotates an existing one — rotation is the revoke. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return Response.json({ error: "That could not be found." }, { status: 404 });
    }
    const { session, project } = await authorise(id);
    if (!project) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    const token = await issueShareToken(session.orgId, project.id);
    return Response.json({ token, path: `/s/${token}` });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return Response.json({ error: "That could not be found." }, { status: 404 });
    }
    const { session, project } = await authorise(id);
    if (!project) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    await revokeShareToken(session.orgId, project.id);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

import { and, eq } from "drizzle-orm";
import { requireSession, AuthError } from "@/lib/auth/session";
import { withTenant } from "@/db/tenant";
import { sources } from "@/db/schema";

export const runtime = "nodejs";

/**
 * Returns one source's normalised text so the evidence panel can show a
 * citation in place. Scoped to the caller's tenant and to the project in the
 * path, so a source id alone is not enough to read it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> },
) {
  let session;
  try {
    session = await requireSession("client");
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const { id, sourceId } = await params;

  const [source] = await withTenant(session.orgId, (tx) =>
    tx
      .select({
        id: sources.id,
        ref: sources.ref,
        label: sources.label,
        kind: sources.kind,
        filename: sources.filename,
        text: sources.rawText,
        imageData: sources.imageData,
        mimeType: sources.mimeType,
      })
      .from(sources)
      .where(
        and(
          eq(sources.orgId, session.orgId),
          eq(sources.projectId, id),
          eq(sources.id, sourceId),
        ),
      ),
  );

  if (!source) {
    return Response.json({ error: "Source not found." }, { status: 404 });
  }

  return Response.json(source);
}

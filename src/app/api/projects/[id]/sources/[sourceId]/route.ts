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

/**
 * Removing a source.
 *
 * Everything derived from it goes too — its evidence spans by cascade, and any
 * citation that pointed into it. That is deliberate rather than tidy-up: a
 * citation whose source no longer exists would render as unverified, which
 * would read as the model having invented something when in fact a consultant
 * simply withdrew a document.
 *
 * Existing artifacts are left alone. They are a record of what was concluded
 * from the evidence available at the time, and rewriting history to match the
 * present is how a record stops being one. Re-running discovery is what
 * produces a new version without the withdrawn document.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> },
) {
  try {
    const session = await requireSession("consultant");
    const { id, sourceId } = await params;

    const removed = await withTenant(session.orgId, async (tx) => {
      const [row] = await tx
        .delete(sources)
        .where(
          and(
            eq(sources.orgId, session.orgId),
            eq(sources.projectId, id),
            eq(sources.id, sourceId),
          ),
        )
        .returning({ ref: sources.ref });
      return row ?? null;
    });

    if (!removed) {
      return Response.json({ error: "Source not found." }, { status: 404 });
    }
    return Response.json({ ok: true, ref: removed.ref });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

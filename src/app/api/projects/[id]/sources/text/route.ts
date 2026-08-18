import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireSession, AuthError } from "@/lib/auth/session";
import { withTenant } from "@/db/tenant";
import { evidenceSpans, projects, sources } from "@/db/schema";
import { parseText } from "@/lib/parsers/text";
import { refFromFilename } from "@/lib/ingest";

export const runtime = "nodejs";

const Input = z.object({
  title: z.string().trim().min(1).max(120),
  text: z.string().trim().min(20).max(120_000),
});

/**
 * Typed or pasted text as a source.
 *
 * The most common thing a client actually sends is not a file — it is a
 * paragraph in an email, or a few lines describing the problem in their own
 * words. Making them save that to a .txt first is a pointless step, and it is
 * often the single clearest statement of what they want, so it belongs in the
 * evidence ledger like anything else and is quoted and verified identically.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession("consultant");
    const { id } = await params;

    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        {
          error:
            "Give it a short title and at least a couple of sentences — anything shorter is not worth citing.",
        },
        { status: 400 },
      );
    }

    const { title, text } = parsed.data;
    const doc = parseText(`# ${title}\n\n${text}`);

    const result = await withTenant(session.orgId, async (tx) => {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.orgId, session.orgId), eq(projects.id, id)));
      if (!project) return null;

      const existing = await tx
        .select({ ref: sources.ref })
        .from(sources)
        .where(eq(sources.projectId, project.id));
      const ref = refFromFilename(title, new Set(existing.map((r) => r.ref)));

      const [row] = await tx
        .insert(sources)
        .values({
          orgId: session.orgId,
          projectId: project.id,
          ref,
          kind: "note",
          label: title,
          filename: null,
          mimeType: "text/plain",
          byteSize: Buffer.byteLength(text, "utf8"),
          rawText: doc.text,
          parseStatus: "ready",
          spanCount: doc.spans.length,
          meta: { ...doc.meta, notes: ["Written or pasted directly."] },
        })
        .returning();
      if (!row) throw new Error("could not store that note");

      if (doc.spans.length > 0) {
        await tx.insert(evidenceSpans).values(
          doc.spans.map((span) => ({
            orgId: session.orgId,
            projectId: project.id,
            sourceId: row.id,
            idx: span.idx,
            speaker: null,
            tsLabel: span.tsLabel ?? null,
            occurredAt: null,
            text: span.text,
            charStart: span.charStart,
            charEnd: span.charEnd,
          })),
        );
      }

      return { ref, kind: "note", spanCount: doc.spans.length, notes: [] };
    });

    if (!result) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    return Response.json({ sources: [result] });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

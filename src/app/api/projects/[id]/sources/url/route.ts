import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireSession, AuthError } from "@/lib/auth/session";
import { isUuid } from "@/lib/ids";
import { withTenant } from "@/db/tenant";
import { evidenceSpans, projects, sources } from "@/db/schema";
import { fetchPage, PageFetchError } from "@/lib/parsers/webpage";
import { parseText } from "@/lib/parsers/text";
import { refFromFilename } from "@/lib/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

const Input = z.object({ url: z.string().min(4).max(2000) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession("consultant");
    const { id } = await params;
    if (!isUuid(id)) {
      return Response.json({ error: "That could not be found." }, { status: 404 });
    }

    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "Enter a web address." }, { status: 400 });
    }

    const page = await fetchPage(parsed.data.url);
    const doc = parseText(page.text);

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
      const ref = refFromFilename(
        new URL(page.url).hostname.replace(/^www\./, ""),
        new Set(existing.map((row) => row.ref)),
      );

      const [row] = await tx
        .insert(sources)
        .values({
          orgId: session.orgId,
          projectId: project.id,
          ref,
          kind: "webpage",
          label: page.title,
          filename: page.url,
          mimeType: "text/html",
          byteSize: Buffer.byteLength(page.text, "utf8"),
          rawText: doc.text,
          parseStatus: "ready",
          spanCount: doc.spans.length,
          meta: { ...doc.meta, notes: [...(doc.meta.notes ?? []), ...page.notes] },
        })
        .returning();
      if (!row) throw new Error("could not store the page");

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

      return { ref, kind: "webpage", spanCount: doc.spans.length, notes: page.notes };
    });

    if (!result) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    return Response.json({ sources: [result] });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof PageFetchError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}

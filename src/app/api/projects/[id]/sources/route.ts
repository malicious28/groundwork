import { and, eq } from "drizzle-orm";
import { requireSession, AuthError } from "@/lib/auth/session";
import { isUuid } from "@/lib/ids";
import { withTenant } from "@/db/tenant";
import { projects, sources } from "@/db/schema";
import { ingestFile, refFromFilename, type IngestResult } from "@/lib/ingest";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Beyond this a single upload is more likely a mistake than a transcript. */
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireSession("consultant");
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return Response.json({ error: "That could not be found." }, { status: 404 });
  }

  // Throws outright on a body that is not multipart, rather than returning
  // something empty — uncaught, that is a 500 with no body, which tells an
  // uploader nothing about what went wrong.
  const form = await request.formData().catch(() => null);
  if (!form) {
    return Response.json(
      { error: "That upload was not readable. Choose the files again." },
      { status: 400 },
    );
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return Response.json({ error: "Choose at least one file." }, { status: 400 });
  }

  const tooBig = files.find((file) => file.size > MAX_BYTES);
  if (tooBig) {
    return Response.json(
      {
        error: `${tooBig.name} is larger than 25MB. Split it or upload the text export instead.`,
      },
      { status: 413 },
    );
  }

  try {
    const results = await withTenant(session.orgId, async (tx) => {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.orgId, session.orgId), eq(projects.id, id)));
      if (!project) return null;

      const existing = await tx
        .select({ ref: sources.ref })
        .from(sources)
        .where(eq(sources.projectId, project.id));
      const taken = new Set(existing.map((row) => row.ref));

      const ingested: IngestResult[] = [];
      for (const file of files) {
        const ref = refFromFilename(file.name, taken);
        taken.add(ref);
        ingested.push(
          await ingestFile(
            tx,
            { orgId: session.orgId, projectId: project.id },
            {
              name: file.name,
              type: file.type,
              bytes: new Uint8Array(await file.arrayBuffer()),
            },
            ref,
          ),
        );
      }
      return ingested;
    });

    if (!results) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    return Response.json({ sources: results });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? `That file could not be read: ${error.message}`
            : "That file could not be read.",
      },
      { status: 422 },
    );
  }
}

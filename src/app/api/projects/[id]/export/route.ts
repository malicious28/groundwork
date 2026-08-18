import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { isUuid } from "@/lib/ids";
import { withTenant } from "@/db/tenant";
import { projects } from "@/db/schema";
import { loadArtifact } from "@/lib/artifacts";
import type { Brief, Outline, ProcessArtifact } from "@/lib/ai/schemas";
import { buildProposalMarkdown } from "@/lib/export";
import { resolveShareToken } from "@/lib/share";

export const runtime = "nodejs";

/**
 * The proposal as a file the client can keep.
 *
 * Markdown rather than a generated PDF: it opens anywhere, pastes into an email
 * or a proposal template, and survives being edited by a consultant before it
 * goes out — which is what actually happens to these documents. A PDF that
 * cannot be corrected is a worse artefact, not a better one.
 *
 * Reachable two ways, because the client has two ways in. A signed-in member
 * uses their session; somebody holding a share link passes the token, which
 * resolves to exactly the project that link already shows them and nothing
 * else.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return Response.json({ error: "That could not be found." }, { status: 404 });
  }
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const requestedVersion = url.searchParams.get("v");
  const at = requestedVersion ? Number(requestedVersion) : undefined;

  let orgId: string | null = null;

  if (token) {
    const share = await resolveShareToken(token);
    // The token must name this project — holding a link to one project must not
    // become a way to export another.
    if (share && share.projectId === id) orgId = share.orgId;
  } else {
    const session = await getSession();
    if (session) orgId = session.orgId;
  }

  if (!orgId) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const [project] = await withTenant(orgId, (tx) =>
    tx
      .select()
      .from(projects)
      .where(and(eq(projects.orgId, orgId), eq(projects.id, id))),
  );
  if (!project) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const version = Number.isFinite(at) ? at : undefined;
  const [brief, process, outline] = await Promise.all([
    loadArtifact<Brief>(orgId, id, "brief", version),
    loadArtifact<ProcessArtifact>(orgId, id, "process", version),
    loadArtifact<Outline>(orgId, id, "outline", version),
  ]);

  if (!brief) {
    return Response.json(
      { error: "Run discovery before exporting a proposal." },
      { status: 409 },
    );
  }

  const markdown = buildProposalMarkdown({
    projectName: project.name,
    clientName: project.clientName,
    brief: brief.content,
    process: process?.content ?? null,
    outline: outline?.content ?? null,
    grounding: brief.grounding,
    version: brief.version,
    generatedAt: brief.createdAt,
  });

  const slug =
    project.clientName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "proposal";

  return new Response(markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-proposal-v${brief.version}.md"`,
    },
  });
}

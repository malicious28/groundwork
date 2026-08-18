import { notFound } from "next/navigation";
import { requireSessionPage } from "@/lib/auth/session";
import { listArtifactVersions, loadArtifact } from "@/lib/artifacts";
import { ArtifactVersions } from "@/components/artifact-versions";
import type { Prototype } from "@/lib/ai/schemas";
import { EmptyStage } from "@/components/empty-stage";
import { ShareLink } from "@/components/share-link";
import { withTenant } from "@/db/tenant";
import { isUuid } from "@/lib/ids";
import { projects } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export default async function PrototypePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const session = await requireSessionPage("consultant");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { v } = await searchParams;
  const requested = v ? Number(v) : undefined;
  const artifact = await loadArtifact<Prototype>(
    session.orgId,
    id,
    "prototype",
    Number.isFinite(requested) ? requested : undefined,
  );
  const versions = await listArtifactVersions(session.orgId, id, "prototype");

  const [project] = await withTenant(session.orgId, (tx) =>
    tx
      .select({ shareToken: projects.shareToken })
      .from(projects)
      .where(and(eq(projects.orgId, session.orgId), eq(projects.id, id))),
  );

  if (!artifact) return <EmptyStage what="A clickable prototype" />;
  const prototype = artifact.content;

  return (
    <>
      <ArtifactVersions
        basePath={`/projects/${id}/prototype`}
        versions={versions}
        current={artifact.version}
      />
      <h2 className="mb-1 font-serif text-xl font-semibold">Prototype</h2>
      <p className="mb-4 max-w-prose text-sm text-muted">
        Built from the must-have features in the outline, seeded with Nova&apos;s
        own project names, people and terminology. It is a demonstration of the
        idea, not production code.
      </p>

      <ul className="mb-4 flex flex-wrap gap-2">
        {prototype.screens.map((screen) => (
          <li
            key={screen.name}
            title={screen.purpose}
            className="rounded border border-line bg-surface px-2 py-1 font-mono text-[11px] text-ink-2"
          >
            {screen.name}
          </li>
        ))}
      </ul>

      <div className="overflow-hidden rounded border border-line bg-surface">
        {/*
          sandbox="allow-scripts" without allow-same-origin is the load-bearing
          detail. The two together would let the framed document reach out and
          remove its own sandbox; apart, generated JavaScript runs but has no
          access to cookies, storage, or anything else in this origin.
        */}
        <iframe
          title="Generated prototype"
          srcDoc={prototype.html}
          sandbox="allow-scripts"
          className="h-[760px] w-full border-0 bg-white"
        />
      </div>

      <p className="mt-3 mb-6 max-w-prose font-mono text-[11px] text-muted">
        Rendered in a sandboxed frame with no network access and no same-origin
        privileges — the generated code cannot reach this application.
      </p>

      <ShareLink projectId={id} initialToken={project?.shareToken ?? null} />
    </>
  );
}

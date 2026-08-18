import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireSessionPage } from "@/lib/auth/session";
import { withTenant } from "@/db/tenant";
import { projects } from "@/db/schema";
import { loadArtifact } from "@/lib/artifacts";
import type { Brief, ProcessArtifact, Prototype } from "@/lib/ai/schemas";
import { AppHeader } from "@/components/app-header";
import { ClientView } from "@/components/client-view";

/**
 * What a client sees.
 *
 * Deliberately not the whole brief. The conflict radar quotes the client's own
 * people disagreeing with each other, and the assumptions register is a list of
 * things we guessed — both are working notes for the consultant, and putting
 * them in front of a client would be a mistake dressed up as transparency.
 *
 * What is shared: the goal we understood, how their process works today and how
 * we propose it should, and the prototype.
 */
export default async function SharedProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSessionPage("client");
  const { id } = await params;

  const [project] = await withTenant(session.orgId, (tx) =>
    tx
      .select()
      .from(projects)
      .where(and(eq(projects.orgId, session.orgId), eq(projects.id, id))),
  );
  if (!project) notFound();

  const [brief, process, prototype] = await Promise.all([
    loadArtifact<Brief>(session.orgId, id, "brief"),
    loadArtifact<ProcessArtifact>(session.orgId, id, "process"),
    loadArtifact<Prototype>(session.orgId, id, "prototype"),
  ]);

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link
          href="/shared"
          className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase hover:text-accent"
        >
          ← Shared with you
        </Link>

        <div className="mt-3">
          <ClientView
            projectName={project.name}
            brief={brief?.content ?? null}
            process={process?.content ?? null}
            prototype={prototype?.content ?? null}
            downloadHref={`/api/projects/${id}/export`}
          />
        </div>
      </main>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { withTenant } from "@/db/tenant";
import { projects } from "@/db/schema";
import { loadArtifact } from "@/lib/artifacts";
import type { Brief, ProcessArtifact, Prototype } from "@/lib/ai/schemas";
import { AppHeader } from "@/components/app-header";
import { MermaidDiagram } from "@/components/mermaid-diagram";

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
  const session = await requireSession("client");
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

        <h1 className="mt-3 mb-6 font-serif text-3xl font-semibold tracking-tight text-balance">
          {project.name}
        </h1>

        {brief ? (
          <section className="mb-10">
            <p className="max-w-prose font-serif text-xl leading-snug text-balance">
              {brief.content.headline}
            </p>

            <h2 className="mt-8 mb-2 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
              What we understand you want
            </h2>
            <p className="max-w-prose">{brief.content.goal.text}</p>

            <h2 className="mt-8 mb-2 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
              What we heard is not working
            </h2>
            <ul className="flex flex-col gap-3">
              {brief.content.painPoints
                .filter((pain) => pain.severity >= 2)
                .map((pain, i) => (
                  <li
                    key={i}
                    className="rounded border border-line bg-surface p-4"
                  >
                    <p className="font-medium">{pain.title}</p>
                    <p className="mt-1 text-sm text-ink-2">{pain.detail}</p>
                  </li>
                ))}
            </ul>
          </section>
        ) : null}

        {process ? (
          <section className="mb-10">
            <h2 className="mb-3 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
              What we propose changes
            </h2>
            <div className="mb-4">
              <MermaidDiagram
                source={process.content.toBeMermaid}
                title="Proposed process"
              />
            </div>
            <ul className="flex flex-col gap-2">
              {process.content.changes.map((change, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium">{change.change}</span>
                  <span className="text-muted"> — removes {change.removes}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {prototype ? (
          <section>
            <h2 className="mb-3 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
              A first look
            </h2>
            <p className="mb-3 max-w-prose text-sm text-muted">
              Clickable, and built from your own project names and terminology.
              It shows the idea rather than the finished product.
            </p>
            <div className="overflow-hidden rounded border border-line">
              <iframe
                title="Prototype"
                srcDoc={prototype.content.html}
                sandbox="allow-scripts"
                className="h-[700px] w-full border-0 bg-white"
              />
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}

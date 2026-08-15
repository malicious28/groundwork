import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { withTenant } from "@/db/tenant";
import { evidenceSpans, projects, sources } from "@/db/schema";
import { AppHeader } from "@/components/app-header";
import { SourceKindBadge } from "@/components/source-kind-badge";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const session = await requireSession("consultant");
  const { id } = await params;
  const { source: selectedRef } = await searchParams;

  const data = await withTenant(session.orgId, async (tx) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.orgId, session.orgId), eq(projects.id, id)));
    if (!project) return null;

    const sourceRows = await tx
      .select()
      .from(sources)
      .where(eq(sources.projectId, project.id))
      .orderBy(asc(sources.createdAt));

    const selected =
      sourceRows.find((s) => s.ref === selectedRef) ?? sourceRows[0] ?? null;

    const spans = selected
      ? await tx
          .select()
          .from(evidenceSpans)
          .where(eq(evidenceSpans.sourceId, selected.id))
          .orderBy(asc(evidenceSpans.idx))
          .limit(400)
      : [];

    return { project, sourceRows, selected, spans };
  });

  // A project belonging to another tenant is indistinguishable from one that
  // does not exist, which is the correct answer to give.
  if (!data) notFound();
  const { project, sourceRows, selected, spans } = data;

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link
          href="/projects"
          className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted hover:text-accent"
        >
          ← Projects
        </Link>
        <h1 className="mt-3 mb-1 font-serif text-3xl font-semibold tracking-tight text-balance">
          {project.name}
        </h1>
        {project.summary ? (
          <p className="mb-8 max-w-prose text-ink-2">{project.summary}</p>
        ) : null}

        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
          Evidence ledger · {sourceRows.length} sources ·{" "}
          {sourceRows.reduce((total, s) => total + s.spanCount, 0)} addressable
          spans
        </h2>

        <div className="grid gap-6 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          <ul className="flex flex-col gap-2">
            {sourceRows.map((source) => {
              const isSelected = selected?.id === source.id;
              return (
                <li key={source.id}>
                  <Link
                    href={`/projects/${project.id}?source=${source.ref}`}
                    className={`block rounded border p-3 ${
                      isSelected
                        ? "border-accent bg-accent-soft"
                        : "border-line bg-surface hover:border-accent"
                    }`}
                  >
                    <SourceKindBadge kind={source.kind} />
                    <p className="mt-1.5 text-sm font-medium">{source.label}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted tabular-nums">
                      {source.spanCount} {source.meta?.unitLabel ?? "spans"}
                      {source.meta?.participants?.length
                        ? ` · ${source.meta.participants.length} people`
                        : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>

          <section>
            {selected ? (
              <>
                <div className="mb-3 rounded border border-line bg-surface p-4">
                  <p className="font-mono text-[11px] text-muted">
                    {selected.filename}
                  </p>
                  {selected.meta?.participants?.length ? (
                    <p className="mt-2 text-sm text-ink-2">
                      {selected.meta.participants.join(" · ")}
                    </p>
                  ) : null}
                  {selected.meta?.notes?.length ? (
                    <ul className="mt-2 flex flex-col gap-1">
                      {selected.meta.notes.map((note) => (
                        <li key={note} className="text-xs text-muted">
                          {note}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <ol className="flex flex-col divide-y divide-line-soft overflow-hidden rounded border border-line bg-surface">
                  {spans.map((span) => (
                    <li key={span.id} className="grid gap-1 px-4 py-3">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[10px] text-muted tabular-nums">
                          {String(span.idx).padStart(3, "0")}
                        </span>
                        {span.speaker ? (
                          <span className="text-xs font-semibold text-accent">
                            {span.speaker}
                          </span>
                        ) : null}
                        {span.tsLabel ? (
                          <span className="font-mono text-[10px] text-muted">
                            {span.tsLabel}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm whitespace-pre-wrap text-ink-2">
                        {span.text}
                      </p>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="rounded border border-line bg-surface px-4 py-6 text-muted">
                No sources uploaded yet.
              </p>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { withTenant } from "@/db/tenant";
import { evidenceSpans, sources } from "@/db/schema";
import { SourceKindBadge } from "@/components/source-kind-badge";
import { SourceUpload } from "@/components/source-upload";

export default async function SourcesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const session = await requireSession("consultant");
  const { id } = await params;
  const { source: selectedRef } = await searchParams;

  const { sourceRows, selected, spans } = await withTenant(
    session.orgId,
    async (tx) => {
      const sourceRows = await tx
        .select()
        .from(sources)
        .where(eq(sources.projectId, id))
        .orderBy(asc(sources.createdAt));

      const selected =
        sourceRows.find((s) => s.ref === selectedRef) ?? sourceRows[0] ?? null;

      const spans = selected
        ? await tx
            .select()
            .from(evidenceSpans)
            .where(eq(evidenceSpans.sourceId, selected.id))
            .orderBy(asc(evidenceSpans.idx))
            .limit(500)
        : [];

      return { sourceRows, selected, spans };
    },
  );

  const totalSpans = sourceRows.reduce((total, s) => total + s.spanCount, 0);

  return (
    <>
      <h2 className="mb-1 font-serif text-xl font-semibold">Evidence ledger</h2>
      <p className="mb-4 text-sm text-muted">
        {sourceRows.length} sources · {totalSpans} addressable spans. Everything
        the brief claims points back into this.
      </p>

      <SourceUpload projectId={id} />

      <div className="grid gap-6 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <ul className="flex flex-col gap-2">
          {sourceRows.map((source) => {
            const isSelected = selected?.id === source.id;
            return (
              <li key={source.id}>
                <Link
                  href={`/projects/${id}?source=${source.ref}`}
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
    </>
  );
}

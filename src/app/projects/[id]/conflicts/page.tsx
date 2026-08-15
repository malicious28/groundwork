import { and, asc, desc, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { withTenant } from "@/db/tenant";
import { conflicts, conflictSides } from "@/db/schema";
import { CitationChip } from "@/components/evidence/citation-chip";
import { EmptyStage } from "@/components/empty-stage";

const TOPIC_LABELS: Record<string, string> = {
  budget: "Budget",
  scope: "Scope",
  timeline: "Timeline",
  authority: "Authority",
  process: "Process",
  other: "Other",
};

export default async function ConflictsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession("consultant");
  const { id } = await params;

  const rows = await withTenant(session.orgId, async (tx) => {
    const found = await tx
      .select()
      .from(conflicts)
      .where(
        and(eq(conflicts.orgId, session.orgId), eq(conflicts.projectId, id)),
      )
      .orderBy(desc(conflicts.severity));

    return Promise.all(
      found.map(async (conflict) => ({
        conflict,
        sides: await tx
          .select()
          .from(conflictSides)
          .where(eq(conflictSides.conflictId, conflict.id))
          .orderBy(asc(conflictSides.occurredAt)),
      })),
    );
  });

  if (rows.length === 0) {
    return <EmptyStage what="Contradictions between your sources" />;
  }

  return (
    <>
      <h2 className="mb-1 font-serif text-xl font-semibold">Conflict radar</h2>
      <p className="mb-6 max-w-prose text-sm text-muted">
        Places where the sources disagree with each other. Each side is shown
        with the words that were actually used, so you can judge it without
        going back to the recording.
      </p>

      <ul className="flex flex-col gap-5">
        {rows.map(({ conflict, sides }) => (
          <li
            key={conflict.id}
            className="overflow-hidden rounded border border-flag bg-surface"
          >
            <header className="border-b border-line px-5 py-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="rounded border border-flag bg-flag-soft px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-flag uppercase">
                  {TOPIC_LABELS[conflict.topic] ?? conflict.topic}
                </span>
                <span
                  aria-label={`severity ${conflict.severity} of 3`}
                  className="font-mono text-[10px] text-flag"
                >
                  {"●".repeat(conflict.severity)}
                  <span className="text-line">
                    {"●".repeat(3 - conflict.severity)}
                  </span>
                </span>
              </div>
              <p className="mt-2 max-w-prose font-medium">{conflict.summary}</p>
            </header>

            <div className="grid divide-y divide-line-soft md:grid-cols-2 md:divide-x md:divide-y-0">
              {sides.map((side) => (
                <div key={side.id} className="px-5 py-4">
                  <p className="font-mono text-[11px] text-muted">
                    {side.speaker ?? "Unattributed"}
                    {side.occurredAt
                      ? ` · ${side.occurredAt.toISOString().slice(0, 10)}`
                      : ""}
                  </p>
                  <p className="mt-1 text-sm font-medium">{side.stance}</p>
                  <blockquote className="mt-2 border-l-2 border-line pl-3 text-sm text-ink-2 italic">
                    “{side.quote}”
                  </blockquote>
                  <div className="mt-2">
                    {side.sourceId ? (
                      <CitationChip
                        citation={{
                          sourceId: side.sourceId,
                          citedRef: side.citedRef,
                          quote: side.quote,
                          charStart: side.charStart,
                          charEnd: side.charEnd,
                          verified: side.verified,
                          matchKind: side.matchKind,
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {conflict.resolution ? (
              <footer className="border-t border-line bg-surface-2 px-5 py-4">
                <p className="font-mono text-[10px] tracking-[0.1em] text-muted uppercase">
                  Suggested resolution
                </p>
                <p className="mt-1 max-w-prose text-sm text-ink-2">
                  {conflict.resolution}
                </p>
              </footer>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

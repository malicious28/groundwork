import { and, asc, desc, eq } from "drizzle-orm";
import { requireSessionPage } from "@/lib/auth/session";
import { withTenant } from "@/db/tenant";
import { conflicts, conflictSides } from "@/db/schema";
import { CitationChip } from "@/components/evidence/citation-chip";
import { ConflictActions } from "@/components/conflict-actions";
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
  const session = await requireSessionPage("consultant");
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

  const open = rows.filter((row) => row.conflict.status === "open");
  const settled = rows.filter((row) => row.conflict.status !== "open");

  return (
    <>
      <h2 className="mb-1 font-serif text-xl font-semibold">Conflict radar</h2>
      <p className="mb-6 max-w-prose text-sm text-muted">
        Places where the sources disagree with each other, each side shown in the
        words that were actually used. A decision recorded here is carried into
        the next discovery run, so a regenerated brief knows what was settled.
      </p>

      {open.length > 0 ? (
        <>
          <h3 className="mb-3 font-mono text-[11px] tracking-[0.1em] text-flag uppercase">
            Unresolved · {open.length}
          </h3>
          <ul className="mb-10 flex flex-col gap-5">
            {open.map((row) => (
              <ConflictCard key={row.conflict.id} projectId={id} {...row} />
            ))}
          </ul>
        </>
      ) : (
        <p className="mb-10 rounded border border-accent bg-accent-soft px-4 py-3 text-sm text-accent">
          Every contradiction has been decided.
        </p>
      )}

      {settled.length > 0 ? (
        <>
          <h3 className="mb-3 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
            Decided · {settled.length}
          </h3>
          <ul className="flex flex-col gap-5">
            {settled.map((row) => (
              <ConflictCard key={row.conflict.id} projectId={id} {...row} />
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

type Row = Awaited<
  ReturnType<
    typeof withTenant<
      Array<{
        conflict: typeof conflicts.$inferSelect;
        sides: Array<typeof conflictSides.$inferSelect>;
      }>
    >
  >
>[number];

function ConflictCard({
  projectId,
  conflict,
  sides,
}: Row & { projectId: string }) {
  const settled = conflict.status !== "open";

  return (
    <li
      className={`overflow-hidden rounded border bg-surface ${
        settled ? "border-line" : "border-flag"
      }`}
    >
      <header className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase ${
              settled
                ? "border-line text-muted"
                : "border-flag bg-flag-soft text-flag"
            }`}
          >
            {TOPIC_LABELS[conflict.topic] ?? conflict.topic}
          </span>
          <span
            aria-label={`severity ${conflict.severity} of 3`}
            className={`font-mono text-[10px] ${settled ? "text-muted" : "text-flag"}`}
          >
            {"●".repeat(conflict.severity)}
            <span className="text-line">{"●".repeat(3 - conflict.severity)}</span>
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

      {!settled && conflict.resolution ? (
        <div className="border-t border-line bg-surface-2 px-5 py-3">
          <p className="font-mono text-[10px] tracking-[0.1em] text-muted uppercase">
            Suggested
          </p>
          <p className="mt-1 max-w-prose text-sm text-ink-2">
            {conflict.resolution}
          </p>
        </div>
      ) : null}

      <footer className="border-t border-line px-5 py-4">
        <ConflictActions
          projectId={projectId}
          conflictId={conflict.id}
          status={conflict.status}
          resolution={conflict.resolution}
          sides={sides.map((side) => ({
            id: side.id,
            stance: side.stance,
            speaker: side.speaker,
          }))}
        />
      </footer>
    </li>
  );
}

import { isUuid } from "@/lib/ids";
import { notFound } from "next/navigation";
import { requireSessionPage } from "@/lib/auth/session";
import { listArtifactVersions, loadArtifact } from "@/lib/artifacts";
import type { Brief, Outline } from "@/lib/ai/schemas";
import { comparePlans, type ChangeKind } from "@/lib/compare";
import { EmptyStage } from "@/components/empty-stage";
import { ComparePicker } from "@/components/compare-picker";

const STYLE: Record<ChangeKind, string> = {
  added: "border-accent bg-accent-soft text-accent",
  removed: "border-flag bg-flag-soft text-flag",
  reworded: "border-gap bg-gap-soft text-gap",
  unchanged: "border-line text-muted",
};

const LABEL: Record<ChangeKind, string> = {
  added: "New",
  removed: "Dropped",
  reworded: "Reworded",
  unchanged: "Unchanged",
};

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const session = await requireSessionPage("consultant");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { a, b } = await searchParams;

  const versions = await listArtifactVersions(session.orgId, id, "brief");
  if (versions.length < 2) {
    return (
      <EmptyStage what="A comparison between two runs — it needs at least two" />
    );
  }

  // Newest against the one before it by default: the question is almost always
  // "what changed this time?"
  const newer = Number(b) || versions[0]!.version;
  const older = Number(a) || versions[1]!.version;

  const [beforeBrief, afterBrief, beforeOutline, afterOutline] =
    await Promise.all([
      loadArtifact<Brief>(session.orgId, id, "brief", older),
      loadArtifact<Brief>(session.orgId, id, "brief", newer),
      loadArtifact<Outline>(session.orgId, id, "outline", older),
      loadArtifact<Outline>(session.orgId, id, "outline", newer),
    ]);

  const comparison = comparePlans({
    beforeBrief: beforeBrief?.content ?? null,
    afterBrief: afterBrief?.content ?? null,
    beforeOutline: beforeOutline?.content ?? null,
    afterOutline: afterOutline?.content ?? null,
    beforeGrounding: beforeBrief?.grounding ?? null,
    afterGrounding: afterBrief?.grounding ?? null,
  });

  const { delta } = comparison.grounding;

  return (
    <>
      <h2 className="mb-1 font-serif text-xl font-semibold">
        What changed between runs
      </h2>
      <p className="mb-5 max-w-prose text-sm text-muted">
        Matched on what each line says rather than where it sits, because the
        model reorders freely between runs. A near-match is shown as a rewording
        rather than as one thing vanishing and another arriving.
      </p>

      <ComparePicker
        projectId={id}
        versions={versions.map((v) => ({
          version: v.version,
          createdAt: v.createdAt.toISOString(),
          score: v.grounding ? Math.round(v.grounding.score * 100) : null,
        }))}
        older={older}
        newer={newer}
      />

      <div className="mb-8 rounded border border-line bg-surface px-4 py-3">
        <p className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
          Grounding
        </p>
        <p className="mt-1 text-sm">
          v{older}: <strong>{comparison.grounding.before ?? "—"}%</strong> →
          v{newer}: <strong>{comparison.grounding.after ?? "—"}%</strong>
          {delta !== null ? (
            <span
              className={
                delta > 0
                  ? "ml-2 text-accent"
                  : delta < 0
                    ? "ml-2 text-flag"
                    : "ml-2 text-muted"
              }
            >
              {delta > 0 ? `+${delta}` : delta} points
            </span>
          ) : null}
        </p>
        {delta !== null && delta !== 0 ? (
          <p className="mt-1 max-w-prose text-xs text-muted">
            {delta > 0
              ? "The newer run is better evidenced — usually because a decision or an answer resolved something that had been an assumption."
              : "The newer run rests on more assumption than the last. Worth reading the assumptions list before sending anything out."}
          </p>
        ) : null}
      </div>

      {comparison.sections.map((section) => {
        const changed = section.items.filter((i) => i.kind !== "unchanged");
        return (
          <section key={section.section} className="mb-8">
            <h3 className="mb-2 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
              {section.section} · {section.added} new · {section.removed} dropped
              · {section.reworded} reworded · {section.unchanged} unchanged
            </h3>

            {changed.length === 0 ? (
              <p className="rounded border border-line bg-surface px-4 py-3 text-sm text-muted">
                Nothing changed here.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-line-soft overflow-hidden rounded border border-line bg-surface">
                {changed.map((item, i) => (
                  <li key={i} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase ${STYLE[item.kind]}`}
                      >
                        {LABEL[item.kind]}
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        {item.text}
                      </span>
                    </div>
                    {item.previous ? (
                      <p className="mt-1 max-w-prose text-xs text-muted line-through">
                        {item.previous}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}

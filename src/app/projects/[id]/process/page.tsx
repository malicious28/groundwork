import { requireSession } from "@/lib/auth/session";
import { loadArtifact } from "@/lib/artifacts";
import type { ProcessArtifact } from "@/lib/ai/schemas";
import {
  CitationList,
  ConfidenceBadge,
} from "@/components/evidence/citation-chip";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { EmptyStage } from "@/components/empty-stage";

const EFFORT_STYLE: Record<string, string> = {
  low: "border-accent text-accent",
  medium: "border-gap text-gap",
  high: "border-flag text-flag",
};

export default async function ProcessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession("consultant");
  const { id } = await params;
  const artifact = await loadArtifact<ProcessArtifact>(
    session.orgId,
    id,
    "process",
  );

  if (!artifact) return <EmptyStage what="The improved process" />;
  const process = artifact.content;

  return (
    <>
      <h2 className="mb-1 font-serif text-xl font-semibold">
        How it runs today, and how it could run
      </h2>
      <p className="mb-6 max-w-prose text-sm text-muted">
        The current process is drawn from the sources, not imagined. Each
        proposed change names the specific waste it removes.
      </p>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <MermaidDiagram source={process.asIsMermaid} title="Today" />
        <MermaidDiagram source={process.toBeMermaid} title="Proposed" />
      </div>

      <h3 className="mb-3 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
        What changes
      </h3>
      <ul className="flex flex-col gap-3">
        {process.changes.map((change, i) => {
          const evidence = artifact.evidence.get(`changes[${i}]`);
          return (
            <li key={i} className="rounded border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase ${
                    EFFORT_STYLE[change.effort] ?? "border-line text-muted"
                  }`}
                >
                  {change.effort} effort
                </span>
                <ConfidenceBadge tier={evidence?.confidence ?? "inferred"} />
                <CitationList citations={evidence?.citations ?? []} />
              </div>
              <p className="mt-2 max-w-prose font-medium">{change.change}</p>
              <p className="mt-1 max-w-prose text-sm text-ink-2">
                <span className="text-muted">Removes: </span>
                {change.removes}
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}

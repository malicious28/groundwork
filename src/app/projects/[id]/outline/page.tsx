import { requireSession } from "@/lib/auth/session";
import { listArtifactVersions, loadArtifact } from "@/lib/artifacts";
import { ArtifactVersions } from "@/components/artifact-versions";
import type { Outline } from "@/lib/ai/schemas";
import {
  CitationList,
  ConfidenceBadge,
} from "@/components/evidence/citation-chip";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { EmptyStage } from "@/components/empty-stage";

const MOSCOW_ORDER = ["must", "should", "could", "wont"] as const;

const MOSCOW_STYLE: Record<string, string> = {
  must: "border-accent bg-accent-soft text-accent",
  should: "border-gap bg-gap-soft text-gap",
  could: "border-line bg-surface-2 text-muted",
  wont: "border-line bg-surface-2 text-muted",
};

const MOSCOW_LABEL: Record<string, string> = {
  must: "Must",
  should: "Should",
  could: "Could",
  wont: "Won't (this phase)",
};

export default async function OutlinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const session = await requireSession("consultant");
  const { id } = await params;
  const { v } = await searchParams;
  const requested = v ? Number(v) : undefined;
  const artifact = await loadArtifact<Outline>(
    session.orgId,
    id,
    "outline",
    Number.isFinite(requested) ? requested : undefined,
  );

  if (!artifact) return <EmptyStage what="The solution outline" />;
  const versions = await listArtifactVersions(session.orgId, id, "outline");
  const outline = artifact.content;

  return (
    <>
      <ArtifactVersions
        basePath={`/projects/${id}/outline`}
        versions={versions}
        current={artifact.version}
      />
      <h2 className="mb-1 font-serif text-xl font-semibold">Solution outline</h2>
      <p className="mb-6 max-w-prose text-sm text-muted">
        Roles, modules and a prioritised feature list. Every feature shows the
        evidence it rests on — and where the evidence is an assumption rather
        than a requirement, it says so.
      </p>

      <section className="mb-8">
        <h3 className="mb-3 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
          Roles
        </h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {outline.roles.map((role) => (
            <li
              key={role.name}
              className="rounded border border-line bg-surface p-4"
            >
              <p className="font-medium">{role.name}</p>
              <p className="mt-1 text-sm text-ink-2">{role.description}</p>
              <ul className="mt-2 flex flex-col gap-0.5">
                {role.permissions.map((permission) => (
                  <li key={permission} className="text-xs text-muted">
                    · {permission}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <h3 className="mb-3 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
          Modules and screens
        </h3>
        <ul className="grid gap-3 md:grid-cols-3">
          {outline.modules.map((module) => (
            <li
              key={module.name}
              className="rounded border border-line bg-surface p-4"
            >
              <p className="font-medium">{module.name}</p>
              <p className="mt-1 text-sm text-ink-2">{module.purpose}</p>
              <ul className="mt-2 flex flex-wrap gap-1">
                {module.screens.map((screen) => (
                  <li
                    key={screen}
                    className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted"
                  >
                    {screen}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <h3 className="mb-3 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
          Features
        </h3>
        {MOSCOW_ORDER.map((priority) => {
          const features = outline.features
            .map((feature, i) => ({ feature, i }))
            .filter((entry) => entry.feature.moscow === priority);
          if (features.length === 0) return null;

          return (
            <div key={priority} className="mb-4">
              <p
                className={`mb-2 inline-block rounded border px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase ${MOSCOW_STYLE[priority]}`}
              >
                {MOSCOW_LABEL[priority]} · {features.length}
              </p>
              <ul className="flex flex-col divide-y divide-line-soft overflow-hidden rounded border border-line bg-surface">
                {features.map(({ feature, i }) => {
                  const evidence = artifact.evidence.get(`features[${i}]`);
                  return (
                    <li key={i} className="px-4 py-3">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium">{feature.title}</span>
                        <span className="font-mono text-[10px] text-muted">
                          {feature.module}
                        </span>
                        <ConfidenceBadge
                          tier={evidence?.confidence ?? "inferred"}
                        />
                        <CitationList citations={evidence?.citations ?? []} />
                      </div>
                      <p className="mt-1 max-w-prose text-sm text-ink-2">
                        {feature.rationale}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>

      <section>
        <h3 className="mb-3 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
          End-to-end flow
        </h3>
        <MermaidDiagram source={outline.flowMermaid} title="Main flow" />
      </section>
    </>
  );
}

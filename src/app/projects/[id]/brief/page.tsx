import { requireSessionPage } from "@/lib/auth/session";
import { listArtifactVersions, loadArtifact } from "@/lib/artifacts";
import { ArtifactVersions } from "@/components/artifact-versions";
import type { Brief } from "@/lib/ai/schemas";
import {
  CitationList,
  ConfidenceBadge,
} from "@/components/evidence/citation-chip";
import { EmptyStage } from "@/components/empty-stage";
import { GroundingScore } from "@/components/grounding-score";

export default async function BriefPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const session = await requireSessionPage("consultant");
  const { id } = await params;
  const { v } = await searchParams;
  const requested = v ? Number(v) : undefined;
  const artifact = await loadArtifact<Brief>(
    session.orgId,
    id,
    "brief",
    Number.isFinite(requested) ? requested : undefined,
  );

  if (!artifact) return <EmptyStage what="The discovery brief" />;
  const versions = await listArtifactVersions(session.orgId, id, "brief");

  const brief = artifact.content;
  const at = (path: string) => artifact.evidence.get(path);

  return (
    <article className="flex flex-col gap-8">
      <ArtifactVersions
        basePath={`/projects/${id}/brief`}
        versions={versions}
        current={artifact.version}
      />
      <header>
        <p className="max-w-prose font-serif text-xl leading-snug text-balance">
          {brief.headline}
        </p>
        <div className="mt-4">
          <GroundingScore
            grounding={artifact.grounding}
            usage={artifact.usage}
            version={artifact.version}
          />
        </div>
      </header>

      <Section title="The goal">
        <p className="max-w-prose">
          {brief.goal.text}{" "}
          <ConfidenceBadge tier={at("goal")?.confidence ?? "inferred"} />
          <CitationList citations={at("goal")?.citations ?? []} />
        </p>
      </Section>

      <Section title="Who is involved">
        <ul className="grid gap-3 sm:grid-cols-2">
          {brief.stakeholders.map((person) => (
            <li
              key={person.name}
              className="rounded border border-line bg-surface p-4"
            >
              <p className="font-medium">{person.name}</p>
              <p className="font-mono text-[11px] text-muted">{person.role}</p>
              <p className="mt-2 text-sm text-ink-2">{person.cares}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="How it works today">
        <ol className="flex flex-col divide-y divide-line-soft overflow-hidden rounded border border-line bg-surface">
          {brief.asIsProcess.map((step, i) => (
            <li key={i} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-[10px] text-muted tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-medium">{step.step}</span>
                <ConfidenceBadge
                  tier={at(`asIsProcess[${i}]`)?.confidence ?? "inferred"}
                />
                <CitationList
                  citations={at(`asIsProcess[${i}]`)?.citations ?? []}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                {step.actor} · {step.tools.join(", ")}
              </p>
              {step.friction ? (
                <p className="mt-1.5 text-sm text-flag">{step.friction}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Where it hurts">
        <ul className="flex flex-col gap-3">
          {[...brief.painPoints]
            .map((pain, i) => ({ pain, i }))
            .sort((a, b) => b.pain.severity - a.pain.severity)
            .map(({ pain, i }) => (
              <li
                key={i}
                className="rounded border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span
                    aria-label={`severity ${pain.severity} of 3`}
                    className="font-mono text-[10px] text-flag"
                  >
                    {"●".repeat(pain.severity)}
                    <span className="text-line">
                      {"●".repeat(3 - pain.severity)}
                    </span>
                  </span>
                  <span className="font-medium">{pain.title}</span>
                  <ConfidenceBadge
                    tier={at(`painPoints[${i}]`)?.confidence ?? "inferred"}
                  />
                  <CitationList
                    citations={at(`painPoints[${i}]`)?.citations ?? []}
                  />
                </div>
                <p className="mt-2 max-w-prose text-sm text-ink-2">
                  {pain.detail}
                </p>
                <p className="mt-1 font-mono text-[11px] text-muted">
                  Felt by {pain.whoFeelsIt}
                </p>
              </li>
            ))}
        </ul>
      </Section>

      <Section title="Requirements">
        <ul className="flex flex-col divide-y divide-line-soft overflow-hidden rounded border border-line bg-surface">
          {brief.requirements.map((requirement, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-2 px-4 py-3">
              <span className="font-mono text-[10px] tracking-wide text-muted uppercase">
                {requirement.category.replace(/_/g, " ")}
              </span>
              <span className="min-w-0 flex-1 text-sm">{requirement.text}</span>
              <ConfidenceBadge
                tier={at(`requirements[${i}]`)?.confidence ?? "inferred"}
              />
              <CitationList
                citations={at(`requirements[${i}]`)?.citations ?? []}
              />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Explicitly out of scope">
        <ul className="flex flex-col gap-2">
          {brief.outOfScope.map((item, i) => (
            <li key={i} className="text-sm">
              {item.text}
              <CitationList citations={at(`outOfScope[${i}]`)?.citations ?? []} />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Assumptions">
        <p className="mb-3 max-w-prose text-sm text-muted">
          Nothing here was stated by the client. Each one is a place where the
          brief would change if the answer came back differently.
        </p>
        <ul className="flex flex-col gap-3">
          {brief.assumptions.map((assumption, i) => (
            <li
              key={i}
              className="rounded border border-gap bg-gap-soft p-4 text-sm"
            >
              <p className="font-medium text-ink">{assumption.text}</p>
              <p className="mt-1 text-ink-2">{assumption.why}</p>
            </li>
          ))}
        </ul>
      </Section>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

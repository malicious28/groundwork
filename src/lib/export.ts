import type { GroundingSummary } from "@/db/schema";
import type { Brief, Outline, ProcessArtifact } from "@/lib/ai/schemas";

/**
 * The proposal, written for the client rather than for us.
 *
 * Deliberately not a dump of the brief. The conflict radar quotes their own
 * people disagreeing with each other, and the assumptions register lists what
 * we guessed — those are working notes. What goes out is what we understood,
 * what we saw going wrong, what we propose instead, and what we would build.
 *
 * The one internal thing that *is* included is the grounding score, and that is
 * the point: a client should be able to see that the document was checked
 * against what they actually said, and how much of it rests on assumption.
 */

export type ProposalInput = {
  projectName: string;
  clientName: string;
  brief: Brief;
  process: ProcessArtifact | null;
  outline: Outline | null;
  grounding: GroundingSummary | null;
  version: number;
  generatedAt: Date;
};

const MOSCOW_LABEL: Record<string, string> = {
  must: "Build first",
  should: "Build next",
  could: "Later, if it earns its place",
  wont: "Not in this phase",
};

export function buildProposalMarkdown(input: ProposalInput): string {
  const { brief, process, outline } = input;
  const out: string[] = [];
  const date = input.generatedAt.toISOString().slice(0, 10);

  out.push(`# ${input.projectName}`);
  out.push("");
  out.push(
    `A proposal for ${input.clientName} · ${date} · version ${input.version}`,
  );
  out.push("");
  out.push(brief.headline);
  out.push("");

  out.push("## What we understand you want");
  out.push("");
  out.push(brief.goal.text);
  out.push("");

  if (brief.stakeholders.length) {
    out.push("## Who we spoke to, and what each of you is measured by");
    out.push("");
    for (const person of brief.stakeholders) {
      out.push(`- **${person.name}** (${person.role}) — ${person.cares}`);
    }
    out.push("");
  }

  out.push("## How it works today");
  out.push("");
  for (const [i, step] of brief.asIsProcess.entries()) {
    out.push(
      `${i + 1}. **${step.step}** — ${step.actor}, using ${step.tools.join(", ")}.`,
    );
    if (step.friction) out.push(`   Where it hurts: ${step.friction}`);
  }
  out.push("");

  out.push("## What is not working");
  out.push("");
  for (const pain of [...brief.painPoints].sort(
    (a, b) => b.severity - a.severity,
  )) {
    out.push(`### ${pain.title}`);
    out.push("");
    out.push(pain.detail);
    out.push("");
    out.push(`*Felt by: ${pain.whoFeelsIt}*`);
    out.push("");
  }

  if (process) {
    out.push("## What we propose changes");
    out.push("");
    for (const change of process.changes) {
      out.push(`- **${change.change}**`);
      out.push(`  Removes: ${change.removes} *(${change.effort} effort)*`);
    }
    out.push("");
    out.push("### The proposed process");
    out.push("");
    out.push("```mermaid");
    out.push(process.toBeMermaid);
    out.push("```");
    out.push("");
  }

  if (outline) {
    out.push("## What we would build");
    out.push("");
    for (const role of outline.roles) {
      out.push(`- **${role.name}** — ${role.description}`);
    }
    out.push("");

    for (const priority of ["must", "should", "could", "wont"] as const) {
      const features = outline.features.filter((f) => f.moscow === priority);
      if (!features.length) continue;
      out.push(`### ${MOSCOW_LABEL[priority]}`);
      out.push("");
      for (const feature of features) {
        out.push(
          `- **${feature.title}** (${feature.module}) — ${feature.rationale}`,
        );
      }
      out.push("");
    }
  }

  if (brief.outOfScope.length) {
    out.push("## What we have deliberately left out");
    out.push("");
    for (const item of brief.outOfScope) out.push(`- ${item.text}`);
    out.push("");
  }

  out.push("## How this document was checked");
  out.push("");
  if (input.grounding) {
    const percent = Math.round(input.grounding.score * 100);
    const assumed = input.grounding.byTier.assumed ?? 0;
    out.push(
      `Every statement above was traced back to something you actually said in a call, a message or a document. ` +
        `Of ${input.grounding.claimCount} statements, **${input.grounding.verifiedCount} (${percent}%) were matched word for word** to a source.`,
    );
    out.push("");
    if (assumed > 0) {
      out.push(
        `${assumed} were assumptions on our part rather than anything you told us. They are listed below, because if any of them is wrong the plan changes.`,
      );
      out.push("");
    }
  }

  if (brief.assumptions.length) {
    out.push("### Assumptions we made — please correct any of these");
    out.push("");
    for (const assumption of brief.assumptions) {
      out.push(`- **${assumption.text}**`);
      out.push(`  Why we assumed it: ${assumption.why}`);
    }
    out.push("");
  }

  out.push("---");
  out.push("");
  out.push(
    `Prepared with Groundwork. Generated ${date} from the recordings, messages and documents you shared.`,
  );
  out.push("");

  return out.join("\n");
}

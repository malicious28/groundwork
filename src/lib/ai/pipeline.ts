import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import {
  claims as claimsTable,
  citations as citationsTable,
  conflicts as conflictsTable,
  conflictSides as conflictSidesTable,
  evidenceSpans,
  openQuestions,
  type ConfidenceTier,
  type GroundingSummary,
  type Source,
} from "@/db/schema";
import { findQuote, isVerified, summariseGrounding } from "@/lib/verify";
import type {
  Brief,
  CitationInput,
  Conflicts,
  Outline,
  ProcessArtifact,
  Questions,
} from "./schemas";

/**
 * Verification and persistence.
 *
 * This is where the model stops being trusted. Everything it produced arrives
 * here as a claim plus the quotes it offered as evidence; each quote is looked
 * for in the source it named, and the outcome — found exactly, found after
 * normalisation, found approximately, or not found — is written down next to
 * the claim and shown to the reader.
 */

export type SourceLookup = Map<string, Pick<Source, "id" | "ref" | "rawText">>;

export function indexSources(
  sources: Array<Pick<Source, "id" | "ref" | "rawText">>,
): SourceLookup {
  return new Map(sources.map((source) => [source.ref, source]));
}

export type CollectedClaim = {
  /** Where this sits in the artifact JSON, e.g. `painPoints[2]`. */
  path: string;
  text: string;
  confidence: ConfidenceTier;
  citations: CitationInput[];
};

/* -------------------------------------------------------------------------- */
/* Turning artifacts into claims                                              */
/* -------------------------------------------------------------------------- */

export function collectBriefClaims(brief: Brief): CollectedClaim[] {
  const collected: CollectedClaim[] = [
    {
      path: "goal",
      text: brief.goal.text,
      confidence: brief.goal.confidence,
      citations: brief.goal.citations,
    },
  ];

  brief.asIsProcess.forEach((step, i) =>
    collected.push({
      path: `asIsProcess[${i}]`,
      text: step.step,
      confidence: step.confidence,
      citations: step.citations,
    }),
  );
  brief.painPoints.forEach((pain, i) =>
    collected.push({
      path: `painPoints[${i}]`,
      text: pain.title,
      confidence: pain.confidence,
      citations: pain.citations,
    }),
  );
  brief.requirements.forEach((requirement, i) =>
    collected.push({
      path: `requirements[${i}]`,
      text: requirement.text,
      confidence: requirement.confidence,
      citations: requirement.citations,
    }),
  );
  brief.outOfScope.forEach((item, i) =>
    collected.push({
      path: `outOfScope[${i}]`,
      text: item.text,
      confidence: item.confidence,
      citations: item.citations,
    }),
  );
  // Assumptions are claims too — unevidenced by definition, and counted in the
  // grounding score so that a brief resting on guesswork cannot score well.
  brief.assumptions.forEach((assumption, i) =>
    collected.push({
      path: `assumptions[${i}]`,
      text: assumption.text,
      confidence: "assumed",
      citations: [],
    }),
  );

  return collected;
}

export function collectProcessClaims(process: ProcessArtifact): CollectedClaim[] {
  return process.changes.map((change, i) => ({
    path: `changes[${i}]`,
    text: change.change,
    confidence: change.confidence,
    citations: change.citations,
  }));
}

export function collectOutlineClaims(outline: Outline): CollectedClaim[] {
  return outline.features.map((feature, i) => ({
    path: `features[${i}]`,
    text: feature.title,
    confidence: feature.confidence,
    citations: feature.citations,
  }));
}

/* -------------------------------------------------------------------------- */
/* Verification                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Finds the evidence span a verified quote sits inside, so the UI can jump
 * straight to the right message or turn rather than to a character offset in a
 * wall of text.
 */
async function findContainingSpan(
  tx: Db,
  orgId: string,
  sourceId: string,
  charStart: number,
): Promise<string | null> {
  const rows = await tx
    .select({ id: evidenceSpans.id, charStart: evidenceSpans.charStart, charEnd: evidenceSpans.charEnd })
    .from(evidenceSpans)
    .where(and(eq(evidenceSpans.orgId, orgId), eq(evidenceSpans.sourceId, sourceId)));

  const hit = rows.find(
    (span) => charStart >= span.charStart && charStart < span.charEnd,
  );
  return hit?.id ?? null;
}

export async function persistClaims(
  tx: Db,
  scope: { orgId: string; projectId: string; artifactId: string },
  collected: CollectedClaim[],
  sources: SourceLookup,
): Promise<GroundingSummary> {
  const forSummary: Array<{
    confidence: ConfidenceTier;
    matchKinds: Array<"exact" | "normalized" | "fuzzy" | "none">;
  }> = [];

  for (const claim of collected) {
    const [row] = await tx
      .insert(claimsTable)
      .values({
        orgId: scope.orgId,
        projectId: scope.projectId,
        artifactId: scope.artifactId,
        path: claim.path,
        text: claim.text,
        confidence: claim.confidence,
      })
      .returning();
    if (!row) throw new Error(`failed to persist claim at ${claim.path}`);

    const matchKinds: Array<"exact" | "normalized" | "fuzzy" | "none"> = [];

    for (const citation of claim.citations) {
      const source = sources.get(citation.sourceRef);
      // A citation naming a source that does not exist is itself a finding:
      // it is kept, and rendered unverified, rather than quietly dropped.
      const match = source?.rawText
        ? findQuote(citation.quote, source.rawText)
        : { matchKind: "none" as const, charStart: null, charEnd: null };

      matchKinds.push(match.matchKind);

      const spanId =
        source && match.charStart !== null
          ? await findContainingSpan(tx, scope.orgId, source.id, match.charStart)
          : null;

      await tx.insert(citationsTable).values({
        orgId: scope.orgId,
        claimId: row.id,
        sourceId: source?.id ?? null,
        spanId,
        quote: citation.quote,
        citedRef: citation.sourceRef,
        verified: isVerified(match.matchKind),
        matchKind: match.matchKind,
        charStart: match.charStart,
        charEnd: match.charEnd,
      });
    }

    forSummary.push({ confidence: claim.confidence, matchKinds });
  }

  return summariseGrounding(forSummary) as GroundingSummary;
}

/* -------------------------------------------------------------------------- */
/* Conflicts and questions                                                    */
/* -------------------------------------------------------------------------- */

export async function persistConflicts(
  tx: Db,
  scope: { orgId: string; projectId: string },
  artifact: Conflicts,
  sources: SourceLookup,
): Promise<number> {
  await tx
    .delete(conflictsTable)
    .where(
      and(
        eq(conflictsTable.orgId, scope.orgId),
        eq(conflictsTable.projectId, scope.projectId),
      ),
    );

  for (const conflict of artifact.conflicts) {
    const [row] = await tx
      .insert(conflictsTable)
      .values({
        orgId: scope.orgId,
        projectId: scope.projectId,
        topic: conflict.topic,
        summary: conflict.summary,
        severity: conflict.severity,
        resolution: conflict.suggestedResolution,
      })
      .returning();
    if (!row) continue;

    for (const side of conflict.sides) {
      const source = sources.get(side.sourceRef);
      const match = source?.rawText
        ? findQuote(side.quote, source.rawText)
        : { matchKind: "none" as const, charStart: null, charEnd: null };

      const spanId =
        source && match.charStart !== null
          ? await findContainingSpan(tx, scope.orgId, source.id, match.charStart)
          : null;

      const span = spanId
        ? (
            await tx
              .select({ occurredAt: evidenceSpans.occurredAt })
              .from(evidenceSpans)
              .where(eq(evidenceSpans.id, spanId))
          )[0]
        : undefined;

      await tx.insert(conflictSidesTable).values({
        orgId: scope.orgId,
        conflictId: row.id,
        sourceId: source?.id ?? null,
        spanId,
        citedRef: side.sourceRef,
        quote: side.quote,
        stance: side.stance,
        speaker: side.speaker,
        occurredAt: span?.occurredAt ?? null,
        verified: isVerified(match.matchKind),
        matchKind: match.matchKind,
        charStart: match.charStart,
        charEnd: match.charEnd,
      });
    }
  }

  return artifact.conflicts.length;
}

export async function persistQuestions(
  tx: Db,
  scope: { orgId: string; projectId: string },
  artifact: Questions,
): Promise<number> {
  // Answered questions survive a regeneration; only the open ones are replaced,
  // so re-running the analysis never discards work the consultant has done.
  await tx
    .delete(openQuestions)
    .where(
      and(
        eq(openQuestions.orgId, scope.orgId),
        eq(openQuestions.projectId, scope.projectId),
        eq(openQuestions.status, "open"),
      ),
    );

  if (artifact.questions.length === 0) return 0;

  await tx.insert(openQuestions).values(
    artifact.questions.map((question) => ({
      orgId: scope.orgId,
      projectId: scope.projectId,
      category: question.category,
      question: question.question,
      whyItMatters: question.whyItMatters,
      priority: question.priority,
    })),
  );

  return artifact.questions.length;
}

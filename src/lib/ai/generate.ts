import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { withTenant } from "@/db/tenant";
import {
  artifacts,
  sources as sourcesTable,
  type ArtifactKind,
  type ModelUsage,
} from "@/db/schema";
import type { TenantContext } from "@/db/tenant";
import { generateStructured, GenerationError, hasApiKey } from "./client";
import {
  BRIEF_INSTRUCTION,
  CONFLICTS_INSTRUCTION,
  OUTLINE_INSTRUCTION,
  PROCESS_INSTRUCTION,
  PROTOTYPE_INSTRUCTION,
  QUESTIONS_INSTRUCTION,
  SYSTEM_PROMPT,
  buildCorpus,
} from "./prompts";
import {
  BriefSchema,
  ConflictsSchema,
  OutlineSchema,
  ProcessSchema,
  PrototypeSchema,
  QuestionsSchema,
} from "./schemas";
import {
  RECORDED_BRIEF,
  RECORDED_CONFLICTS,
  RECORDED_OUTLINE,
  RECORDED_PROCESS,
  RECORDED_PROTOTYPE,
  RECORDED_QUESTIONS,
} from "./recorded";
import {
  collectBriefClaims,
  collectOutlineClaims,
  collectProcessClaims,
  indexSources,
  persistClaims,
  persistConflicts,
  persistQuestions,
} from "./pipeline";

/**
 * The discovery run: six model calls over one cached corpus, each verified and
 * persisted before the next begins.
 *
 * Stages are separate calls rather than one large one for three reasons. Each
 * fits comfortably inside a serverless function's budget; a failure in the
 * prototype stage does not cost the brief that already succeeded; and the
 * reader gets to watch the work arrive rather than staring at a spinner for
 * three minutes.
 *
 * Caching is what makes six calls affordable — the system prompt and corpus are
 * identical and byte-stable across all of them, so only the first pays to read
 * the sources.
 */

export const STAGES = [
  "brief",
  "conflicts",
  "questions",
  "process",
  "outline",
  "prototype",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  brief: "Reading the sources and writing the brief",
  conflicts: "Looking for contradictions between sources",
  questions: "Checking what nobody has answered",
  process: "Designing the improved process",
  outline: "Specifying the solution",
  prototype: "Building the prototype",
};

export type ProgressEvent =
  | { type: "stage"; stage: Stage; status: "start" }
  | {
      type: "stage";
      stage: Stage;
      status: "done";
      detail: string;
      usage?: ModelUsage;
    }
  | { type: "stage"; stage: Stage; status: "error"; detail: string }
  | { type: "done"; recorded: boolean }
  | { type: "error"; detail: string };

/** Artifact rows are versioned, never overwritten. */
async function nextVersion(
  tx: Db,
  orgId: string,
  projectId: string,
  kind: ArtifactKind,
): Promise<number> {
  const [latest] = await tx
    .select({ version: artifacts.version })
    .from(artifacts)
    .where(
      and(
        eq(artifacts.orgId, orgId),
        eq(artifacts.projectId, projectId),
        eq(artifacts.kind, kind),
      ),
    )
    .orderBy(desc(artifacts.version))
    .limit(1);

  return (latest?.version ?? 0) + 1;
}

const RECORDED_USAGE: ModelUsage = { model: "recorded" };

export async function runDiscovery(
  ctx: TenantContext,
  projectId: string,
  emit: (event: ProgressEvent) => void,
): Promise<void> {
  const live = hasApiKey();

  const sources = await withTenant(ctx.orgId, (tx) =>
    tx
      .select()
      .from(sourcesTable)
      .where(
        and(
          eq(sourcesTable.orgId, ctx.orgId),
          eq(sourcesTable.projectId, projectId),
          eq(sourcesTable.parseStatus, "ready"),
        ),
      )
      .orderBy(sourcesTable.createdAt),
  );

  if (sources.length === 0) {
    emit({ type: "error", detail: "This project has no readable sources yet." });
    return;
  }

  const corpus = buildCorpus(sources);
  const lookup = indexSources(sources);

  async function stage<T>(
    name: Stage,
    instruction: string,
    schema: Parameters<typeof generateStructured>[0]["schema"],
    recorded: T,
    persist: (tx: Db, output: T, artifactId: string) => Promise<string>,
    maxTokens = 16000,
  ): Promise<void> {
    emit({ type: "stage", stage: name, status: "start" });

    let output: T;
    let usage: ModelUsage;

    if (live) {
      const result = await generateStructured({
        system: SYSTEM_PROMPT,
        corpus,
        instruction,
        schema,
        schemaName: name,
        maxTokens,
      });
      output = result.output as T;
      usage = result.usage;
    } else {
      output = recorded;
      usage = RECORDED_USAGE;
    }

    const detail = await withTenant(ctx.orgId, async (tx) => {
      const version = await nextVersion(tx, ctx.orgId, projectId, name as ArtifactKind);
      const [row] = await tx
        .insert(artifacts)
        .values({
          orgId: ctx.orgId,
          projectId,
          kind: name as ArtifactKind,
          version,
          content: output as object,
          usage,
          createdBy: ctx.userId,
        })
        .returning();
      if (!row) throw new Error(`failed to persist ${name}`);
      return persist(tx, output, row.id);
    });

    emit({ type: "stage", stage: name, status: "done", detail, usage });
  }

  try {
    await stage(
      "brief",
      BRIEF_INSTRUCTION,
      BriefSchema,
      RECORDED_BRIEF,
      async (tx, output, artifactId) => {
        const grounding = await persistClaims(
          tx,
          { orgId: ctx.orgId, projectId, artifactId },
          collectBriefClaims(output),
          lookup,
        );
        await tx
          .update(artifacts)
          .set({ grounding })
          .where(eq(artifacts.id, artifactId));

        const percent = Math.round(grounding.score * 100);
        return `${grounding.verifiedCount} of ${grounding.claimCount} claims verified against source (${percent}%)`;
      },
    );

    await stage(
      "conflicts",
      CONFLICTS_INSTRUCTION,
      ConflictsSchema,
      RECORDED_CONFLICTS,
      async (tx, output) => {
        const count = await persistConflicts(
          tx,
          { orgId: ctx.orgId, projectId },
          output,
          lookup,
        );
        return count === 0
          ? "No contradictions found"
          : `${count} contradiction${count === 1 ? "" : "s"} found`;
      },
    );

    await stage(
      "questions",
      QUESTIONS_INSTRUCTION,
      QuestionsSchema,
      RECORDED_QUESTIONS,
      async (tx, output) => {
        const count = await persistQuestions(tx, { orgId: ctx.orgId, projectId }, output);
        return `${count} open question${count === 1 ? "" : "s"}`;
      },
    );

    await stage(
      "process",
      PROCESS_INSTRUCTION,
      ProcessSchema,
      RECORDED_PROCESS,
      async (tx, output, artifactId) => {
        const grounding = await persistClaims(
          tx,
          { orgId: ctx.orgId, projectId, artifactId },
          collectProcessClaims(output),
          lookup,
        );
        await tx
          .update(artifacts)
          .set({ grounding })
          .where(eq(artifacts.id, artifactId));
        return `${output.changes.length} changes proposed`;
      },
    );

    await stage(
      "outline",
      OUTLINE_INSTRUCTION,
      OutlineSchema,
      RECORDED_OUTLINE,
      async (tx, output, artifactId) => {
        const grounding = await persistClaims(
          tx,
          { orgId: ctx.orgId, projectId, artifactId },
          collectOutlineClaims(output),
          lookup,
        );
        await tx
          .update(artifacts)
          .set({ grounding })
          .where(eq(artifacts.id, artifactId));

        const musts = output.features.filter((f) => f.moscow === "must").length;
        return `${output.features.length} features, ${musts} must-have`;
      },
    );

    await stage(
      "prototype",
      PROTOTYPE_INSTRUCTION,
      PrototypeSchema,
      RECORDED_PROTOTYPE,
      async (_tx, output) =>
        `${output.screens.length} screens, ${Math.round(output.html.length / 1024)}KB`,
      32000,
    );

    emit({ type: "done", recorded: !live });
  } catch (error) {
    const detail =
      error instanceof GenerationError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Generation failed.";
    emit({ type: "error", detail });
  }
}

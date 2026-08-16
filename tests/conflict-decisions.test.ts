import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { conflicts, organizations, projects, sources } from "../src/db/schema";
import { withTenant } from "../src/db/tenant";
import { indexSources, persistConflicts } from "../src/lib/ai/pipeline";
import { buildCorpus } from "../src/lib/ai/prompts";
import type { Conflicts } from "../src/lib/ai/schemas";

/**
 * Regenerating must never cost the consultant work they have already done.
 *
 * A decision recorded against a contradiction is a phone call to the client and
 * an answer written down. If a second discovery run wiped it, or dutifully
 * re-raised the same argument as unresolved, the feature would be worse than
 * not having it.
 */

let orgId: string;
let projectId: string;
let lookup: Awaited<ReturnType<typeof indexSources>>;

const BUDGET: Conflicts = {
  conflicts: [
    {
      topic: "budget",
      summary: "Budget stated as two lakh and as five lakh.",
      severity: 3,
      sides: [
        {
          stance: "Two lakh",
          speaker: "Rohit",
          sourceRef: "call",
          quote: "we cannot go beyond two lakh for the first phase",
        },
        {
          stance: "Five lakh",
          speaker: "Priya",
          sourceRef: "call",
          quote: "around five lakh is fine if it saves the coordinator time",
        },
      ],
      suggestedResolution: "Confirm with Rohit directly.",
    },
  ],
};

const SECOND_RUN: Conflicts = {
  conflicts: [
    // The same contradiction the model found again, worded identically.
    BUDGET.conflicts[0]!,
    {
      topic: "timeline",
      summary: "Handover date given as April and as May.",
      severity: 2,
      sides: [
        {
          stance: "April",
          speaker: "Rohit",
          sourceRef: "call",
          quote: "we cannot go beyond two lakh for the first phase",
        },
        {
          stance: "May",
          speaker: "Priya",
          sourceRef: "call",
          quote: "around five lakh is fine if it saves the coordinator time",
        },
      ],
      suggestedResolution: "Ask.",
    },
  ],
};

beforeAll(async () => {
  const db = getDb();
  const [org] = await db
    .insert(organizations)
    .values({ name: "Decisions", slug: "decisions" })
    .returning();
  orgId = org!.id;

  await withTenant(orgId, async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({ orgId, name: "P", clientName: "C" })
      .returning();
    projectId = project!.id;

    await tx.insert(sources).values({
      orgId,
      projectId,
      ref: "call",
      kind: "transcript",
      label: "Call",
      rawText:
        "Rohit: we cannot go beyond two lakh for the first phase. " +
        "Priya: around five lakh is fine if it saves the coordinator time.",
      parseStatus: "ready",
    });

    const rows = await tx
      .select({ id: sources.id, ref: sources.ref, rawText: sources.rawText })
      .from(sources)
      .where(eq(sources.projectId, projectId));
    lookup = indexSources(rows);
  });
});

describe("decisions survive regeneration", () => {
  it("records a decision and keeps it when the analysis runs again", async () => {
    await withTenant(orgId, (tx) =>
      persistConflicts(tx, { orgId, projectId }, BUDGET, lookup),
    );

    // The consultant decides it.
    await withTenant(orgId, (tx) =>
      tx
        .update(conflicts)
        .set({
          status: "resolved",
          resolution: "Agreed: five lakh, confirmed with Rohit.",
        })
        .where(and(eq(conflicts.orgId, orgId), eq(conflicts.projectId, projectId))),
    );

    // Second run raises the same contradiction again, plus a new one.
    const inserted = await withTenant(orgId, (tx) =>
      persistConflicts(tx, { orgId, projectId }, SECOND_RUN, lookup),
    );

    const after = await withTenant(orgId, (tx) =>
      tx
        .select()
        .from(conflicts)
        .where(
          and(eq(conflicts.orgId, orgId), eq(conflicts.projectId, projectId)),
        ),
    );

    // Only the genuinely new one was added.
    expect(inserted).toBe(1);
    expect(after).toHaveLength(2);

    const decided = after.find((c) => c.topic === "budget")!;
    expect(decided.status).toBe("resolved");
    expect(decided.resolution).toBe("Agreed: five lakh, confirmed with Rohit.");

    const fresh = after.find((c) => c.topic === "timeline")!;
    expect(fresh.status).toBe("open");
  });
});

describe("decisions reach the next prompt", () => {
  it("puts settled matters in the corpus, marked as more current", () => {
    const corpus = buildCorpus(
      [
        {
          ref: "call",
          kind: "transcript",
          label: "Call",
          rawText: "some transcript text",
          meta: null,
        },
      ],
      [
        {
          topic: "budget",
          summary: "Budget stated as two lakh and as five lakh.",
          resolution: "Agreed: five lakh, confirmed with Rohit.",
        },
      ],
    );

    expect(corpus).toContain("<decisions>");
    expect(corpus).toContain("Agreed: five lakh, confirmed with Rohit.");
    expect(corpus).toContain("do not re-raise it");
  });

  it("omits the block entirely when nothing has been settled", () => {
    const corpus = buildCorpus([
      {
        ref: "call",
        kind: "transcript",
        label: "Call",
        rawText: "some transcript text",
        meta: null,
      },
    ]);
    expect(corpus).not.toContain("<decisions>");
  });
});

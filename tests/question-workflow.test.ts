import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { openQuestions, organizations, projects } from "../src/db/schema";
import { withTenant } from "../src/db/tenant";
import { persistQuestions } from "../src/lib/ai/pipeline";
import type { Questions } from "../src/lib/ai/schemas";

/**
 * The register has to accumulate rather than reset. A question the consultant
 * has sent to the client, or already had answered, must not reappear as a fresh
 * gap the next time the analysis runs — that would make the list untrustworthy
 * exactly as it grew useful.
 */

let orgId: string;
let projectId: string;

const FIRST: Questions = {
  questions: [
    {
      category: "budget",
      question: "Is the first-phase budget two lakh or five?",
      whyItMatters: "Decides whether materials tracking is in scope.",
      priority: 3,
    },
    {
      category: "data_migration",
      question: "Do the twenty live projects need their history migrated?",
      whyItMatters: "Full history is a migration; milestones are an afternoon.",
      priority: 3,
    },
  ],
};

const SECOND: Questions = {
  questions: [
    // Both of the originals again, plus one genuinely new.
    ...FIRST.questions,
    {
      category: "support",
      question: "Who owns the portal day to day once it is live?",
      whyItMatters: "Without an owner it drifts out of date like the sheet did.",
      priority: 2,
    },
  ],
};

beforeAll(async () => {
  const db = getDb();
  const [org] = await db
    .insert(organizations)
    .values({ name: "Questions", slug: "questions" })
    .returning();
  orgId = org!.id;

  await withTenant(orgId, async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({ orgId, name: "P", clientName: "C" })
      .returning();
    projectId = project!.id;
  });
});

describe("the blind-spot register accumulates", () => {
  it("records answers and keeps them when the analysis runs again", async () => {
    const first = await withTenant(orgId, (tx) =>
      persistQuestions(tx, { orgId, projectId }, FIRST),
    );
    expect(first).toBe(2);

    // The consultant asks the client and records what came back.
    await withTenant(orgId, (tx) =>
      tx
        .update(openQuestions)
        .set({
          status: "answered",
          answer: "Five lakh, materials included in phase one.",
          answeredAt: new Date(),
        })
        .where(
          and(
            eq(openQuestions.orgId, orgId),
            eq(openQuestions.category, "budget"),
          ),
        ),
    );

    // Second run raises both originals again, plus one new question.
    const second = await withTenant(orgId, (tx) =>
      persistQuestions(tx, { orgId, projectId }, SECOND),
    );

    const all = await withTenant(orgId, (tx) =>
      tx
        .select()
        .from(openQuestions)
        .where(
          and(
            eq(openQuestions.orgId, orgId),
            eq(openQuestions.projectId, projectId),
          ),
        ),
    );

    // Only the genuinely new one was added; nothing was duplicated.
    expect(second).toBe(1);
    expect(all).toHaveLength(3);

    const budget = all.find((q) => q.category === "budget")!;
    expect(budget.status).toBe("answered");
    expect(budget.answer).toBe("Five lakh, materials included in phase one.");

    const support = all.find((q) => q.category === "support")!;
    expect(support.status).toBe("open");
  });

  it("does not resurrect a question that was set aside", async () => {
    await withTenant(orgId, (tx) =>
      tx
        .update(openQuestions)
        .set({ status: "dismissed" })
        .where(
          and(
            eq(openQuestions.orgId, orgId),
            eq(openQuestions.category, "support"),
          ),
        ),
    );

    const added = await withTenant(orgId, (tx) =>
      persistQuestions(tx, { orgId, projectId }, SECOND),
    );
    expect(added).toBe(0);

    const [support] = await withTenant(orgId, (tx) =>
      tx
        .select()
        .from(openQuestions)
        .where(
          and(
            eq(openQuestions.orgId, orgId),
            eq(openQuestions.category, "support"),
          ),
        ),
    );
    expect(support!.status).toBe("dismissed");
  });
});

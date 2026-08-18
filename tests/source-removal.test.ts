import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "../src/db";
import {
  artifacts,
  citations,
  claims,
  evidenceSpans,
  organizations,
  projects,
  sources,
} from "../src/db/schema";
import { withTenant } from "../src/db/tenant";
import { indexSources, persistClaims } from "../src/lib/ai/pipeline";

/**
 * Withdrawing a document has to take everything derived from it with it.
 *
 * A citation left pointing at a source that no longer exists would render as
 * unverified — which reads as the model having invented something, when in fact
 * a consultant simply removed a file. That is the worst possible way for this
 * product to be wrong, because it undermines the one thing it claims.
 */

let orgId: string;
let projectId: string;
let doomedId: string;
let keptId: string;

beforeAll(async () => {
  const db = getDb();
  const [org] = await db
    .insert(organizations)
    .values({ name: "Removal", slug: "removal" })
    .returning();
  orgId = org!.id;

  await withTenant(orgId, async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({ orgId, name: "P", clientName: "C" })
      .returning();
    projectId = project!.id;

    const inserted = await tx
      .insert(sources)
      .values([
        {
          orgId,
          projectId,
          ref: "doomed",
          kind: "note",
          label: "Doomed",
          rawText: "The founder said the budget is two lakh for phase one.",
          parseStatus: "ready",
          spanCount: 1,
        },
        {
          orgId,
          projectId,
          ref: "kept",
          kind: "note",
          label: "Kept",
          rawText: "Operations said the sheet is nine days out of date.",
          parseStatus: "ready",
          spanCount: 1,
        },
      ])
      .returning();
    doomedId = inserted[0]!.id;
    keptId = inserted[1]!.id;

    await tx.insert(evidenceSpans).values([
      {
        orgId,
        projectId,
        sourceId: doomedId,
        idx: 1,
        text: "The founder said the budget is two lakh for phase one.",
        charStart: 0,
        charEnd: 53,
      },
      {
        orgId,
        projectId,
        sourceId: keptId,
        idx: 1,
        text: "Operations said the sheet is nine days out of date.",
        charStart: 0,
        charEnd: 50,
      },
    ]);

    const [artifact] = await tx
      .insert(artifacts)
      .values({ orgId, projectId, kind: "brief", version: 1, content: {} })
      .returning();

    const rows = await tx
      .select({ id: sources.id, ref: sources.ref, rawText: sources.rawText })
      .from(sources)
      .where(eq(sources.projectId, projectId));

    await persistClaims(
      tx,
      { orgId, projectId, artifactId: artifact!.id },
      [
        {
          path: "requirements[0]",
          text: "Budget is two lakh",
          confidence: "explicit",
          citations: [
            {
              sourceRef: "doomed",
              quote: "the budget is two lakh for phase one",
            },
          ],
        },
        {
          path: "requirements[1]",
          text: "The sheet goes stale",
          confidence: "explicit",
          citations: [
            {
              sourceRef: "kept",
              quote: "the sheet is nine days out of date",
            },
          ],
        },
      ],
      indexSources(rows),
    );
  });
});

describe("removing a source", () => {
  it("starts with both citations verified", async () => {
    const rows = await withTenant(orgId, (tx) =>
      tx.select().from(citations).where(eq(citations.orgId, orgId)),
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((c) => c.verified)).toBe(true);
  });

  it("takes its evidence spans and citations with it", async () => {
    await withTenant(orgId, (tx) =>
      tx
        .delete(sources)
        .where(and(eq(sources.orgId, orgId), eq(sources.id, doomedId))),
    );

    const { remainingSources, spans, cited } = await withTenant(
      orgId,
      async (tx) => ({
        remainingSources: await tx
          .select()
          .from(sources)
          .where(eq(sources.projectId, projectId)),
        spans: await tx
          .select()
          .from(evidenceSpans)
          .where(eq(evidenceSpans.projectId, projectId)),
        cited: await tx.select().from(citations).where(eq(citations.orgId, orgId)),
      }),
    );

    expect(remainingSources.map((s) => s.ref)).toEqual(["kept"]);
    // No dangling span, and no citation left pointing into nothing.
    expect(spans.every((s) => s.sourceId === keptId)).toBe(true);
    expect(cited.every((c) => c.sourceId === keptId)).toBe(true);
  });

  it("leaves the claim itself, because the brief is a record of its time", async () => {
    const rows = await withTenant(orgId, (tx) =>
      tx.select().from(claims).where(eq(claims.projectId, projectId)),
    );
    // Both claims survive; only the withdrawn evidence is gone. Re-running
    // discovery is what produces a version without it.
    expect(rows).toHaveLength(2);
  });
});

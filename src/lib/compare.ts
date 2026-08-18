import type { GroundingSummary } from "@/db/schema";
import type { Brief, Outline } from "@/lib/ai/schemas";

/**
 * Comparing two runs.
 *
 * Switching between versions makes a reader hold the difference in their head.
 * What a consultant actually needs to say is "here is what changed after you
 * answered us" — which means naming what appeared, what dropped away, and what
 * stayed but was reworded.
 *
 * Matching is by normalised text rather than by position, because the model
 * reorders freely between runs. Two items that read the same are the same item
 * even if they moved; a near-match is treated as a rewording rather than as one
 * thing vanishing and an unrelated one arriving, which is what a naive diff
 * would claim and would make the comparison useless.
 */

export type ChangeKind = "added" | "removed" | "reworded" | "unchanged";

export type ItemChange = {
  kind: ChangeKind;
  text: string;
  /** Present for `reworded`: what it used to say. */
  previous?: string;
};

export type SectionDiff = {
  section: string;
  added: number;
  removed: number;
  reworded: number;
  unchanged: number;
  items: ItemChange[];
};

const normalise = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const words = (text: string): Set<string> =>
  new Set(normalise(text).split(" ").filter(Boolean));

/** Jaccard overlap. Above the threshold, two lines are the same point reworded. */
function similarity(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

const REWORD_THRESHOLD = 0.5;

export function diffLists(
  section: string,
  before: string[],
  after: string[],
): SectionDiff {
  const items: ItemChange[] = [];
  const unmatchedBefore = [...before];

  for (const line of after) {
    const exact = unmatchedBefore.findIndex(
      (candidate) => normalise(candidate) === normalise(line),
    );
    if (exact !== -1) {
      unmatchedBefore.splice(exact, 1);
      items.push({ kind: "unchanged", text: line });
      continue;
    }

    let bestIndex = -1;
    let bestScore = 0;
    for (const [i, candidate] of unmatchedBefore.entries()) {
      const score = similarity(candidate, line);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestScore >= REWORD_THRESHOLD && bestIndex !== -1) {
      const [previous] = unmatchedBefore.splice(bestIndex, 1);
      items.push({ kind: "reworded", text: line, previous });
    } else {
      items.push({ kind: "added", text: line });
    }
  }

  for (const orphan of unmatchedBefore) {
    items.push({ kind: "removed", text: orphan });
  }

  const count = (kind: ChangeKind) =>
    items.filter((item) => item.kind === kind).length;

  return {
    section,
    added: count("added"),
    removed: count("removed"),
    reworded: count("reworded"),
    unchanged: count("unchanged"),
    items,
  };
}

export type PlanComparison = {
  sections: SectionDiff[];
  grounding: {
    before: number | null;
    after: number | null;
    /** Percentage points, positive when the newer run is better evidenced. */
    delta: number | null;
  };
};

export function comparePlans(input: {
  beforeBrief: Brief | null;
  afterBrief: Brief | null;
  beforeOutline: Outline | null;
  afterOutline: Outline | null;
  beforeGrounding: GroundingSummary | null;
  afterGrounding: GroundingSummary | null;
}): PlanComparison {
  const sections: SectionDiff[] = [];

  if (input.beforeBrief && input.afterBrief) {
    sections.push(
      diffLists(
        "Pain points",
        input.beforeBrief.painPoints.map((p) => p.title),
        input.afterBrief.painPoints.map((p) => p.title),
      ),
      diffLists(
        "Requirements",
        input.beforeBrief.requirements.map((r) => r.text),
        input.afterBrief.requirements.map((r) => r.text),
      ),
      diffLists(
        "Assumptions",
        input.beforeBrief.assumptions.map((a) => a.text),
        input.afterBrief.assumptions.map((a) => a.text),
      ),
    );
  }

  if (input.beforeOutline && input.afterOutline) {
    sections.push(
      diffLists(
        "Features",
        input.beforeOutline.features.map(
          (f) => `${f.title} — ${f.moscow}`,
        ),
        input.afterOutline.features.map((f) => `${f.title} — ${f.moscow}`),
      ),
    );
  }

  const before = input.beforeGrounding
    ? Math.round(input.beforeGrounding.score * 100)
    : null;
  const after = input.afterGrounding
    ? Math.round(input.afterGrounding.score * 100)
    : null;

  return {
    sections,
    grounding: {
      before,
      after,
      delta: before !== null && after !== null ? after - before : null,
    },
  };
}

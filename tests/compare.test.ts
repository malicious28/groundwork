import { describe, it, expect } from "vitest";
import { diffLists, comparePlans } from "../src/lib/compare";

/**
 * The comparison has one job that a naive diff gets wrong: the model reorders
 * freely between runs, and rewords things it still means. Reporting a reordered
 * line as "dropped and a new one added" would make the whole view untrustworthy
 * — a consultant would stop reading it after the first false alarm.
 */

describe("matching lines between runs", () => {
  it("ignores order", () => {
    const diff = diffLists("Requirements", ["A thing", "B thing"], ["B thing", "A thing"]);
    expect(diff.unchanged).toBe(2);
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
  });

  it("ignores casing and punctuation", () => {
    const diff = diffLists("x", ["Show payment status."], ["show payment status"]);
    expect(diff.unchanged).toBe(1);
  });

  it("reports a genuinely new line as new", () => {
    const diff = diffLists("x", ["Keep this"], ["Keep this", "Track materials per project"]);
    expect(diff.added).toBe(1);
    expect(diff.items.find((i) => i.kind === "added")?.text).toBe(
      "Track materials per project",
    );
  });

  it("reports a withdrawn line as dropped", () => {
    const diff = diffLists("x", ["Keep this", "Drop this"], ["Keep this"]);
    expect(diff.removed).toBe(1);
    expect(diff.items.find((i) => i.kind === "removed")?.text).toBe("Drop this");
  });

  it("recognises a rewording rather than claiming two changes", () => {
    const diff = diffLists(
      "x",
      ["Client can see the current stage and next milestone"],
      ["Client can see the current stage and the next milestone at a glance"],
    );
    expect(diff.reworded).toBe(1);
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
    expect(diff.items[0]!.previous).toContain("next milestone");
  });

  it("does not mistake two different points for a rewording", () => {
    const diff = diffLists(
      "x",
      ["Track material delivery dates per project"],
      ["Send the client a weekly email digest"],
    );
    expect(diff.reworded).toBe(0);
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
  });

  it("handles either side being empty", () => {
    expect(diffLists("x", [], ["New"]).added).toBe(1);
    expect(diffLists("x", ["Old"], []).removed).toBe(1);
    expect(diffLists("x", [], []).items).toEqual([]);
  });
});

describe("comparing two runs", () => {
  it("reports the movement in grounding", () => {
    const result = comparePlans({
      beforeBrief: null,
      afterBrief: null,
      beforeOutline: null,
      afterOutline: null,
      beforeGrounding: { claimCount: 10, verifiedCount: 7, score: 0.7, byTier: {} },
      afterGrounding: { claimCount: 10, verifiedCount: 9, score: 0.9, byTier: {} },
    });
    expect(result.grounding.before).toBe(70);
    expect(result.grounding.after).toBe(90);
    expect(result.grounding.delta).toBe(20);
  });

  it("reports a fall in grounding as negative, not as an improvement", () => {
    const result = comparePlans({
      beforeBrief: null,
      afterBrief: null,
      beforeOutline: null,
      afterOutline: null,
      beforeGrounding: { claimCount: 10, verifiedCount: 9, score: 0.9, byTier: {} },
      afterGrounding: { claimCount: 10, verifiedCount: 6, score: 0.6, byTier: {} },
    });
    expect(result.grounding.delta).toBe(-30);
  });

  it("says nothing about grounding when a run has no score", () => {
    const result = comparePlans({
      beforeBrief: null,
      afterBrief: null,
      beforeOutline: null,
      afterOutline: null,
      beforeGrounding: null,
      afterGrounding: { claimCount: 1, verifiedCount: 1, score: 1, byTier: {} },
    });
    expect(result.grounding.delta).toBeNull();
  });
});

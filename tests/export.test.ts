import { describe, it, expect } from "vitest";
import { buildProposalMarkdown } from "../src/lib/export";
import {
  RECORDED_BRIEF,
  RECORDED_OUTLINE,
  RECORDED_PROCESS,
} from "../src/lib/ai/recorded";

/**
 * The proposal is the one artefact that leaves the building. What it must not
 * contain matters more than what it does: the conflict radar quotes the
 * client's own people disagreeing with each other, and that is a working note,
 * not something to hand them.
 */

const markdown = buildProposalMarkdown({
  projectName: "Nova Interiors — client portal discovery",
  clientName: "Nova Interiors",
  brief: RECORDED_BRIEF,
  process: RECORDED_PROCESS,
  outline: RECORDED_OUTLINE,
  grounding: {
    claimCount: 29,
    verifiedCount: 24,
    score: 24 / 29,
    byTier: { explicit: 22, inferred: 3, assumed: 4 },
  },
  version: 1,
  generatedAt: new Date("2026-08-17T00:00:00Z"),
});

describe("the client proposal", () => {
  it("leads with what was understood, not with our analysis", () => {
    expect(markdown).toContain("# Nova Interiors — client portal discovery");
    expect(markdown).toContain("## What we understand you want");
    expect(markdown).toContain("switchboard");
  });

  it("carries the proposed process and what it removes", () => {
    expect(markdown).toContain("## What we propose changes");
    expect(markdown).toContain("Removes:");
    expect(markdown).toContain("```mermaid");
  });

  it("prioritises what would be built", () => {
    expect(markdown).toContain("Build first");
    expect(markdown).toContain("Later, if it earns its place");
  });

  it("tells the client how much of it was checked", () => {
    expect(markdown).toContain("24 (83%) were matched word for word");
  });

  it("owns its assumptions instead of burying them", () => {
    expect(markdown).toContain("Assumptions we made");
    expect(markdown).toContain("Why we assumed it:");
  });

  it("does not hand the client the internal conflict analysis", () => {
    // Both sides of the budget disagreement, quoted from their own staff.
    expect(markdown).not.toContain("two lakh");
    expect(markdown).not.toContain("Conflict");
    expect(markdown).not.toContain("contradiction");
  });

  it("omits sections that have not been generated yet", () => {
    const briefOnly = buildProposalMarkdown({
      projectName: "P",
      clientName: "C",
      brief: RECORDED_BRIEF,
      process: null,
      outline: null,
      grounding: null,
      version: 1,
      generatedAt: new Date("2026-08-17T00:00:00Z"),
    });
    expect(briefOnly).not.toContain("## What we propose changes");
    expect(briefOnly).not.toContain("## What we would build");
    expect(briefOnly).toContain("## What we understand you want");
  });
});

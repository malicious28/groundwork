import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findQuote, isVerified, summariseGrounding } from "../src/lib/verify";
import { parseVtt } from "../src/lib/parsers/vtt";

const FIXTURES = resolve(process.cwd(), "fixtures/nova-interiors");
const transcript = parseVtt(
  readFileSync(resolve(FIXTURES, "kickoff-call.vtt"), "utf8"),
).text;

/**
 * These tests are the product's honesty guarantee expressed as assertions. The
 * one that matters most is the invented-quote case: if that ever passes, the
 * grounding score stops meaning anything and the whole premise fails quietly.
 */

describe("quote verification", () => {
  it("finds a quote copied exactly", () => {
    const match = findQuote(
      "We can't go beyond two lakh for the first phase",
      transcript,
    );
    expect(match.matchKind).toBe("exact");
    expect(
      transcript.slice(match.charStart!, match.charEnd!),
    ).toBe("We can't go beyond two lakh for the first phase");
  });

  it("forgives a curly apostrophe the model substituted", () => {
    const match = findQuote(
      "We can’t go beyond two lakh for the first phase",
      transcript,
    );
    expect(match.matchKind).toBe("normalized");
    expect(isVerified(match.matchKind)).toBe(true);
    // The offsets must still address the original, curly-free text.
    expect(transcript.slice(match.charStart!, match.charEnd!)).toBe(
      "We can't go beyond two lakh for the first phase",
    );
  });

  it("downgrades to approximate when the model inserts a word", () => {
    // Same sentence with an em dash dropped in. Close enough to locate, not
    // close enough to call verified.
    const match = findQuote(
      "We can’t go beyond two lakh — for the first phase",
      transcript,
    );
    expect(match.matchKind).toBe("fuzzy");
    expect(isVerified(match.matchKind)).toBe(false);
  });

  it("forgives case and collapsed whitespace", () => {
    const match = findQuote(
      "everything   client-facing goes THROUGH me",
      transcript,
    );
    expect(match.matchKind).toBe("normalized");
    expect(
      transcript.slice(match.charStart!, match.charEnd!).toLowerCase(),
    ).toBe("everything client-facing goes through me");
  });

  it("returns offsets that address the real text, not the normalised copy", () => {
    const match = findQuote(
      "IF I STOP BEING THE SWITCHBOARD",
      transcript,
    );
    expect(match.charStart).not.toBeNull();
    expect(transcript.slice(match.charStart!, match.charEnd!)).toBe(
      "If I stop being the switchboard",
    );
  });

  it("matches approximately when a word is dropped, and says so", () => {
    // Real line: "And it's not their fault — they don't know who to ask, so they
    // ask the person whose number they got first"
    const match = findQuote(
      "it's not their fault they don't know who to ask so they ask the person whose number they got first",
      transcript,
    );
    expect(match.matchKind).toBe("fuzzy");
    expect(match.similarity).toBeGreaterThan(0.82);
    // Crucially, fuzzy is not good enough to call a claim verified.
    expect(isVerified(match.matchKind)).toBe(false);
  });

  it("refuses a quote that was never said", () => {
    const match = findQuote(
      "We have already selected a vendor and signed the contract",
      transcript,
    );
    expect(match.matchKind).toBe("none");
    expect(match.charStart).toBeNull();
  });

  it("refuses a plausible-sounding fabrication built from real words", () => {
    // Every word here appears in the transcript; the sentence does not.
    const match = findQuote(
      "The client budget for the first phase is five lakh and the timeline is Diwali",
      transcript,
    );
    expect(match.matchKind).toBe("none");
  });

  it("ignores quotes too short to mean anything", () => {
    expect(findQuote("the sheet", transcript).matchKind).toBe("none");
    expect(findQuote("", transcript).matchKind).toBe("none");
  });

  it("does not match across a source it was not given", () => {
    expect(
      findQuote("We can't go beyond two lakh for the first phase", "unrelated text")
        .matchKind,
    ).toBe("none");
  });
});

describe("grounding summary", () => {
  it("counts a claim as verified when any of its citations verifies", () => {
    const summary = summariseGrounding([
      { confidence: "explicit", matchKinds: ["exact"] },
      { confidence: "explicit", matchKinds: ["none", "normalized"] },
      { confidence: "inferred", matchKinds: ["fuzzy"] },
      { confidence: "assumed", matchKinds: [] },
    ]);

    expect(summary.claimCount).toBe(4);
    expect(summary.verifiedCount).toBe(2);
    expect(summary.score).toBe(0.5);
    expect(summary.byTier).toEqual({ explicit: 2, inferred: 1, assumed: 1 });
  });

  it("reports zero rather than dividing by zero", () => {
    expect(summariseGrounding([]).score).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSource } from "../src/lib/parsers";
import { findQuote, isVerified } from "../src/lib/verify";
import {
  RECORDED_BRIEF,
  RECORDED_CONFLICTS,
  RECORDED_OUTLINE,
  RECORDED_PROCESS,
} from "../src/lib/ai/recorded";
import {
  collectBriefClaims,
  collectOutlineClaims,
  collectProcessClaims,
} from "../src/lib/ai/pipeline";
import type { SourceKind } from "../src/db/schema";

/**
 * The recorded artifacts stand in for a live model when no API key is present.
 * They are only worth anything if their citations are real, so this suite
 * checks every one of them against the actual source text — the same code path
 * that runs on live output.
 *
 * One citation is expected to fail. It was planted so the demo can show the
 * verification layer catching an unsupported claim, and so this suite proves
 * the check can actually fail rather than always passing.
 */

const FIXTURES = resolve(process.cwd(), "fixtures/nova-interiors");

const SOURCES: Array<{ ref: string; kind: SourceKind; file: string }> = [
  { ref: "kickoff-call", kind: "transcript", file: "kickoff-call.vtt" },
  { ref: "followup-call", kind: "transcript", file: "followup-call.vtt" },
  {
    ref: "whatsapp-site-group",
    kind: "whatsapp",
    file: "whatsapp-site-coordination.txt",
  },
  { ref: "handover-sop", kind: "docx", file: "project-handover-sop.md" },
];

const textByRef = new Map(
  SOURCES.map((source) => [
    source.ref,
    parseSource(readFileSync(resolve(FIXTURES, source.file), "utf8"), source.kind)
      .text,
  ]),
);

const PLANTED_UNVERIFIABLE = "Our accountant uses Tally";

type Checked = {
  where: string;
  ref: string;
  quote: string;
  matchKind: string;
};

function checkAll(
  entries: Array<{ where: string; citations: Array<{ sourceRef: string; quote: string }> }>,
): Checked[] {
  const results: Checked[] = [];
  for (const entry of entries) {
    for (const citation of entry.citations) {
      const sourceText = textByRef.get(citation.sourceRef);
      const match = sourceText
        ? findQuote(citation.quote, sourceText)
        : { matchKind: "none" as const };
      results.push({
        where: entry.where,
        ref: citation.sourceRef,
        quote: citation.quote,
        matchKind: match.matchKind,
      });
    }
  }
  return results;
}

describe("recorded artifacts cite real evidence", () => {
  it("every source ref resolves to a source that exists", () => {
    const refs = new Set<string>();
    for (const claim of collectBriefClaims(RECORDED_BRIEF)) {
      claim.citations.forEach((c) => refs.add(c.sourceRef));
    }
    for (const conflict of RECORDED_CONFLICTS.conflicts) {
      conflict.sides.forEach((s) => refs.add(s.sourceRef));
    }
    for (const ref of refs) {
      expect(textByRef.has(ref), `unknown source ref: ${ref}`).toBe(true);
    }
  });

  it("verifies every brief citation except the planted one", () => {
    const results = checkAll(
      collectBriefClaims(RECORDED_BRIEF).map((claim) => ({
        where: claim.path,
        citations: claim.citations,
      })),
    );

    const failures = results.filter((r) => !isVerified(r.matchKind as never));
    const unexpected = failures.filter(
      (r) => !r.quote.startsWith(PLANTED_UNVERIFIABLE),
    );

    expect(
      unexpected,
      `unverified citations:\n${unexpected
        .map((f) => `  ${f.where} (${f.ref}) [${f.matchKind}] ${f.quote}`)
        .join("\n")}`,
    ).toEqual([]);

    // And the planted one must genuinely fail, or the check proves nothing.
    expect(failures.some((f) => f.quote.startsWith(PLANTED_UNVERIFIABLE))).toBe(
      true,
    );
  });

  it("verifies every conflict side", () => {
    const results = checkAll(
      RECORDED_CONFLICTS.conflicts.map((conflict, i) => ({
        where: `conflicts[${i}]`,
        citations: conflict.sides,
      })),
    );
    const failures = results.filter((r) => !isVerified(r.matchKind as never));
    expect(
      failures,
      `unverified conflict sides:\n${failures
        .map((f) => `  ${f.where} (${f.ref}) [${f.matchKind}] ${f.quote}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("verifies every process-change citation", () => {
    const results = checkAll(
      collectProcessClaims(RECORDED_PROCESS).map((claim) => ({
        where: claim.path,
        citations: claim.citations,
      })),
    );
    const failures = results.filter((r) => !isVerified(r.matchKind as never));
    expect(
      failures,
      `unverified:\n${failures.map((f) => `  ${f.where} ${f.quote}`).join("\n")}`,
    ).toEqual([]);
  });

  it("verifies every outline feature citation", () => {
    const results = checkAll(
      collectOutlineClaims(RECORDED_OUTLINE).map((claim) => ({
        where: claim.path,
        citations: claim.citations,
      })),
    );
    const failures = results.filter((r) => !isVerified(r.matchKind as never));
    expect(
      failures,
      `unverified:\n${failures.map((f) => `  ${f.where} ${f.quote}`).join("\n")}`,
    ).toEqual([]);
  });

  it("marks every unevidenced item as assumed rather than claiming it", () => {
    for (const claim of collectBriefClaims(RECORDED_BRIEF)) {
      if (claim.citations.length === 0) {
        expect(claim.confidence, `${claim.path} has no citations`).toBe("assumed");
      }
    }
  });
});

describe("recorded diagrams are well formed", () => {
  const diagrams = [
    ["asIs", RECORDED_PROCESS.asIsMermaid],
    ["toBe", RECORDED_PROCESS.toBeMermaid],
    ["flow", RECORDED_OUTLINE.flowMermaid],
  ] as const;

  it.each(diagrams)("%s declares a flowchart", (_name, source) => {
    expect(source.trimStart()).toMatch(/^flowchart (TD|LR)/);
  });

  it.each(diagrams)("%s quotes every node label", (_name, source) => {
    // An unquoted label containing a comma, bracket or apostrophe is the most
    // common way LLM-written Mermaid fails to parse.
    const unquoted = source.match(/\[[^"\]][^\]]*\]/g) ?? [];
    expect(unquoted).toEqual([]);
  });

  it.each(diagrams)("%s avoids the reserved id `end`", (_name, source) => {
    expect(source).not.toMatch(/\b(^|\s)end\s*[[({]/m);
  });
});

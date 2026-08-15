import type { MatchKind } from "@/db/schema";

/**
 * Quote verification — the mechanism the whole product rests on.
 *
 * The model is required to return a verbatim quote alongside every claim. This
 * module checks that the quote genuinely occurs in the source it was attributed
 * to, and returns where. A claim whose quote cannot be found is not rendered as
 * fact; it is shown to the reader as unverified.
 *
 * Three passes, deliberately ordered from strict to forgiving, because the
 * useful signal is not just yes/no but *how* it matched:
 *
 *   exact       byte-for-byte. What a well-behaved model produces.
 *   normalized  matches once curly quotes, dashes, case and runs of whitespace
 *               are unified. Models routinely straighten a quote while copying
 *               it, and rejecting that would flag honest citations as invented.
 *   fuzzy       matches a run of words closely enough to be the same sentence.
 *               Surfaced to the reader as approximate, never as verified.
 *
 * Anything else is `none`, and none is the answer that matters: it is the only
 * evidence a reader gets that the model asserted something it could not support.
 */

export type QuoteMatch = {
  matchKind: MatchKind;
  charStart: number | null;
  charEnd: number | null;
  /** 0–1, only meaningful for a fuzzy match. */
  similarity?: number;
};

const NOT_FOUND: QuoteMatch = {
  matchKind: "none",
  charStart: null,
  charEnd: null,
};

/** Below this, a run of words is a different sentence rather than a sloppy copy. */
const FUZZY_THRESHOLD = 0.82;

/** Quotes shorter than this match too easily to mean anything. */
const MIN_QUOTE_CHARS = 12;

const CHARACTER_FOLDS: Array<[RegExp, string]> = [
  [/[\u2018\u2019\u201A\u201B\u2032]/g, "'"], // curly single quotes, prime
  [/[\u201C\u201D\u201E\u201F\u2033]/g, '"'], // curly double quotes
  [/[\u2010-\u2015\u2212]/g, "-"], // hyphens, dashes, minus sign
  [/\u2026/g, "..."], // ellipsis
  [/[\u200B-\u200D\u2060\uFEFF]/g, ""], // zero-width and BOM
  [/\u00A0/g, " "], // non-breaking space
];

function fold(text: string): string {
  let out = text;
  for (const [pattern, replacement] of CHARACTER_FOLDS) {
    out = out.replace(pattern, replacement);
  }
  return out.toLowerCase();
}

/**
 * Indices of Markdown structure that opens a line — blockquote markers, bullet
 * dashes, heading hashes — which are treated as whitespace when matching.
 *
 * This is not cosmetic. A process document hard-wraps its prose, so a single
 * sentence inside a blockquote is stored as "…has left the\n> group or a
 * supervisor…". A model quoting that sentence faithfully writes it as one line
 * with no marker, and without this the honest citation would be downgraded to
 * approximate purely because of how the file happens to wrap.
 */
function markdownLinePrefixes(text: string): Set<number> {
  const skip = new Set<number>();
  const line = /^[ \t]*(?:>[ \t]*)*(?:[-*+][ \t]+|#{1,6}[ \t]+)?/gm;

  let match: RegExpExecArray | null;
  while ((match = line.exec(text)) !== null) {
    for (let i = match.index; i < match.index + match[0].length; i += 1) {
      skip.add(i);
    }
    // A zero-length match would loop forever on the same position.
    if (match[0].length === 0) line.lastIndex += 1;
  }
  return skip;
}

/**
 * Normalises while keeping a way back: `map[i]` is the index in the original
 * string that normalised character `i` came from. Without this the offsets we
 * hand the UI would point into a string the reader never sees.
 */
function normaliseWithMap(text: string): { normalised: string; map: number[] } {
  const folded = fold(text);
  const skip = markdownLinePrefixes(folded);
  const chars: string[] = [];
  const map: number[] = [];

  let previousWasSpace = false;
  for (let i = 0; i < folded.length; i += 1) {
    const char = folded[i]!;
    const isSpace = /\s/.test(char) || skip.has(i);

    if (isSpace) {
      if (previousWasSpace || chars.length === 0) continue;
      chars.push(" ");
      map.push(i);
      previousWasSpace = true;
      continue;
    }

    chars.push(char);
    map.push(i);
    previousWasSpace = false;
  }

  // A trailing space would let a quote match one character past its own end.
  while (chars.length > 0 && chars[chars.length - 1] === " ") {
    chars.pop();
    map.pop();
  }

  return { normalised: chars.join(""), map };
}

type Token = { key: string; start: number; end: number };

/**
 * Trailing punctuation is dropped for comparison only. A model quoting
 * "…who to ask, so they…" as "…who to ask so they…" has copied faithfully; if
 * the comma were allowed to break the token match, that honest citation would
 * be reported as a fabrication.
 */
const stripEdgePunctuation = (word: string): string =>
  word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/** Words of the normalised text, carrying offsets back into the original. */
function tokenise(normalised: string, map: number[]): Token[] {
  const tokens: Token[] = [];
  const pattern = /[^\s]+/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(normalised)) !== null) {
    const key = stripEdgePunctuation(match[0]);
    if (key === "") continue; // a lone dash or bullet carries no meaning

    const startIndex = match.index;
    const endIndex = startIndex + match[0].length - 1;
    tokens.push({
      key,
      start: map[startIndex]!,
      end: map[endIndex]! + 1,
    });
  }
  return tokens;
}

/** Ordered overlap: how much of `quote` appears, in order, inside `window`. */
function orderedSimilarity(quote: string[], window: string[]): number {
  if (quote.length === 0) return 0;

  let matched = 0;
  let cursor = 0;
  for (const word of quote) {
    const found = window.indexOf(word, cursor);
    if (found !== -1) {
      matched += 1;
      cursor = found + 1;
    }
  }
  return matched / quote.length;
}

export function findQuote(quote: string, sourceText: string): QuoteMatch {
  const trimmed = quote.trim();
  if (trimmed.length < MIN_QUOTE_CHARS || sourceText.length === 0) {
    return NOT_FOUND;
  }

  // 1. Exact.
  const exact = sourceText.indexOf(trimmed);
  if (exact !== -1) {
    return {
      matchKind: "exact",
      charStart: exact,
      charEnd: exact + trimmed.length,
    };
  }

  // 2. Normalised.
  const source = normaliseWithMap(sourceText);
  const needle = normaliseWithMap(trimmed);
  if (needle.normalised.length === 0) return NOT_FOUND;

  const at = source.normalised.indexOf(needle.normalised);
  if (at !== -1) {
    const lastIndex = at + needle.normalised.length - 1;
    return {
      matchKind: "normalized",
      charStart: source.map[at]!,
      charEnd: source.map[lastIndex]! + 1,
    };
  }

  // 3. Fuzzy, over word windows.
  const sourceTokens = tokenise(source.normalised, source.map);
  const quoteTokens = tokenise(needle.normalised, needle.map).map((t) => t.key);
  if (quoteTokens.length < 4 || sourceTokens.length === 0) return NOT_FOUND;

  let best = { score: 0, start: -1, end: -1 };
  // Allow the window to breathe: a model dropping or adding a couple of words
  // should still land on the right sentence.
  const widths = [-2, -1, 0, 1, 2].map((delta) => quoteTokens.length + delta);
  for (const width of widths) {
    if (width < 4 || width > sourceTokens.length) continue;

    for (let i = 0; i + width <= sourceTokens.length; i += 1) {
      const window = sourceTokens.slice(i, i + width);
      const score = orderedSimilarity(
        quoteTokens,
        window.map((t) => t.key),
      );
      if (score > best.score) {
        best = {
          score,
          start: window[0]!.start,
          end: window[window.length - 1]!.end,
        };
      }
    }
  }

  if (best.score >= FUZZY_THRESHOLD) {
    return {
      matchKind: "fuzzy",
      charStart: best.start,
      charEnd: best.end,
      similarity: Number(best.score.toFixed(3)),
    };
  }

  return NOT_FOUND;
}

/** Only exact and normalized count as verified. Fuzzy is shown as approximate. */
export function isVerified(matchKind: MatchKind): boolean {
  return matchKind === "exact" || matchKind === "normalized";
}

export type GroundingInput = {
  matchKind: MatchKind;
  confidence: "explicit" | "inferred" | "assumed";
};

/**
 * The grounding score shown at the top of a brief. Counted over claims, not
 * citations, so a claim with three citations does not outvote one with a single
 * good citation.
 */
export function summariseGrounding(
  claims: Array<{ confidence: GroundingInput["confidence"]; matchKinds: MatchKind[] }>,
) {
  const byTier: Record<string, number> = {};
  let verifiedCount = 0;

  for (const claim of claims) {
    byTier[claim.confidence] = (byTier[claim.confidence] ?? 0) + 1;
    if (claim.matchKinds.some(isVerified)) verifiedCount += 1;
  }

  return {
    claimCount: claims.length,
    verifiedCount,
    score: claims.length === 0 ? 0 : verifiedCount / claims.length,
    byTier,
  };
}

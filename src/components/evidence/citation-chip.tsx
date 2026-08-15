"use client";

import { useEvidencePanel, type EvidenceTarget } from "./evidence-panel";

/**
 * The chip that sits beside a claim. Its appearance encodes the verification
 * outcome, so a reader scanning the brief can see which lines are backed by
 * source text without opening anything.
 */
export function CitationChip({ citation }: { citation: EvidenceTarget }) {
  const { open } = useEvidencePanel();

  const style = citation.verified
    ? "border-accent text-accent hover:bg-accent-soft"
    : citation.matchKind === "fuzzy"
      ? "border-gap text-gap hover:bg-gap-soft"
      : "border-flag text-flag hover:bg-flag-soft";

  const title = citation.verified
    ? `Verified in ${citation.citedRef} — click to see it in context`
    : citation.matchKind === "fuzzy"
      ? `Approximate match in ${citation.citedRef} — the wording differs`
      : `Not found in ${citation.citedRef} — this claim is unsupported`;

  return (
    <button
      type="button"
      onClick={() => open(citation)}
      title={title}
      className={`inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 align-middle font-mono text-[10px] tracking-wide ${style}`}
    >
      <span aria-hidden="true">
        {citation.verified ? "✓" : citation.matchKind === "fuzzy" ? "≈" : "✗"}
      </span>
      <span className="truncate">{citation.citedRef}</span>
    </button>
  );
}

export function CitationList({ citations }: { citations: EvidenceTarget[] }) {
  if (citations.length === 0) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {citations.map((citation, i) => (
        <CitationChip key={`${citation.sourceId}-${i}`} citation={citation} />
      ))}
    </span>
  );
}

/** Confidence tier, shown next to a claim so inference is never mistaken for fact. */
export function ConfidenceBadge({ tier }: { tier: string }) {
  const style =
    tier === "explicit"
      ? "border-line text-muted"
      : tier === "inferred"
        ? "border-gap text-gap"
        : "border-flag text-flag";

  const title =
    tier === "explicit"
      ? "Stated directly in a source"
      : tier === "inferred"
        ? "Worked out from evidence across sources"
        : "Filled in by the model — see the assumptions register";

  return (
    <span
      title={title}
      className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase ${style}`}
    >
      {tier}
    </span>
  );
}

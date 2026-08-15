import type { GroundingSummary, ModelUsage } from "@/db/schema";

/**
 * The headline number: how much of this artifact is backed by text that was
 * actually found in a source.
 *
 * It is deliberately prominent and deliberately not always 100%. A brief that
 * cannot show its working is the failure mode this product exists to prevent,
 * so the number is placed where a reader cannot miss it.
 */
export function GroundingScore({
  grounding,
  usage,
  version,
}: {
  grounding: GroundingSummary | null;
  usage: ModelUsage | null;
  version: number;
}) {
  if (!grounding) return null;

  const percent = Math.round(grounding.score * 100);
  const unverified = grounding.claimCount - grounding.verifiedCount;
  const tone =
    percent >= 90 ? "accent" : percent >= 70 ? "gap" : "flag";

  const border =
    tone === "accent"
      ? "border-accent"
      : tone === "gap"
        ? "border-gap"
        : "border-flag";
  const text =
    tone === "accent"
      ? "text-accent"
      : tone === "gap"
        ? "text-gap"
        : "text-flag";

  return (
    <div className={`rounded border ${border} bg-surface px-4 py-3`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`font-serif text-2xl font-semibold ${text}`}>
          {percent}%
        </span>
        <span className="text-sm text-ink-2">
          {grounding.verifiedCount} of {grounding.claimCount} claims verified
          against source
        </span>
      </div>

      <p className="mt-1.5 text-xs text-muted">
        {unverified > 0 ? (
          <>
            {unverified} could not be traced to a quote — including{" "}
            {grounding.byTier.assumed ?? 0} marked as assumptions.{" "}
          </>
        ) : (
          <>Every claim traces to text found in a source. </>
        )}
        {grounding.byTier.explicit ?? 0} stated directly,{" "}
        {grounding.byTier.inferred ?? 0} inferred,{" "}
        {grounding.byTier.assumed ?? 0} assumed.
      </p>

      <p className="mt-1 font-mono text-[10px] text-muted">
        v{version}
        {usage?.model ? ` · ${usage.model}` : ""}
        {usage?.cacheReadInputTokens
          ? ` · ${usage.cacheReadInputTokens.toLocaleString()} tokens read from cache`
          : ""}
      </p>
    </div>
  );
}

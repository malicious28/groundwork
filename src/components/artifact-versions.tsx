import Link from "next/link";
import type { ArtifactVersion } from "@/lib/artifacts";

/**
 * The version picker.
 *
 * Regenerating produces a new version rather than replacing the old one, so
 * this is where a consultant shows what the brief said before a contradiction
 * was settled — and where the grounding score of each run can be compared,
 * which is the honest way to tell whether new evidence actually helped.
 */
export function ArtifactVersions({
  basePath,
  versions,
  current,
}: {
  basePath: string;
  versions: ArtifactVersion[];
  current: number;
}) {
  if (versions.length < 2) return null;

  return (
    <nav
      aria-label="Version history"
      className="mb-6 flex flex-wrap items-center gap-2 rounded border border-line bg-surface px-3 py-2"
    >
      <span className="font-mono text-[10px] tracking-[0.1em] text-muted uppercase">
        {versions.length} runs
      </span>

      {versions.map((entry) => {
        const active = entry.version === current;
        const percent = entry.grounding
          ? Math.round(entry.grounding.score * 100)
          : null;

        return (
          <Link
            key={entry.version}
            href={
              entry.version === versions[0]!.version
                ? basePath
                : `${basePath}?v=${entry.version}`
            }
            aria-current={active ? "true" : undefined}
            title={`Generated ${entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}${
              entry.model ? ` · ${entry.model}` : ""
            }`}
            className={`rounded border px-2 py-1 font-mono text-[11px] tabular-nums ${
              active
                ? "border-accent bg-accent-soft text-accent"
                : "border-line text-muted hover:border-accent hover:text-accent"
            }`}
          >
            v{entry.version}
            {percent !== null ? (
              <span className="ml-1 opacity-70">{percent}%</span>
            ) : null}
          </Link>
        );
      })}

      {current !== versions[0]!.version ? (
        <span className="ml-auto font-mono text-[10px] text-gap uppercase">
          Viewing an earlier run
        </span>
      ) : null}
    </nav>
  );
}

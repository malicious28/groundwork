"use client";

import { useRouter } from "next/navigation";

export function ComparePicker({
  projectId,
  versions,
  older,
  newer,
}: {
  projectId: string;
  versions: Array<{ version: number; createdAt: string; score: number | null }>;
  older: number;
  newer: number;
}) {
  const router = useRouter();

  const go = (a: number, b: number) =>
    router.push(`/projects/${projectId}/compare?a=${a}&b=${b}`);

  const option = (v: { version: number; score: number | null }) => (
    <option key={v.version} value={v.version}>
      v{v.version}
      {v.score !== null ? ` · ${v.score}%` : ""}
    </option>
  );

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded border border-line bg-surface px-3 py-2">
      <span className="font-mono text-[10px] tracking-[0.1em] text-muted uppercase">
        Compare
      </span>
      <select
        value={older}
        aria-label="Earlier run to compare from"
        onChange={(e) => go(Number(e.target.value), newer)}
        className="rounded border border-line bg-surface px-2 py-1 font-mono text-xs"
      >
        {versions.map(option)}
      </select>
      <span className="text-muted">→</span>
      <select
        value={newer}
        aria-label="Later run to compare with"
        onChange={(e) => go(older, Number(e.target.value))}
        className="rounded border border-line bg-surface px-2 py-1 font-mono text-xs"
      >
        {versions.map(option)}
      </select>
    </div>
  );
}

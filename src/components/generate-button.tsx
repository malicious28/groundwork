"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StageState = {
  stage: string;
  status: "start" | "done" | "error";
  detail?: string;
};

const LABELS: Record<string, string> = {
  brief: "Reading sources, writing the brief",
  conflicts: "Looking for contradictions",
  questions: "Checking what nobody answered",
  process: "Designing the improved process",
  outline: "Specifying the solution",
  prototype: "Building the prototype",
};

/**
 * Runs the discovery pipeline and reports each stage as it lands.
 *
 * The response is server-sent events rather than a single JSON reply: six model
 * calls over a long corpus take minutes, and a reader deserves to see the work
 * arriving rather than a spinner that might have died.
 */
export function GenerateButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<StageState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);

  async function run() {
    setRunning(true);
    setStages([]);
    setError(null);
    setRecorded(false);

    const response = await fetch(`/api/projects/${projectId}/generate`, {
      method: "POST",
    });

    if (!response.ok || !response.body) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(body.error ?? "Generation could not be started.");
      setRunning(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line; a partial frame stays in the
      // buffer until the rest of it arrives.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;

        const event = JSON.parse(line.slice(6));
        if (event.type === "stage") {
          setStages((current) => {
            const next = current.filter((s) => s.stage !== event.stage);
            return [
              ...next,
              { stage: event.stage, status: event.status, detail: event.detail },
            ];
          });
        } else if (event.type === "done") {
          setRecorded(Boolean(event.recorded));
        } else if (event.type === "error") {
          setError(event.detail);
        }
      }
    }

    setRunning(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {running ? "Running discovery…" : "Run discovery"}
      </button>

      {stages.length > 0 ? (
        <ol className="w-72 rounded border border-line bg-surface p-3 text-xs">
          {stages.map((stage) => (
            <li key={stage.stage} className="flex gap-2 py-0.5">
              <span
                aria-hidden="true"
                className={
                  stage.status === "done"
                    ? "text-accent"
                    : stage.status === "error"
                      ? "text-flag"
                      : "text-muted"
                }
              >
                {stage.status === "done"
                  ? "✓"
                  : stage.status === "error"
                    ? "✗"
                    : "•"}
              </span>
              <span className="flex-1">
                <span className="text-ink-2">
                  {LABELS[stage.stage] ?? stage.stage}
                </span>
                {stage.detail ? (
                  <span className="block text-muted">{stage.detail}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {recorded ? (
        <p className="w-72 rounded border border-gap bg-gap-soft px-3 py-2 text-xs text-gap">
          Produced from recorded output — no <code>ANTHROPIC_API_KEY</code> is
          set. Citations were still verified against the real sources.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="w-72 rounded border border-flag bg-flag-soft px-3 py-2 text-xs text-flag"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

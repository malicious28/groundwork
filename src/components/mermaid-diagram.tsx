"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Renders a Mermaid diagram, and degrades honestly when it cannot.
 *
 * LLM-written Mermaid fails in predictable ways — an unquoted label containing
 * a comma, `end` used as a node id — so a parse failure is treated as a normal
 * outcome rather than an exception: the reader gets the source in a code block
 * and can see exactly what was produced, instead of an empty panel.
 */
export function MermaidDiagram({
  source,
  title,
}: {
  source: string;
  title: string;
}) {
  const id = useId().replace(/:/g, "");
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "neutral",
        flowchart: { curve: "basis", useMaxWidth: true },
      });

      try {
        // Validate before rendering so a syntax error is caught rather than
        // half-drawn.
        await mermaid.parse(source);
        const { svg } = await mermaid.render(`d${id}`, source);
        if (!cancelled && container.current) {
          container.current.innerHTML = svg;
        }
      } catch (error) {
        if (!cancelled) {
          setFailed(
            error instanceof Error ? error.message : "Diagram failed to parse.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, source]);

  return (
    <figure className="overflow-hidden rounded border border-line bg-surface">
      <figcaption className="border-b border-line px-4 py-2 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
        {title}
      </figcaption>

      {failed ? (
        <div className="p-4">
          <p className="mb-2 rounded border border-gap bg-gap-soft px-3 py-2 text-xs text-gap">
            This diagram did not parse, so the source is shown instead. {failed}
          </p>
          <pre className="overflow-x-auto rounded bg-ground p-3 font-mono text-xs text-ink-2">
            {source}
          </pre>
        </div>
      ) : (
        <div ref={container} className="overflow-x-auto p-4 [&_svg]:mx-auto" />
      )}
    </figure>
  );
}

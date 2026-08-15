"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * The click-through from a claim to the sentence behind it.
 *
 * A citation chip asks this provider to open a source at a character range; the
 * panel fetches that source's text and highlights the span in place, so the
 * reader sees the quote where it was said rather than as a detached snippet.
 *
 * Offsets are computed and stored server-side at verification time, so nothing
 * here re-searches the text and the highlight cannot drift from what was
 * checked.
 */

export type EvidenceTarget = {
  sourceId: string;
  citedRef: string;
  quote: string;
  charStart: number | null;
  charEnd: number | null;
  verified: boolean;
  matchKind: string;
};

type PanelContext = { open: (target: EvidenceTarget) => void };

const Context = createContext<PanelContext | null>(null);

export function useEvidencePanel(): PanelContext {
  const context = useContext(Context);
  if (!context) {
    throw new Error("useEvidencePanel must be used inside <EvidenceProvider>");
  }
  return context;
}

type Loaded = { label: string; filename: string | null; text: string };

export function EvidenceProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const [target, setTarget] = useState<EvidenceTarget | null>(null);
  const [source, setSource] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const markRef = useRef<HTMLElement | null>(null);

  const open = useCallback((next: EvidenceTarget) => {
    setTarget(next);
    setSource(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;

    fetch(`/api/projects/${projectId}/sources/${target.sourceId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("That source could not be loaded.");
        return response.json();
      })
      .then((data: Loaded) => {
        if (!cancelled) setSource(data);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, target]);

  // Scroll the highlight into view once the text is on screen.
  useEffect(() => {
    if (source && markRef.current) {
      markRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [source]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTarget(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Context.Provider value={{ open }}>
      {children}

      {target ? (
        <aside
          role="dialog"
          aria-label="Source evidence"
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-line bg-surface shadow-2xl"
        >
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <p className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
                {target.citedRef}
              </p>
              <h2 className="mt-1 truncate font-serif text-lg font-semibold">
                {source?.label ?? "Loading source…"}
              </h2>
              <p className="mt-1 font-mono text-[11px] text-muted">
                {describeMatch(target)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTarget(null)}
              className="rounded border border-line px-2 py-1 font-mono text-[11px] hover:border-accent hover:text-accent"
            >
              Close
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {error ? (
              <p className="rounded border border-flag bg-flag-soft px-3 py-2 text-sm text-flag">
                {error}
              </p>
            ) : !source ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : (
              <Highlighted
                text={source.text}
                start={target.charStart}
                end={target.charEnd}
                markRef={markRef}
                verified={target.verified}
              />
            )}
          </div>
        </aside>
      ) : null}
    </Context.Provider>
  );
}

function describeMatch(target: EvidenceTarget): string {
  switch (target.matchKind) {
    case "exact":
      return "Quoted exactly — found in the source";
    case "normalized":
      return "Found in the source (punctuation and spacing differ)";
    case "fuzzy":
      return "Approximate match — the wording differs from the source";
    default:
      return "Not found in this source";
  }
}

function Highlighted({
  text,
  start,
  end,
  markRef,
  verified,
}: {
  text: string;
  start: number | null;
  end: number | null;
  markRef: React.MutableRefObject<HTMLElement | null>;
  verified: boolean;
}) {
  if (start === null || end === null || start >= end || end > text.length) {
    return (
      <>
        <p className="mb-3 rounded border border-flag bg-flag-soft px-3 py-2 text-sm text-flag">
          This quote could not be located in the source, so there is nothing to
          highlight. The claim it supports is shown as unverified.
        </p>
        <pre className="font-sans text-sm whitespace-pre-wrap text-ink-2">
          {text}
        </pre>
      </>
    );
  }

  return (
    <pre className="font-sans text-sm whitespace-pre-wrap text-ink-2">
      {text.slice(0, start)}
      <mark
        ref={markRef}
        className={
          verified
            ? "rounded bg-accent-soft px-0.5 font-medium text-ink"
            : "rounded bg-gap-soft px-0.5 font-medium text-ink"
        }
      >
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </pre>
  );
}

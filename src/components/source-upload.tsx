"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Ingested = { ref: string; kind: string; spanCount: number; notes: string[] };

/**
 * Uploading is deliberately unfussy about what it is given: the server decides
 * what each file is from its contents, so there is no format picker to get
 * wrong. What comes back is a report of what was understood, which is the point
 * at which a consultant can tell whether a file was read properly.
 */
export function SourceUpload({ projectId }: { projectId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Ingested[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  async function upload(files: FileList) {
    setBusy(true);
    setError(null);
    setResult(null);

    const body = new FormData();
    for (const file of Array.from(files)) body.append("files", file);

    const response = await fetch(`/api/projects/${projectId}/sources`, {
      method: "POST",
      body,
    });
    const data = (await response.json().catch(() => ({}))) as {
      sources?: Ingested[];
      error?: string;
    };

    if (!response.ok) {
      setError(data.error ?? "Those files could not be added.");
    } else {
      setResult(data.sources ?? []);
      router.refresh();
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  async function addUrl(target: string) {
    setBusy(true);
    setError(null);
    setResult(null);

    const response = await fetch(`/api/projects/${projectId}/sources/url`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: target }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      sources?: Ingested[];
      error?: string;
    };

    if (!response.ok) {
      setError(data.error ?? "That page could not be read.");
    } else {
      setResult(data.sources ?? []);
      setUrl("");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="mb-6 rounded border border-dashed border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Add sources</p>
          <p className="mt-0.5 text-xs text-muted">
            Transcripts (.vtt), WhatsApp exports (.txt), PDFs, Word documents,
            screenshots — or a link to the client&apos;s website. The format is
            detected from the file itself, not its name.
          </p>
        </div>
        <label className="cursor-pointer rounded border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft">
          {busy ? "Reading…" : "Choose files"}
          <input
            ref={input}
            type="file"
            multiple
            disabled={busy}
            className="sr-only"
            onChange={(event) => {
              if (event.target.files?.length) upload(event.target.files);
            }}
          />
        </label>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (url.trim()) addUrl(url.trim());
        }}
        className="mt-3 flex flex-wrap gap-2 border-t border-line-soft pt-3"
      >
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://the-client.example/about"
          className="min-w-0 flex-1 rounded border border-line bg-surface px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="rounded border border-line px-3 py-1.5 text-sm hover:border-accent hover:text-accent disabled:opacity-50"
        >
          Read page
        </button>
      </form>

      {result ? (
        <ul className="mt-3 flex flex-col gap-1">
          {result.map((source) => (
            <li key={source.ref} className="text-xs text-ink-2">
              <span className="font-mono text-accent">{source.ref}</span> · read
              as {source.kind} · {source.spanCount} spans
              {source.notes.length > 0 ? (
                <span className="text-muted"> — {source.notes.join(" ")}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded border border-flag bg-flag-soft px-3 py-2 text-xs text-flag"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

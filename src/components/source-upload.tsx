"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Ingested = { ref: string; kind: string; spanCount: number; notes: string[] };
type Mode = "files" | "link" | "write";

/**
 * The three ways evidence actually arrives.
 *
 * Files and links are obvious. The third matters more than it looks: the most
 * common thing a client sends is not a document but a paragraph — a few lines
 * in an email describing what is wrong. Making somebody save that to a .txt
 * before it can be used is a pointless step, and it is often the clearest
 * statement of the problem in the whole engagement.
 *
 * What comes back is a report of what was understood, which is the point at
 * which a consultant can tell whether a file was read properly.
 */
export function SourceUpload({ projectId }: { projectId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("files");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Ingested[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  async function send(
    path: string,
    init: RequestInit,
    fallbackError: string,
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    setResult(null);

    const response = await fetch(`/api/projects/${projectId}/${path}`, init);
    const data = (await response.json().catch(() => ({}))) as {
      sources?: Ingested[];
      error?: string;
    };

    if (!response.ok) {
      setError(data.error ?? fallbackError);
      setBusy(false);
      return false;
    }
    setResult(data.sources ?? []);
    setBusy(false);
    router.refresh();
    return true;
  }

  async function upload(files: FileList) {
    const body = new FormData();
    for (const file of Array.from(files)) body.append("files", file);
    await send("sources", { method: "POST", body }, "Those files could not be added.");
    if (input.current) input.current.value = "";
  }

  const TABS: Array<{ id: Mode; label: string }> = [
    { id: "files", label: "Upload files" },
    { id: "link", label: "Read a website" },
    { id: "write", label: "Write it out" },
  ];

  return (
    <div className="mb-6 rounded border border-dashed border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm font-medium">Add sources</p>
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id)}
              aria-current={mode === tab.id}
              className={`rounded border px-2.5 py-1 font-mono text-[11px] ${
                mode === tab.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "files" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-prose text-xs text-muted">
            Transcripts (.vtt), WhatsApp exports (.txt), PDFs, Word documents,
            screenshots. The format is detected from the file itself, not its
            name.
          </p>
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
      ) : null}

      {mode === "link" ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await send(
              "sources/url",
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ url: url.trim() }),
              },
              "That page could not be read.",
            );
            if (ok) setUrl("");
          }}
          className="flex flex-wrap gap-2"
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
            className="rounded border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
          >
            {busy ? "Reading…" : "Read page"}
          </button>
        </form>
      ) : null}

      {mode === "write" ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const ok = await send(
              "sources/text",
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  title: form.get("title"),
                  text: form.get("text"),
                }),
              },
              "That could not be saved.",
            );
            if (ok) (event.target as HTMLFormElement).reset();
          }}
          className="flex flex-col gap-2"
        >
          <p className="max-w-prose text-xs text-muted">
            Paste what the client wrote, or type up a call you did not record.
            It joins the evidence ledger like any other source, and anything the
            brief claims from it is quoted and checked the same way.
          </p>
          <input
            name="title"
            required
            maxLength={120}
            placeholder="What this is — e.g. “Email from Rohit, 4 April”"
            className="rounded border border-line bg-surface px-3 py-1.5 text-sm"
          />
          <textarea
            name="text"
            required
            rows={6}
            minLength={20}
            placeholder="In their words if you have them. The more it sounds like the client and less like a summary, the better the brief that comes out of it."
            className="rounded border border-line bg-surface px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="self-start rounded border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
          >
            {busy ? "Saving…" : "Add to the ledger"}
          </button>
        </form>
      ) : null}

      {result ? (
        <ul className="mt-3 flex flex-col gap-1 border-t border-line-soft pt-3">
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

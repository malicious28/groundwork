"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Moving a question along: raised → sent → answered.
 *
 * Recording the answer matters more than the status. An answer typed here is
 * carried into the next discovery run, so the brief stops treating a settled
 * matter as an open gap — which is the difference between a checklist and
 * something that actually accumulates knowledge about the engagement.
 */
export function QuestionActions({
  projectId,
  questionId,
  status,
  answer,
}: {
  projectId: string;
  questionId: string;
  status: string;
  answer: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/projects/${projectId}/questions/${questionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    setTyping(false);
    setDraft("");
    router.refresh();
  }

  if (status === "answered") {
    return (
      <div className="mt-3 rounded border border-accent bg-accent-soft px-3 py-2">
        <p className="font-mono text-[10px] tracking-[0.1em] text-accent uppercase">
          Answered
        </p>
        <p className="mt-1 text-sm text-ink">{answer}</p>
        <button
          type="button"
          onClick={() => send({ action: "reopen" })}
          disabled={busy}
          className="mt-2 font-mono text-[11px] text-muted hover:text-accent disabled:opacity-60"
        >
          Reopen
        </button>
      </div>
    );
  }

  if (status === "dismissed") {
    return (
      <div className="mt-3 flex items-center gap-3">
        <span className="font-mono text-[10px] tracking-[0.1em] text-muted uppercase">
          Dismissed
        </span>
        <button
          type="button"
          onClick={() => send({ action: "reopen" })}
          disabled={busy}
          className="font-mono text-[11px] text-muted hover:text-accent disabled:opacity-60"
        >
          Reopen
        </button>
      </div>
    );
  }

  if (typing) {
    return (
      <div className="mt-3 flex flex-col gap-2">
        <textarea
          autoFocus
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="What the client said, in their words where you have them."
          className="rounded border border-line bg-surface px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || !draft.trim()}
            onClick={() => send({ action: "answered", answer: draft })}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            Save answer
          </button>
          <button
            type="button"
            onClick={() => setTyping(false)}
            className="font-mono text-[11px] text-muted hover:text-accent"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {status === "asked" ? (
        <span className="font-mono text-[10px] tracking-[0.1em] text-gap uppercase">
          Sent to client
        </span>
      ) : (
        <button
          type="button"
          onClick={() => send({ action: "asked" })}
          disabled={busy}
          className="rounded border border-line px-2.5 py-1 font-mono text-[11px] hover:border-accent hover:text-accent disabled:opacity-60"
        >
          Mark as sent
        </button>
      )}
      <button
        type="button"
        onClick={() => setTyping(true)}
        className="rounded border border-accent px-2.5 py-1 font-mono text-[11px] text-accent hover:bg-accent-soft"
      >
        Record answer
      </button>
      <button
        type="button"
        onClick={() => send({ action: "dismissed" })}
        disabled={busy}
        className="font-mono text-[11px] text-muted hover:text-flag disabled:opacity-60"
      >
        Not needed
      </button>
    </div>
  );
}

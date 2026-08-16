"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Side = { id: string; stance: string; speaker: string | null };

/**
 * Deciding a contradiction.
 *
 * The choice is framed as picking the position that stands, not as clearing a
 * notification — because that is the decision the consultant actually has to
 * take back to the client, and the wording is what gets recorded.
 */
export function ConflictActions({
  projectId,
  conflictId,
  sides,
  status,
  resolution,
}: {
  projectId: string;
  conflictId: string;
  sides: Side[];
  status: string;
  resolution: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/projects/${projectId}/conflicts/${conflictId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    setOpen(false);
    setNote("");
    router.refresh();
  }

  if (status !== "open") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-mono text-[10px] tracking-wide text-accent uppercase">
            {status === "dismissed" ? "Dismissed" : "Decided"}
          </span>
          <span className="ml-2 text-ink-2">{resolution}</span>
        </p>
        <button
          type="button"
          onClick={() => send({ action: "reopen" })}
          disabled={busy}
          className="rounded border border-line px-2 py-1 font-mono text-[11px] hover:border-accent hover:text-accent disabled:opacity-60"
        >
          Reopen
        </button>
      </div>
    );
  }

  return (
    <div>
      {!open ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft"
          >
            Record a decision
          </button>
          <button
            type="button"
            onClick={() => send({ action: "dismiss" })}
            disabled={busy}
            className="rounded border border-line px-3 py-1.5 text-sm text-muted hover:border-flag hover:text-flag disabled:opacity-60"
          >
            Not a real conflict
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
            Which position stands?
          </p>
          <div className="flex flex-wrap gap-2">
            {sides.map((side) => (
              <button
                key={side.id}
                type="button"
                disabled={busy}
                onClick={() => send({ action: "resolve", sideId: side.id, note })}
                className="max-w-full rounded border border-line bg-surface px-3 py-2 text-left text-sm hover:border-accent disabled:opacity-60"
              >
                <span className="font-medium">{side.stance}</span>
                {side.speaker ? (
                  <span className="block font-mono text-[10px] text-muted">
                    {side.speaker}
                  </span>
                ) : null}
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => send({ action: "resolve", note })}
              className="rounded border border-dashed border-line px-3 py-2 text-sm text-muted hover:border-accent hover:text-accent disabled:opacity-60"
            >
              Neither — see note
            </button>
          </div>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.1em] text-muted uppercase">
              What was agreed, and why
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="Confirmed with Rohit on the 3rd — five lakh, materials included in phase one."
              className="rounded border border-line bg-surface px-3 py-2 text-sm"
            />
          </label>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="self-start font-mono text-[11px] text-muted hover:text-accent"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

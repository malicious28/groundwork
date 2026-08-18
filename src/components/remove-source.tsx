"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Withdrawing a document from the ledger.
 *
 * Confirmed in place rather than through a modal, and the confirmation says
 * what actually happens: existing briefs keep what they concluded, because they
 * are a record of the evidence available at the time. Re-running discovery is
 * what produces a version without it.
 */
export function RemoveSource({
  projectId,
  sourceId,
  label,
}: {
  projectId: string;
  sourceId: string;
  label: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Remove ${label}`}
        className="font-mono text-[10px] text-muted hover:text-flag"
      >
        Remove
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] text-flag">Remove it?</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await fetch(`/api/projects/${projectId}/sources/${sourceId}`, {
            method: "DELETE",
          });
          setBusy(false);
          setConfirming(false);
          router.refresh();
        }}
        className="rounded border border-flag px-1.5 py-0.5 font-mono text-[10px] text-flag hover:bg-flag-soft disabled:opacity-50"
      >
        {busy ? "…" : "Yes"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="font-mono text-[10px] text-muted hover:text-accent"
      >
        Cancel
      </button>
    </span>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Issuing, copying and revoking the client link.
 *
 * Revoking is rotation — the old token stops resolving the instant a new one is
 * written — so the control says what actually happens rather than implying the
 * link is deleted somewhere.
 */
export function ShareLink({
  projectId,
  initialToken,
}: {
  projectId: string;
  initialToken: string | null;
}) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = token
    ? `${typeof window === "undefined" ? "" : window.location.origin}/s/${token}`
    : null;

  async function issue() {
    setBusy(true);
    const response = await fetch(`/api/projects/${projectId}/share`, {
      method: "POST",
    });
    const data = (await response.json()) as { token?: string };
    if (data.token) setToken(data.token);
    setBusy(false);
    router.refresh();
  }

  async function revoke() {
    setBusy(true);
    await fetch(`/api/projects/${projectId}/share`, { method: "DELETE" });
    setToken(null);
    setBusy(false);
    router.refresh();
  }

  if (!token) {
    return (
      <div className="rounded border border-line bg-surface p-4">
        <p className="text-sm font-medium">Client link</p>
        <p className="mt-1 mb-3 max-w-prose text-xs text-muted">
          A link your client can open without an account, and forward to whoever
          else needs it. It shows the brief, the proposed process and the
          prototype — not the conflicts or assumptions.
        </p>
        <button
          type="button"
          onClick={issue}
          disabled={busy}
          className="rounded border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create client link"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded border border-accent bg-surface p-4">
      <p className="text-sm font-medium">Client link is live</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded border border-line bg-ground px-2 py-1.5 font-mono text-xs">
          {url}
        </code>
        <button
          type="button"
          onClick={async () => {
            if (url) await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={revoke}
          disabled={busy}
          className="rounded border border-flag px-3 py-1.5 text-sm text-flag hover:bg-flag-soft disabled:opacity-60"
        >
          Revoke
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Anyone with this link can open it. Revoking replaces the token, so the
        old link stops working immediately.
      </p>
    </div>
  );
}

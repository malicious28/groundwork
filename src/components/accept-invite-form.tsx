"use client";

import { useState } from "react";

export function AcceptInviteForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/team/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        name: form.get("name"),
        password: form.get("password"),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      redirectTo?: string;
    };

    if (!response.ok) {
      setError(body.error ?? "That did not work. Try again.");
      setBusy(false);
      return;
    }
    // A document load, for the same reason as the login form: accepting an
    // invitation creates the session, so everything above this page was
    // rendered for nobody.
    window.location.assign(body.redirectTo ?? "/dashboard");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
          Email
        </span>
        {/* Fixed: it comes from the invitation, not from whoever holds the link. */}
        <input
          value={email}
          readOnly
          className="rounded border border-line bg-surface-2 px-3 py-2 text-muted"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
          Your name
        </span>
        <input
          name="name"
          required
          autoComplete="name"
          className="rounded border border-line bg-surface px-3 py-2 text-ink"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
          Choose a password
        </span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded border border-line bg-surface px-3 py-2 text-ink"
        />
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded border border-flag bg-flag-soft px-3 py-2 text-sm text-flag"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="mt-1 rounded bg-accent px-4 py-2.5 font-medium text-white disabled:opacity-60"
      >
        {busy ? "Joining…" : "Join the workspace"}
      </button>
    </form>
  );
}

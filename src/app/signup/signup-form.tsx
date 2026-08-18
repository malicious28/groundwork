"use client";

import { useState } from "react";

const FIELD =
  "rounded border border-line bg-surface px-3 py-2 text-ink placeholder:text-muted";
const LABEL = "font-mono text-[11px] tracking-[0.1em] text-muted uppercase";

export function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          workspace: form.get("workspace"),
          email: form.get("email"),
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
      // A document load, as with signing in: the session did not exist a
      // moment ago and everything above this page was rendered for nobody.
      window.location.assign(body.redirectTo ?? "/");
    } catch {
      setError("Could not reach the server. Check it is still running.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Your name</span>
        <input name="name" required maxLength={120} autoComplete="name" className={FIELD} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Workspace name</span>
        <input
          name="workspace"
          required
          maxLength={120}
          placeholder="Your company or team"
          className={FIELD}
        />
        <span className="text-xs text-muted">
          Colleagues you invite later join this workspace and share its projects.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Email</span>
        <input name="email" type="email" required autoComplete="username" className={FIELD} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className={FIELD}
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
        {busy ? "Creating…" : "Create workspace"}
      </button>
    </form>
  );
}

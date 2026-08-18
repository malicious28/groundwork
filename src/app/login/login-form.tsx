"use client";

import { useState } from "react";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo";

/**
 * Signing in ends with a full page load rather than a client-side navigation.
 *
 * The session cookie has just changed, which means every layout above this
 * point — the header, the tenant scope, the role gate — was rendered for a
 * different person, or for nobody. Asking the client router to patch that up
 * is the fragile way to say "re-enter the app as someone else": it depends on
 * the running build still matching the one this tab was loaded from, and when
 * it does not the navigation quietly never completes and the button sits on
 * "Signing in…" forever with nothing to click.
 *
 * A document load is also honest about what happened. You signed in; the
 * application starts again as you.
 */
export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Controlled so the demo button can fill them. The fields are no longer
  // pre-filled: a real account holder should not have to clear somebody else's
  // credentials out of the form before they can sign in.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Before the request, not after it: the network call is the slow part, and
    // until this flips the button is live and a second click sends a second
    // sign-in.
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        redirectTo?: string;
      };

      if (!response.ok) {
        setError(body.error ?? "Something went wrong. Try again.");
        setBusy(false);
        return;
      }

      // Deliberately left busy: the page is on its way out, and re-enabling
      // the button would invite a second sign-in during the load.
      window.location.assign(body.redirectTo ?? "/dashboard");
    } catch {
      setError("Could not reach the server. Check it is still running.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
          Email
        </span>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded border border-line bg-surface px-3 py-2 text-ink"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
          Password
        </span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
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
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <button
        type="button"
        onClick={() => {
          setEmail(DEMO_ACCOUNTS[0].email);
          setPassword(DEMO_PASSWORD);
          setError(null);
        }}
        className="self-start text-xs text-accent underline underline-offset-2"
      >
        Fill in the demo consultant account
      </button>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      redirectTo?: string;
    };

    if (!response.ok) {
      setError(body.error ?? "Something went wrong. Try again.");
      return;
    }

    startTransition(() => {
      router.push(body.redirectTo ?? "/projects");
      router.refresh();
    });
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
          defaultValue="ashika@meridian.example"
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
          defaultValue="demo1234"
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
        disabled={pending}
        className="mt-1 rounded bg-accent px-4 py-2.5 font-medium text-white disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

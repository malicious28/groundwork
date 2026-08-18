"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Starting a project is three fields, not a wizard. Everything else the tool
 * knows about the engagement comes from the documents, which is the point.
 */
export function NewProjectForm({ first }: { first: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        clientName: form.get("clientName"),
        summary: form.get("summary"),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      id?: string;
      error?: string;
    };

    if (!response.ok || !body.id) {
      setError(body.error ?? "Could not create the project.");
      setBusy(false);
      return;
    }
    router.push(`/dashboard?project=${body.id}`);
    router.refresh();
  }

  const field =
    "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-2">
            What are you planning?
          </span>
          <input
            name="name"
            required
            maxLength={160}
            placeholder="Client portal discovery"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-2">Who is it for?</span>
          <input
            name="clientName"
            required
            maxLength={160}
            placeholder="Nova Interiors"
            className={field}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-ink-2">
          One line about them <span className="text-muted">(optional)</span>
        </span>
        <input
          name="summary"
          maxLength={600}
          placeholder="40-person interior fit-out firm running projects on WhatsApp and a spreadsheet"
          className={field}
        />
      </label>

      {error ? (
        <p role="alert" className="rounded border border-flag bg-flag-soft px-3 py-2 text-xs text-flag">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="self-start rounded bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {busy ? "Creating…" : first ? "Start your first project" : "Create project"}
      </button>
    </form>
  );
}

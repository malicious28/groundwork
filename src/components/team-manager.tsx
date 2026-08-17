"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Member = {
  userId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string;
};
type Invite = {
  id: string;
  email: string;
  role: string;
  token: string;
  expiresAt: string;
};

const ROLE_HELP: Record<string, string> = {
  owner: "Everything, including managing the team",
  consultant: "Create projects, upload sources, run discovery",
  client: "Read-only, and only what has been published",
};

export function TeamManager({
  canManage,
  currentUserId,
  members,
  invites,
}: {
  canManage: boolean;
  currentUserId: string;
  members: Member[];
  invites: Invite[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    const response = await fetch(url, init);
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) setError(body.error ?? "That did not work.");
    setBusy(false);
    router.refresh();
    return response.ok;
  }

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await call("/api/team/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        role: form.get("role"),
      }),
    });
    if (ok) (event.target as HTMLFormElement).reset();
  }

  return (
    <>
      {canManage ? (
        <form
          onSubmit={invite}
          className="mb-8 rounded border border-dashed border-line bg-surface p-4"
        >
          <p className="text-sm font-medium">Invite someone</p>
          <p className="mt-0.5 mb-3 text-xs text-muted">
            They get a link, choose a password, and are in. No email is sent —
            copy the link to them yourself.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              name="email"
              type="email"
              required
              placeholder="colleague@agency.example"
              className="min-w-0 flex-1 rounded border border-line bg-surface px-3 py-1.5 text-sm"
            />
            <select
              name="role"
              defaultValue="consultant"
              className="rounded border border-line bg-surface px-3 py-1.5 text-sm"
            >
              <option value="consultant">Consultant</option>
              <option value="owner">Owner</option>
              <option value="client">Client</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              Invite
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mb-6 rounded border border-flag bg-flag-soft px-3 py-2 text-sm text-flag"
        >
          {error}
        </p>
      ) : null}

      <h2 className="mb-3 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
        Members · {members.length}
      </h2>
      <ul className="mb-8 flex flex-col divide-y divide-line-soft overflow-hidden rounded border border-line bg-surface">
        {members.map((member) => (
          <li
            key={member.userId}
            className="flex flex-wrap items-center gap-3 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {member.name}
                {member.userId === currentUserId ? (
                  <span className="ml-2 font-mono text-[10px] text-muted">
                    you
                  </span>
                ) : null}
              </p>
              <p className="font-mono text-[11px] text-muted">{member.email}</p>
            </div>

            {canManage && member.userId !== currentUserId ? (
              <>
                <select
                  defaultValue={member.role}
                  disabled={busy}
                  onChange={(event) =>
                    call(`/api/team/members/${member.userId}`, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ role: event.target.value }),
                    })
                  }
                  className="rounded border border-line bg-surface px-2 py-1 text-xs"
                >
                  <option value="owner">Owner</option>
                  <option value="consultant">Consultant</option>
                  <option value="client">Client</option>
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    call(`/api/team/members/${member.userId}`, {
                      method: "DELETE",
                    })
                  }
                  className="font-mono text-[11px] text-muted hover:text-flag disabled:opacity-60"
                >
                  Remove
                </button>
              </>
            ) : (
              <span
                title={ROLE_HELP[member.role]}
                className="rounded border border-line px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted uppercase"
              >
                {member.role}
              </span>
            )}
          </li>
        ))}
      </ul>

      {invites.length > 0 ? (
        <>
          <h2 className="mb-3 font-mono text-[11px] tracking-[0.1em] text-gap uppercase">
            Invited, not yet joined · {invites.length}
          </h2>
          <ul className="flex flex-col divide-y divide-line-soft overflow-hidden rounded border border-gap bg-surface">
            {invites.map((pending) => (
              <li
                key={pending.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{pending.email}</p>
                  <p className="font-mono text-[10px] text-muted">
                    {pending.role} · expires{" "}
                    {pending.expiresAt.slice(0, 10)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      `${window.location.origin}/join/${pending.token}`,
                    );
                    setCopied(pending.id);
                    setTimeout(() => setCopied(null), 2000);
                  }}
                  className="rounded border border-accent px-2 py-1 font-mono text-[11px] text-accent hover:bg-accent-soft"
                >
                  {copied === pending.id ? "Copied" : "Copy link"}
                </button>
                {canManage ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      call(`/api/team/invite/${pending.id}`, {
                        method: "DELETE",
                      })
                    }
                    className="font-mono text-[11px] text-muted hover:text-flag disabled:opacity-60"
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

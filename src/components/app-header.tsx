import Link from "next/link";
import { LogoutButton } from "./logout-button";

export function AppHeader({
  session,
}: {
  session: { name: string; role: string; orgSlug: string };
}) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent"
        >
          Groundwork
        </Link>
        <div className="flex items-center gap-4 text-xs text-muted">
          <Link href="/settings/skills" className="font-mono hover:text-accent">
            Skills
          </Link>
          <Link href="/settings/team" className="font-mono hover:text-accent">
            Team
          </Link>
          <span className="font-mono">
            {session.name} · {session.orgSlug} · {session.role}
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}

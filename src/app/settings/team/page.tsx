import { requireSessionPage } from "@/lib/auth/session";
import { listMembers, listPendingInvites } from "@/lib/team";
import { AppHeader } from "@/components/app-header";
import { TeamManager } from "@/components/team-manager";

/**
 * The workspace's people.
 *
 * Everyone can see who is in the team — hiding that from consultants would be
 * odd — but only an owner gets the controls, enforced on the server rather than
 * by hiding buttons.
 */
export default async function TeamPage() {
  const session = await requireSessionPage("consultant");

  const [members, invites] = await Promise.all([
    listMembers(session.orgId),
    listPendingInvites(session.orgId),
  ]);

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 font-serif text-3xl font-semibold tracking-tight">
          Your team
        </h1>
        <p className="mb-8 max-w-prose text-ink-2">
          Everyone here works on the same projects and adds to the same evidence
          ledger. Clients see only what has been published to them.
        </p>

        <TeamManager
          canManage={session.role === "owner"}
          currentUserId={session.userId}
          members={members.map((m) => ({
            ...m,
            joinedAt: m.joinedAt.toISOString(),
          }))}
          invites={invites.map((i) => ({
            id: i.id,
            email: i.email,
            role: i.role,
            token: i.token,
            expiresAt: i.expiresAt.toISOString(),
          }))}
        />
      </main>
    </>
  );
}

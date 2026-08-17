import { notFound } from "next/navigation";
import { resolveInvite } from "@/lib/team";
import { AcceptInviteForm } from "@/components/accept-invite-form";

/**
 * Where an invitation link lands.
 *
 * The email is shown but not editable: it comes from the invitation, so holding
 * a link cannot be turned into claiming somebody else's address.
 */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await resolveInvite(token);

  // Expired, already used, or never existed — all the same answer.
  if (!invite) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <p className="mb-4 font-mono text-[11px] tracking-[0.14em] text-accent uppercase">
        Groundwork
      </p>
      <h1 className="mb-3 font-serif text-3xl leading-tight font-semibold tracking-tight text-balance">
        Join {invite.orgName}
      </h1>
      <p className="mb-8 text-ink-2">
        You have been invited as a{" "}
        <strong>{invite.role === "client" ? "client" : invite.role}</strong>.
        Choose a password and you are in.
      </p>

      <AcceptInviteForm token={token} email={invite.email} />
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo";

/**
 * The sign-in screen carries the only explanation of the product a first-time
 * visitor is guaranteed to read, so it says what the tool does in four lines
 * and then hands over the demo login rather than making somebody ask for it.
 */
export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16">
      <p className="mb-4 font-mono text-[11px] tracking-[0.14em] text-accent uppercase">
        Groundwork
      </p>
      <h1 className="mb-3 font-serif text-4xl leading-tight font-semibold tracking-tight text-balance">
        Sign in
      </h1>

      <div className="mb-8 flex flex-col gap-3 text-ink-2">
        <p>
          Clients explain what they need in scattered pieces — a recorded call,
          a WhatsApp thread, a PDF of their terms, a screenshot of the
          spreadsheet they actually run on. Groundwork reads all of it together
          and turns it into a plan you can build from.
        </p>
        <p>
          You get a requirements brief where{" "}
          <strong className="font-medium text-ink">
            every line is quoted back to the exact sentence
          </strong>{" "}
          somebody said it in, a list of places the sources contradict each
          other, the questions nobody has answered yet, a better process, and a
          working demo of the proposed tool that the client can actually try.
        </p>
      </div>

      <LoginForm />

      <div className="mt-10 rounded border border-accent-line bg-accent-soft p-4">
        <p className="mb-1 font-mono text-[11px] tracking-[0.1em] text-accent uppercase">
          Test it with the demo account
        </p>
        <p className="mb-3 text-sm text-ink-2">
          The demo workspace is loaded with one firm&rsquo;s real-looking
          engagement — two call recordings, a WhatsApp export, an SOP document,
          a vendor PDF and a screenshot — so you can see the whole flow without
          uploading anything. It is the only account that has them.
        </p>
        <ul className="flex flex-col gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email} className="text-xs">
              <span className="font-mono text-accent">{account.email}</span>
              <span className="text-muted"> — {account.description}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 font-mono text-[11px] text-muted">
          password for all three: {DEMO_PASSWORD}
        </p>
      </div>

      <p className="mt-8 text-sm text-muted">
        Want an empty workspace of your own?{" "}
        <Link href="/signup" className="text-accent underline underline-offset-2">
          Create one
        </Link>
        . It starts with nothing in it.
      </p>
    </main>
  );
}

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(session.role === "client" ? "/shared" : "/projects");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
        Groundwork
      </p>
      <h1 className="mb-3 font-serif text-4xl leading-tight font-semibold tracking-tight text-balance">
        Sign in
      </h1>
      <p className="mb-8 text-ink-2">
        Discovery workspace for turning scattered client inputs into something
        you can build from.
      </p>

      <LoginForm />

      <div className="mt-10 rounded border border-line bg-surface p-4">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
          Demo accounts · password demo1234
        </p>
        <ul className="space-y-1 font-mono text-xs text-ink-2">
          <li>ashika@meridian.example — consultant</li>
          <li>rohit@novainteriors.example — client, read-only</li>
          <li>dev@northwind.example — a different tenant</li>
        </ul>
      </div>
    </main>
  );
}

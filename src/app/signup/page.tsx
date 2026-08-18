import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const session = await getSession();
  if (session) redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <p className="mb-4 font-mono text-[11px] tracking-[0.14em] text-accent uppercase">
        Groundwork
      </p>
      <h1 className="mb-3 font-serif text-4xl leading-tight font-semibold tracking-tight text-balance">
        Create a workspace
      </h1>
      <p className="mb-8 text-ink-2">
        Your workspace starts empty. Nothing from the demo is copied into it —
        everything you see in it will be something you put there.
      </p>

      <SignupForm />

      <p className="mt-8 text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent underline underline-offset-2">
          Sign in
        </Link>
        .
      </p>
    </main>
  );
}

import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { withTenant } from "@/db/tenant";
import { projects } from "@/db/schema";
import { AppHeader } from "@/components/app-header";

/**
 * The client-facing surface. It reads through the same tenant-scoped path as
 * the consultant views — the difference is role, not a separate data path, so
 * there is no second place for an isolation bug to hide.
 *
 * The read-only brief and prototype land here once those artifacts exist.
 */
export default async function SharedPage() {
  const session = await requireSession("client");

  const rows = await withTenant(session.orgId, (tx) =>
    tx
      .select({ id: projects.id, name: projects.name, summary: projects.summary })
      .from(projects)
      .where(and(eq(projects.orgId, session.orgId))),
  );

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 font-serif text-3xl font-semibold tracking-tight">
          Shared with you
        </h1>
        <p className="mb-8 text-ink-2">
          Read-only view of what your consultant has published.
        </p>

        {rows.map((project) => (
          <article
            key={project.id}
            className="mb-3 rounded border border-line bg-surface p-5"
          >
            <h2 className="font-serif text-xl font-semibold">{project.name}</h2>
            {project.summary ? (
              <p className="mt-2 text-sm text-ink-2">{project.summary}</p>
            ) : null}
            <p className="mt-3 font-mono text-[11px] text-muted">
              Nothing published yet — the brief appears here once your
              consultant shares it.
            </p>
          </article>
        ))}
      </main>
    </>
  );
}

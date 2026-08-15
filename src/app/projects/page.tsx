import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { withTenant } from "@/db/tenant";
import { projects, sources } from "@/db/schema";
import { AppHeader } from "@/components/app-header";

export default async function ProjectsPage() {
  const session = await requireSession("consultant");

  const rows = await withTenant(session.orgId, (tx) =>
    tx
      .select({
        id: projects.id,
        name: projects.name,
        clientName: projects.clientName,
        summary: projects.summary,
        createdAt: projects.createdAt,
        sourceCount: sql<number>`(
          select count(*)::int from ${sources} where ${sources.projectId} = ${projects.id}
        )`,
      })
      .from(projects)
      // Redundant against the RLS policy, and kept deliberately: the filter
      // states the intent to a reviewer, the policy is what enforces it.
      .where(eq(projects.orgId, session.orgId))
      .orderBy(desc(projects.createdAt))
      .limit(50),
  );

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 font-serif text-3xl font-semibold tracking-tight">
          Projects
        </h1>
        <p className="mb-8 text-ink-2">
          {session.orgSlug === "meridian"
            ? "Meridian Digital's engagements."
            : "Your workspace's engagements."}
        </p>

        {rows.length === 0 ? (
          <p className="rounded border border-line bg-surface px-4 py-6 text-muted">
            No projects yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="block rounded border border-line bg-surface p-5 hover:border-accent"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-serif text-xl font-semibold">
                      {project.name}
                    </h2>
                    <span className="font-mono text-[11px] tracking-wide text-muted tabular-nums">
                      {project.sourceCount} source
                      {project.sourceCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  {project.summary ? (
                    <p className="mt-2 max-w-prose text-sm text-ink-2">
                      {project.summary}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

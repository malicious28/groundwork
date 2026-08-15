import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { withTenant } from "@/db/tenant";
import { artifacts, projects } from "@/db/schema";
import { AppHeader } from "@/components/app-header";

/**
 * The client-facing surface.
 *
 * It reads through the same tenant-scoped path as the consultant views — the
 * difference is role, not a separate data path, so there is no second place for
 * an isolation bug to hide.
 */
export default async function SharedPage() {
  const session = await requireSession("client");

  const rows = await withTenant(session.orgId, async (tx) => {
    const found = await tx
      .select({
        id: projects.id,
        name: projects.name,
        summary: projects.summary,
      })
      .from(projects)
      .where(eq(projects.orgId, session.orgId));

    return Promise.all(
      found.map(async (project) => {
        const published = await tx
          .selectDistinct({ kind: artifacts.kind })
          .from(artifacts)
          .where(
            and(
              eq(artifacts.orgId, session.orgId),
              eq(artifacts.projectId, project.id),
            ),
          );
        return { ...project, published: published.map((p) => p.kind) };
      }),
    );
  });

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 font-serif text-3xl font-semibold tracking-tight">
          Shared with you
        </h1>
        <p className="mb-8 text-ink-2">
          What your consultant has published so far.
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

            {project.published.length > 0 ? (
              <Link
                href={`/shared/${project.id}`}
                className="mt-4 inline-block rounded bg-accent px-3 py-1.5 text-sm font-medium text-white"
              >
                Open
              </Link>
            ) : (
              <p className="mt-3 font-mono text-[11px] text-muted">
                Nothing published yet — this appears once your consultant shares
                their findings.
              </p>
            )}
          </article>
        ))}
      </main>
    </>
  );
}

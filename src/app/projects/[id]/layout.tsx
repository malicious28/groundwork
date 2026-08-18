import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { withTenant } from "@/db/tenant";
import { projects } from "@/db/schema";
import { AppHeader } from "@/components/app-header";
import { EvidenceProvider } from "@/components/evidence/evidence-panel";
import { ProjectTabs } from "@/components/project-tabs";
import { GenerateButton } from "@/components/generate-button";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession("consultant");
  const { id } = await params;

  const [project] = await withTenant(session.orgId, (tx) =>
    tx
      .select()
      .from(projects)
      .where(and(eq(projects.orgId, session.orgId), eq(projects.id, id))),
  );

  // Another tenant's project is indistinguishable from one that never existed.
  if (!project) notFound();

  return (
    <EvidenceProvider projectId={project.id}>
      <AppHeader session={session} />

      <div className="border-b border-line bg-surface">
        <div className="mx-auto max-w-5xl px-6 pt-6 pb-0">
          <Link
            href={`/dashboard?project=${project.id}`}
            className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase hover:text-accent"
          >
            ← Dashboard
          </Link>

          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-serif text-2xl font-semibold tracking-tight text-balance">
                {project.name}
              </h1>
              {project.summary ? (
                <p className="mt-1 max-w-prose text-sm text-ink-2">
                  {project.summary}
                </p>
              ) : null}
            </div>
            <GenerateButton projectId={project.id} />
          </div>

          <ProjectTabs projectId={project.id} />
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </EvidenceProvider>
  );
}

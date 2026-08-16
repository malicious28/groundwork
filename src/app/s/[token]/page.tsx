import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db/tenant";
import { projects } from "@/db/schema";
import { loadArtifact } from "@/lib/artifacts";
import type { Brief, ProcessArtifact, Prototype } from "@/lib/ai/schemas";
import { resolveShareToken } from "@/lib/share";
import { ClientView } from "@/components/client-view";

/**
 * The forwardable client link: no account, no app, works when passed on.
 *
 * The token establishes the tenant, and everything after that is read inside
 * withTenant like any other request. A token that does not resolve produces the
 * same 404 as one that never existed.
 */

export const metadata: Metadata = {
  title: "Your project",
  // A forwarded link should not turn up in search results.
  robots: { index: false, follow: false },
};

export default async function SharedByTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const share = await resolveShareToken(token);
  if (!share) notFound();

  const [project] = await withTenant(share.orgId, (tx) =>
    tx
      .select({ name: projects.name, clientName: projects.clientName })
      .from(projects)
      .where(
        and(
          eq(projects.orgId, share.orgId),
          eq(projects.id, share.projectId),
        ),
      ),
  );
  if (!project) notFound();

  const [brief, process, prototype] = await Promise.all([
    loadArtifact<Brief>(share.orgId, share.projectId, "brief"),
    loadArtifact<ProcessArtifact>(share.orgId, share.projectId, "process"),
    loadArtifact<Prototype>(share.orgId, share.projectId, "prototype"),
  ]);

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-3">
          <p className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase">
            Shared with {project.clientName}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <ClientView
          projectName={project.name}
          brief={brief?.content ?? null}
          process={process?.content ?? null}
          prototype={prototype?.content ?? null}
        />

        <p className="mt-12 border-t border-line pt-4 font-mono text-[11px] text-muted">
          This is a private link. Anyone who has it can see this page, so forward
          it only to people who should.
        </p>
      </main>
    </>
  );
}

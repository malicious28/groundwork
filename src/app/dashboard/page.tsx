import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { withTenant } from "@/db/tenant";
import { artifacts, openQuestions, projects, sources } from "@/db/schema";
import { AppHeader } from "@/components/app-header";
import { SourceUpload } from "@/components/source-upload";
import { RemoveSource } from "@/components/remove-source";
import { SourceKindBadge } from "@/components/source-kind-badge";
import { GenerateButton } from "@/components/generate-button";
import { NewProjectForm } from "@/components/new-project-form";
import { ProjectSwitcher } from "@/components/project-switcher";

/**
 * The whole product on one screen: pick a project, give it what the client sent
 * you, press the button, read the plan.
 *
 * The deep pages — brief, conflicts, questions, process, outline, prototype —
 * are still there and are where the actual work is read. What this page fixes
 * is that they used to be the *first* thing anybody saw: eight equal tabs with
 * no indication of what to do first, on a project that had nothing in it yet.
 * A panel that puts the three steps in order and hides the rest until they have
 * something in them is not a simpler product, it is the same product admitting
 * what order it happens in.
 */

type Step = { n: number; title: string; done: boolean };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await requireSession("consultant");
  const { project: requested } = await searchParams;

  const data = await withTenant(session.orgId, async (tx) => {
    const projectRows = await tx
      .select({
        id: projects.id,
        name: projects.name,
        clientName: projects.clientName,
        summary: projects.summary,
      })
      .from(projects)
      .where(eq(projects.orgId, session.orgId))
      .orderBy(desc(projects.createdAt))
      .limit(50);

    const selected =
      projectRows.find((row) => row.id === requested) ?? projectRows[0] ?? null;
    if (!selected) return { projectRows, selected: null, sourceRows: [], made: [], openCount: 0 };

    const sourceRows = await tx
      .select()
      .from(sources)
      .where(eq(sources.projectId, selected.id))
      .orderBy(asc(sources.createdAt));

    const made = await tx
      .select({
        kind: artifacts.kind,
        version: artifacts.version,
        grounding: artifacts.grounding,
      })
      .from(artifacts)
      .where(eq(artifacts.projectId, selected.id))
      .orderBy(desc(artifacts.version));

    const [counted] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(openQuestions)
      .where(eq(openQuestions.projectId, selected.id));

    return { projectRows, selected, sourceRows, made, openCount: counted?.n ?? 0 };
  });

  const { projectRows, selected, sourceRows, made, openCount } = data;

  if (!selected) {
    return (
      <>
        <AppHeader session={session} />
        <main className="mx-auto max-w-3xl px-6 py-12">
          <h1 className="mb-2 font-serif text-3xl font-semibold tracking-tight">
            Welcome, {session.name.split(" ")[0]}
          </h1>
          <p className="mb-8 max-w-prose text-ink-2">
            This workspace is empty. Start a project, add whatever the client
            has sent you — recordings, chat exports, documents, screenshots, or
            just what they wrote in an email — and Groundwork will turn it into
            a plan where every line is traceable back to something they
            actually said.
          </p>
          <section className="rounded border border-line bg-surface p-5">
            <NewProjectForm first />
          </section>
        </main>
      </>
    );
  }

  const spanTotal = sourceRows.reduce((total, row) => total + row.spanCount, 0);
  const hasPlan = made.length > 0;
  const grounding = made.find((row) => row.kind === "brief")?.grounding ?? null;
  const hasPrototype = made.some((row) => row.kind === "prototype");
  const latestBrief = made.find((row) => row.kind === "brief")?.version ?? 0;

  const steps: Step[] = [
    { n: 1, title: "Add what the client gave you", done: sourceRows.length > 0 },
    { n: 2, title: "Create the plan", done: hasPlan },
    { n: 3, title: "Read it, and share it", done: hasPlan },
  ];

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight">
              {selected.name}
            </h1>
            <p className="mt-1 text-sm text-muted">
              for {selected.clientName}
              {latestBrief > 0 ? ` · plan v${latestBrief}` : ""}
            </p>
            <Link
              href={`/projects/${selected.id}`}
              className="mt-1 inline-block text-xs text-accent underline underline-offset-2"
            >
              Open the full workspace
            </Link>
          </div>
          <ProjectSwitcher projects={projectRows} currentId={selected.id} />
        </div>

        <ol className="mb-8 flex flex-wrap gap-x-6 gap-y-2 border-y border-line-soft py-3">
          {steps.map((step) => (
            <li key={step.n} className="flex items-center gap-2 text-sm">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] ${
                  step.done
                    ? "bg-accent text-white"
                    : "border border-line text-muted"
                }`}
              >
                {step.done ? "✓" : step.n}
              </span>
              <span className={step.done ? "text-ink-2" : "text-muted"}>
                {step.title}
              </span>
            </li>
          ))}
        </ol>

        {/* ---- 1. resources ------------------------------------------------ */}
        <section className="mb-8">
          <h2 className="mb-1 font-serif text-xl font-semibold">
            1 · Add what the client gave you
          </h2>
          <p className="mb-4 max-w-prose text-sm text-ink-2">
            Anything they produced counts as evidence: a recorded call, a
            WhatsApp export, a PDF, a Word document, a screenshot of the
            spreadsheet they really run on, a page from their website, or a
            paragraph they typed into an email. Nothing needs tidying up first.
          </p>

          <SourceUpload projectId={selected.id} />

          {sourceRows.length === 0 ? (
            <p className="rounded border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
              Nothing added yet.
            </p>
          ) : (
            <>
              <p className="mb-2 font-mono text-[11px] text-muted">
                {sourceRows.length} source{sourceRows.length === 1 ? "" : "s"} ·{" "}
                {spanTotal} quotable spans
              </p>
              <ul className="divide-y divide-line-soft overflow-hidden rounded border border-line bg-surface">
                {sourceRows.map((source) => (
                  <li
                    key={source.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <SourceKindBadge kind={source.kind} />
                      <Link
                        href={`/projects/${selected.id}?source=${source.ref}`}
                        className="truncate text-sm hover:text-accent"
                      >
                        {source.label}
                      </Link>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[11px] text-muted tabular-nums">
                        {source.spanCount} {source.meta?.unitLabel ?? "spans"}
                      </span>
                      <RemoveSource
                        projectId={selected.id}
                        sourceId={source.id}
                        label={source.label}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* ---- 2. generate -------------------------------------------------- */}
        <section className="mb-8">
          <h2 className="mb-1 font-serif text-xl font-semibold">
            2 · Create the plan
          </h2>
          <p className="mb-4 max-w-prose text-sm text-ink-2">
            Groundwork reads every source together and writes six things: a
            requirements brief, the places the sources contradict each other,
            the questions nobody has answered, a better process, a solution
            outline, and a working demo of the tool being proposed. Every
            statement is quoted back to the sentence it came from and checked
            against it.
          </p>
          {sourceRows.length === 0 ? (
            <p className="rounded border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
              Add at least one source first.
            </p>
          ) : (
            <GenerateButton projectId={selected.id} />
          )}
        </section>

        {/* ---- 3. read it --------------------------------------------------- */}
        {hasPlan ? (
          <section>
            <h2 className="mb-1 font-serif text-xl font-semibold">
              3 · Read it, and share it
            </h2>
            {grounding ? (
              <p className="mb-4 max-w-prose text-sm text-ink-2">
                <strong className="font-medium text-ink">
                  {Math.round(grounding.score * 100)}% grounded
                </strong>{" "}
                — {grounding.verifiedCount} of {grounding.claimCount} statements
                were matched word for word to something in the sources. The rest
                are marked as assumptions rather than hidden.
              </p>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <PlanLink
                href={`/projects/${selected.id}/brief`}
                title="The brief"
                detail="What they need, quoted back to them"
              />
              <PlanLink
                href={`/projects/${selected.id}/conflicts`}
                title="Contradictions"
                detail="Where the sources disagree with each other"
              />
              <PlanLink
                href={`/projects/${selected.id}/questions`}
                title="Open questions"
                detail={
                  openCount > 0
                    ? `${openCount} still unanswered`
                    : "Nothing outstanding"
                }
              />
              <PlanLink
                href={`/projects/${selected.id}/process`}
                title="A better process"
                detail="How it runs today, and what to change"
              />
              <PlanLink
                href={`/projects/${selected.id}/outline`}
                title="Solution outline"
                detail="Roles, modules and prioritised features"
              />
              {hasPrototype ? (
                <PlanLink
                  href={`/projects/${selected.id}/prototype`}
                  title="Try the demo"
                  detail="A working tool, not a picture of one"
                />
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <Link
                href={`/projects/${selected.id}/compare`}
                className="text-accent underline underline-offset-2"
              >
                Compare this plan with an earlier run
              </Link>
              <Link
                href={`/projects/${selected.id}`}
                className="text-accent underline underline-offset-2"
              >
                Open the full evidence ledger
              </Link>
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}

function PlanLink({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="rounded border border-line bg-surface px-4 py-3 hover:border-accent"
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-muted">{detail}</p>
    </Link>
  );
}

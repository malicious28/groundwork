import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { requireSessionPage } from "@/lib/auth/session";
import { withTenant } from "@/db/tenant";
import { isUuid } from "@/lib/ids";
import { openQuestions, projects } from "@/db/schema";
import { EmptyStage } from "@/components/empty-stage";
import { QuestionPack } from "@/components/question-pack";
import { QuestionActions } from "@/components/question-actions";

const CATEGORY_LABELS: Record<string, string> = {
  budget: "Budget",
  timeline: "Timeline",
  users_and_roles: "Users & roles",
  integrations: "Integrations",
  data_migration: "Data migration",
  auth_and_access: "Access",
  success_metrics: "Success metrics",
  compliance: "Compliance",
  support: "Support",
  other: "Other",
};

export default async function QuestionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSessionPage("consultant");
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const { questions, project } = await withTenant(session.orgId, async (tx) => {
    const questions = await tx
      .select()
      .from(openQuestions)
      .where(
        and(
          eq(openQuestions.orgId, session.orgId),
          eq(openQuestions.projectId, id),
        ),
      )
      .orderBy(desc(openQuestions.priority));

    const [project] = await tx
      .select({ clientName: projects.clientName })
      .from(projects)
      .where(eq(projects.id, id));

    return { questions, project };
  });

  if (questions.length === 0) {
    return <EmptyStage what="The questions nobody has answered" />;
  }

  const outstanding = questions.filter(
    (question) => question.status === "open" || question.status === "asked",
  );
  const closed = questions.filter(
    (question) => question.status === "answered" || question.status === "dismissed",
  );

  return (
    <>
      <h2 className="mb-1 font-serif text-xl font-semibold">
        Blind-spot register
      </h2>
      <p className="mb-6 max-w-prose text-sm text-muted">
        Checked against what a delivery team needs before starting. These are the
        places the sources are silent or ambiguous. An answer recorded here is
        carried into the next discovery run, so the brief stops treating it as a
        gap.
      </p>

      {outstanding.length > 0 ? (
        <>
          <h3 className="mb-3 font-mono text-[11px] tracking-[0.1em] text-gap uppercase">
            Outstanding · {outstanding.length}
          </h3>
          <ul className="mb-8 flex flex-col gap-3">
            {outstanding.map((question) => (
              <li
                key={question.id}
                className="rounded border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="rounded border border-gap bg-gap-soft px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-gap uppercase">
                    {CATEGORY_LABELS[question.category] ?? question.category}
                  </span>
                  {question.priority === 3 ? (
                    <span className="font-mono text-[10px] text-flag uppercase">
                      Blocks the build
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 max-w-prose font-medium">
                  {question.question}
                </p>
                <p className="mt-1.5 max-w-prose text-sm text-muted">
                  {question.whyItMatters}
                </p>
                <QuestionActions
                  projectId={id}
                  questionId={question.id}
                  status={question.status}
                  answer={question.answer}
                />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mb-8 rounded border border-accent bg-accent-soft px-4 py-3 text-sm text-accent">
          Every question has been answered or set aside.
        </p>
      )}

      {outstanding.length > 0 ? (
        <div className="mb-8">
          <QuestionPack
            clientName={project?.clientName ?? "the client"}
            questions={outstanding.map((question) => question.question)}
          />
        </div>
      ) : null}

      {closed.length > 0 ? (
        <>
          <h3 className="mb-3 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
            Closed · {closed.length}
          </h3>
          <ul className="flex flex-col gap-3">
            {closed.map((question) => (
              <li
                key={question.id}
                className="rounded border border-line bg-surface p-4"
              >
                <p className="max-w-prose text-sm font-medium">
                  {question.question}
                </p>
                <QuestionActions
                  projectId={id}
                  questionId={question.id}
                  status={question.status}
                  answer={question.answer}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

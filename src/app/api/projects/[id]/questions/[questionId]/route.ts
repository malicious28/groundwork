import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireSession, AuthError } from "@/lib/auth/session";
import { withTenant } from "@/db/tenant";
import { openQuestions } from "@/db/schema";

export const runtime = "nodejs";

/**
 * Working an open question through to an answer.
 *
 * The three states are the ones a consultant actually moves between: raised,
 * sent to the client, answered. `dismissed` is the fourth outcome — the question
 * turned out not to matter — and is kept distinct from answered so the record
 * does not pretend a client said something they never did.
 */
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("asked") }),
  z.object({
    action: z.literal("answered"),
    answer: z.string().min(1).max(4000),
  }),
  z.object({ action: z.literal("dismissed") }),
  z.object({ action: z.literal("reopen") }),
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; questionId: string }> },
) {
  try {
    const session = await requireSession("consultant");
    const { id, questionId } = await params;

    const parsed = Action.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: "That is not something this endpoint can do to a question." },
        { status: 400 },
      );
    }
    const action = parsed.data;

    const updated = await withTenant(session.orgId, async (tx) => {
      const [question] = await tx
        .select()
        .from(openQuestions)
        .where(
          and(
            eq(openQuestions.orgId, session.orgId),
            eq(openQuestions.projectId, id),
            eq(openQuestions.id, questionId),
          ),
        );
      if (!question) return null;

      const patch =
        action.action === "answered"
          ? {
              status: "answered" as const,
              answer: action.answer.trim(),
              answeredAt: new Date(),
            }
          : action.action === "reopen"
            ? {
                status: "open" as const,
                answer: null,
                answeredAt: null,
              }
            : { status: action.action };

      const [row] = await tx
        .update(openQuestions)
        .set(patch)
        .where(eq(openQuestions.id, question.id))
        .returning();
      return row;
    });

    if (!updated) {
      return Response.json({ error: "Question not found." }, { status: 404 });
    }
    return Response.json({ question: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

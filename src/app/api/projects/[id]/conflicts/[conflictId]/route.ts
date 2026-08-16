import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireSession, AuthError } from "@/lib/auth/session";
import { withTenant } from "@/db/tenant";
import { conflicts, conflictSides } from "@/db/schema";

export const runtime = "nodejs";

/**
 * Recording what a consultant decided about a contradiction.
 *
 * A decision is not just a status flip. `resolution` keeps the reasoning in
 * prose, because the next person to read this — or the model, on the next
 * generation run — needs to know *why* the five-lakh figure won, not merely
 * that it did.
 */
const Decision = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("resolve"),
    /** The conflict side that stands. Omitted when neither does. */
    sideId: z.string().uuid().optional(),
    note: z.string().max(2000).optional(),
  }),
  z.object({ action: z.literal("dismiss"), note: z.string().max(2000).optional() }),
  z.object({ action: z.literal("reopen") }),
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; conflictId: string }> },
) {
  try {
    const session = await requireSession("consultant");
    const { id, conflictId } = await params;

    const parsed = Decision.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: "That is not a decision this endpoint understands." },
        { status: 400 },
      );
    }
    const decision = parsed.data;

    const updated = await withTenant(session.orgId, async (tx) => {
      const [conflict] = await tx
        .select()
        .from(conflicts)
        .where(
          and(
            eq(conflicts.orgId, session.orgId),
            eq(conflicts.projectId, id),
            eq(conflicts.id, conflictId),
          ),
        );
      if (!conflict) return null;

      if (decision.action === "reopen") {
        const [row] = await tx
          .update(conflicts)
          .set({
            status: "open",
            resolution: null,
            resolvedBy: null,
            resolvedAt: null,
          })
          .where(eq(conflicts.id, conflict.id))
          .returning();
        return row;
      }

      // Build the decision sentence from the side that was chosen, so the
      // record reads as a decision rather than a checkbox.
      let resolution = decision.note?.trim() || "";
      if (decision.action === "resolve" && decision.sideId) {
        const [side] = await tx
          .select()
          .from(conflictSides)
          .where(
            and(
              eq(conflictSides.conflictId, conflict.id),
              eq(conflictSides.id, decision.sideId),
            ),
          );
        if (side) {
          const attribution = side.speaker ? ` (${side.speaker})` : "";
          resolution =
            `Agreed: ${side.stance}${attribution}.` +
            (resolution ? ` ${resolution}` : "");
        }
      }
      if (!resolution) {
        resolution =
          decision.action === "dismiss"
            ? "Dismissed — not a real contradiction."
            : "Resolved.";
      }

      const [row] = await tx
        .update(conflicts)
        .set({
          status: decision.action === "dismiss" ? "dismissed" : "resolved",
          resolution,
          resolvedBy: session.userId,
          resolvedAt: new Date(),
        })
        .where(eq(conflicts.id, conflict.id))
        .returning();
      return row;
    });

    if (!updated) {
      return Response.json({ error: "Conflict not found." }, { status: 404 });
    }
    return Response.json({ conflict: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

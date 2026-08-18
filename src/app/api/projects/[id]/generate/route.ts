import { and, eq } from "drizzle-orm";
import { requireSession, AuthError } from "@/lib/auth/session";
import { isUuid } from "@/lib/ids";
import { withTenant } from "@/db/tenant";
import { projects } from "@/db/schema";
import { runDiscovery, type ProgressEvent } from "@/lib/ai/generate";

export const runtime = "nodejs";
/**
 * Six sequential model calls over a long corpus. Vercel's fluid compute allows
 * 300s on every plan; the work is streamed so the connection stays alive and
 * the reader watches each stage land.
 */
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireSession("consultant");
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return Response.json({ error: "That could not be found." }, { status: 404 });
  }

  // Re-checked here rather than trusted from the URL: middleware never touches
  // the database, so this is the first point at which ownership is known.
  const [project] = await withTenant(session.orgId, (tx) =>
    tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.orgId, session.orgId), eq(projects.id, id))),
  );

  if (!project) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: ProgressEvent) => {
        if (!open) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      /*
       * A comment line every fifteen seconds, which SSE readers ignore.
       *
       * A single stage can run for five minutes without producing an event —
       * the prototype writes a whole working page before it says anything —
       * and anything between here and the browser treats a silent connection
       * as a dead one. Node's own fetch gives up after five minutes, and a
       * proxy or a serverless platform will do the same or worse. The work
       * carries on server-side, so what the reader loses is not the analysis
       * but any sight of it, which is indistinguishable from a hang.
       */
      const heartbeat = setInterval(() => {
        if (open) controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 15_000);

      try {
        await runDiscovery(session, project.id, send);
      } catch (error) {
        send({
          type: "error",
          detail: error instanceof Error ? error.message : "Generation failed.",
        });
      } finally {
        clearInterval(heartbeat);
        open = false;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Nginx and some proxies buffer streamed responses without this.
      "x-accel-buffering": "no",
    },
  });
}

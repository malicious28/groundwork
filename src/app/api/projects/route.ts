import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { withTenant } from "@/db/tenant";
import { projects } from "@/db/schema";

export const runtime = "nodejs";

const NewProject = z.object({
  name: z.string().min(1).max(160),
  clientName: z.string().min(1).max(160),
  summary: z.string().max(600).optional(),
});

export async function POST(request: Request) {
  const session = await requireSession("consultant");
  const parsed = NewProject.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Give the project a name and say who the client is." },
      { status: 400 },
    );
  }

  const [project] = await withTenant(session.orgId, (tx) =>
    tx
      .insert(projects)
      .values({
        orgId: session.orgId,
        name: parsed.data.name.trim(),
        clientName: parsed.data.clientName.trim(),
        summary: parsed.data.summary?.trim() || null,
        createdBy: session.userId,
      })
      .returning(),
  );

  if (!project) {
    return NextResponse.json({ error: "Could not create the project." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: project.id });
}

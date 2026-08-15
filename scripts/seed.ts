import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq, inArray } from "drizzle-orm";
import { getDb, describeDriver } from "../src/db";
import {
  organizations,
  users,
  memberships,
  projects,
  sources,
  evidenceSpans,
  type SourceKind,
} from "../src/db/schema";
import { withTenant } from "../src/db/tenant";
import { hashPassword } from "../src/lib/auth/password";
import { parseSource } from "../src/lib/parsers";

/**
 * Seeds the Nova Interiors demo.
 *
 * Two organizations are created, not one. The second exists so that tenant
 * isolation is something a reviewer can see rather than something the README
 * asserts: sign in as Northwind and Meridian's project is not merely hidden
 * from the list, it cannot be reached by URL either.
 *
 * Everything below the organization row goes through withTenant, exactly like a
 * request does. There is no privileged seeding path, so if the policies were
 * wrong this script would fail rather than quietly writing rows the app can
 * never read back.
 */

const FIXTURES = resolve(process.cwd(), "fixtures/nova-interiors");
const PASSWORD = "demo1234";

type SourceFixture = {
  ref: string;
  kind: SourceKind;
  label: string;
  file: string;
  filename: string;
  mimeType: string;
};

const NOVA_SOURCES: SourceFixture[] = [
  {
    ref: "kickoff-call",
    kind: "transcript",
    label: "Kickoff call — 12 March",
    file: "kickoff-call.vtt",
    filename: "Nova Interiors - discovery call 1.vtt",
    mimeType: "text/vtt",
  },
  {
    ref: "followup-call",
    kind: "transcript",
    label: "Follow-up call — 26 March",
    file: "followup-call.vtt",
    filename: "Nova Interiors - discovery call 2.vtt",
    mimeType: "text/vtt",
  },
  {
    ref: "whatsapp-site-group",
    kind: "whatsapp",
    label: "WhatsApp — Kharadi site group",
    file: "whatsapp-site-coordination.txt",
    filename: "WhatsApp Chat with Nova - Kharadi 3BHK - Site.txt",
    mimeType: "text/plain",
  },
  {
    ref: "handover-sop",
    // The fixture holds the text a DOCX extractor produces, so the shape of
    // this row matches what the upload path will write once that extractor
    // lands. The binary itself is not in the repository.
    kind: "docx",
    label: "Project Handover SOP v3.1",
    file: "project-handover-sop.md",
    filename: "Nova Interiors - Project Handover SOP v3.1.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
];

async function main() {
  const db = getDb();
  console.log(`→ driver: ${describeDriver()}`);

  // Idempotent: re-seeding replaces the demo rather than duplicating it.
  const slugs = ["meridian", "northwind"];
  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(inArray(organizations.slug, slugs));
  if (existing.length > 0) {
    await db.delete(organizations).where(inArray(organizations.slug, slugs));
    console.log(`✓ cleared ${existing.length} existing demo organization(s)`);
  }
  await db
    .delete(users)
    .where(
      inArray(users.email, [
        "ashika@meridian.example",
        "rohit@novainteriors.example",
        "dev@northwind.example",
      ]),
    );

  const [meridian] = await db
    .insert(organizations)
    .values({ name: "Meridian Digital", slug: "meridian" })
    .returning();
  const [northwind] = await db
    .insert(organizations)
    .values({ name: "Northwind Studio", slug: "northwind" })
    .returning();
  if (!meridian || !northwind) throw new Error("organization insert failed");

  const passwordHash = await hashPassword(PASSWORD);
  const inserted = await db
    .insert(users)
    .values([
      {
        email: "ashika@meridian.example",
        name: "Ashika Panigrahi",
        passwordHash,
      },
      { email: "rohit@novainteriors.example", name: "Rohit Menon", passwordHash },
      { email: "dev@northwind.example", name: "Nikhil Rao", passwordHash },
    ])
    .returning();

  const byEmail = new Map(inserted.map((u) => [u.email, u]));
  const consultant = byEmail.get("ashika@meridian.example")!;
  const client = byEmail.get("rohit@novainteriors.example")!;
  const otherTenant = byEmail.get("dev@northwind.example")!;

  await withTenant(meridian.id, async (tx) => {
    await tx.insert(memberships).values([
      { orgId: meridian.id, userId: consultant.id, role: "owner" },
      { orgId: meridian.id, userId: client.id, role: "client" },
    ]);
  });
  await withTenant(northwind.id, async (tx) => {
    await tx.insert(memberships).values({
      orgId: northwind.id,
      userId: otherTenant.id,
      role: "owner",
    });
  });
  console.log("✓ organizations, users and memberships created");

  // --- Meridian's Nova Interiors engagement --------------------------------
  await withTenant(meridian.id, async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        orgId: meridian.id,
        name: "Nova Interiors — client portal discovery",
        clientName: "Nova Interiors",
        summary:
          "40-person interior fit-out firm in Pune running client projects on WhatsApp, email and a shared spreadsheet.",
        createdBy: consultant.id,
        shareToken: "nova-demo-share",
      })
      .returning();
    if (!project) throw new Error("project insert failed");

    for (const fixture of NOVA_SOURCES) {
      const content = readFileSync(resolve(FIXTURES, fixture.file), "utf8");
      const parsed = parseSource(content, fixture.kind, fixture.filename);

      const [source] = await tx
        .insert(sources)
        .values({
          orgId: meridian.id,
          projectId: project.id,
          ref: fixture.ref,
          kind: fixture.kind,
          label: fixture.label,
          filename: fixture.filename,
          mimeType: fixture.mimeType,
          byteSize: Buffer.byteLength(content, "utf8"),
          rawText: parsed.text,
          parseStatus: "ready",
          spanCount: parsed.spans.length,
          meta: parsed.meta,
        })
        .returning();
      if (!source) throw new Error(`source insert failed: ${fixture.ref}`);

      if (parsed.spans.length > 0) {
        await tx.insert(evidenceSpans).values(
          parsed.spans.map((span) => ({
            orgId: meridian.id,
            projectId: project.id,
            sourceId: source.id,
            idx: span.idx,
            speaker: span.speaker ?? null,
            tsLabel: span.tsLabel ?? null,
            occurredAt: span.occurredAt ?? null,
            text: span.text,
            charStart: span.charStart,
            charEnd: span.charEnd,
          })),
        );
      }

      const participants = parsed.meta.participants?.length
        ? ` · ${parsed.meta.participants.length} participants`
        : "";
      console.log(
        `  · ${fixture.ref.padEnd(20)} ${String(parsed.spans.length).padStart(3)} spans${participants}`,
      );
    }
  });

  // --- Northwind's unrelated project, for the isolation demo ---------------
  await withTenant(northwind.id, async (tx) => {
    await tx.insert(projects).values({
      orgId: northwind.id,
      name: "Ellis & Co — booking flow review",
      clientName: "Ellis & Co",
      summary: "Unrelated tenant. Exists so isolation can be demonstrated.",
      createdBy: otherTenant.id,
    });
  });

  console.log("\n✓ seed complete");
  console.log("\n  Sign in at /login with password:", PASSWORD);
  console.log("    ashika@meridian.example       consultant/owner, Meridian");
  console.log("    rohit@novainteriors.example   client, read-only");
  console.log("    dev@northwind.example         other tenant — sees none of it");

  process.exit(0);
}

main().catch((err) => {
  console.error("✗ seed failed");
  console.error(err);
  process.exit(1);
});

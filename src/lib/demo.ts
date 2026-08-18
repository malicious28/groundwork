import type { SourceKind } from "@/db/schema";

/**
 * The demo, in one place: the accounts and the documents that make it up.
 *
 * Both lists had copies elsewhere — the credentials on the sign-in screen and
 * in the seed's output, the documents in the seed script and again in the test
 * that verifies every recorded citation against them. The second duplication
 * had already gone wrong: adding two sources to the demo left the test checking
 * quotes against a corpus that no longer matched, and it reported them all as
 * fabricated. One list, read by everything.
 */

export const DEMO_PASSWORD = "demo1234";

export const DEMO_ACCOUNTS = [
  {
    email: "ashika@meridian.example",
    description: "the consultant — the full workspace, with the demo project",
  },
  {
    email: "rohit@novainteriors.example",
    description: "their client — sees only what was shared, read-only",
  },
  {
    email: "dev@northwind.example",
    description: "an unrelated firm — proof that it sees none of the above",
  },
] as const;

export type DemoSource = {
  ref: string;
  kind: SourceKind;
  label: string;
  /** The text of the source, as its extractor would have produced it. */
  file: string;
  filename: string;
  mimeType: string;
  /** For screenshots: the image attached alongside the transcription. */
  image?: string;
};

/**
 * Six documents in five formats, which is the point of them: a client sends
 * whatever they have, and the tool has to read a recorded call, a chat export,
 * a contract PDF and a screenshot of a spreadsheet as equally citable evidence.
 * Order is fixed — it is the order the corpus is assembled in, and the prompt
 * cache is a prefix match.
 */
export const DEMO_SOURCES: DemoSource[] = [
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
    ref: "vendor-terms",
    kind: "pdf",
    label: "Vendor terms (extract)",
    file: "vendor-terms.txt",
    filename: "Nova Interiors - vendor terms extract.pdf",
    mimeType: "application/pdf",
  },
  {
    ref: "master-tracker",
    // The transcription a vision model produces at upload, kept as a fixture
    // for the same reason as the DOCX below: the demo has to work with no API
    // key, and this is exactly the text the live path would have written. The
    // image itself is attached separately so the screenshot is still shown.
    kind: "image",
    label: "Screenshot — the master tracker",
    file: "master-tracker-transcription.md",
    filename: "master tracker - kharadi tab.png",
    mimeType: "image/png",
    image: "master-tracker-screenshot.png",
  },
  {
    ref: "handover-sop",
    // The fixture holds the text a DOCX extractor produces, so the shape of
    // this row matches what the upload path writes once that extractor runs.
    kind: "docx",
    label: "Project Handover SOP v3.1",
    file: "project-handover-sop.md",
    filename: "Nova Interiors - Project Handover SOP v3.1.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
];

/** Every ref the recorded analysis was written against. */
export const DEMO_SOURCE_REFS = DEMO_SOURCES.map((source) => source.ref);

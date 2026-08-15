import type { Db } from "@/db";
import { evidenceSpans, sources, type SourceKind } from "@/db/schema";
import { detectKind, parseSource } from "@/lib/parsers";
import {
  detectBinaryKind,
  extractDocx,
  extractPdf,
  IMAGE_MIME_TYPES,
} from "@/lib/parsers/documents";

/**
 * One file in, one source plus its evidence spans out.
 *
 * The kind is decided from the file's own bytes before its name or the
 * browser's MIME guess, because both of those are frequently wrong: WhatsApp
 * exports arrive as `_chat.txt`, and a Teams transcript saved from a browser
 * can land as `.txt` too.
 */

export type IngestResult = {
  ref: string;
  kind: SourceKind;
  spanCount: number;
  notes: string[];
};

/** Stable, readable handle used in prompts and citations. */
export function refFromFilename(filename: string, taken: Set<string>): string {
  const base =
    filename
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "source";

  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export async function ingestFile(
  tx: Db,
  scope: { orgId: string; projectId: string },
  file: { name: string; type: string; bytes: Uint8Array },
  ref: string,
): Promise<IngestResult> {
  const binaryKind = detectBinaryKind(file.bytes, file.name);
  const notes: string[] = [];

  let kind: SourceKind;
  let text: string;

  if (binaryKind === "pdf") {
    kind = "pdf";
    const extracted = await extractPdf(file.bytes);
    text = extracted.text;
    notes.push(...extracted.notes);
  } else if (binaryKind === "docx") {
    kind = "docx";
    const extracted = await extractDocx(file.bytes);
    text = extracted.text;
    notes.push(...extracted.notes);
  } else if (binaryKind === "image" || IMAGE_MIME_TYPES.has(file.type)) {
    kind = "image";
    text = "";
    notes.push(
      "Screenshots are read by the model at generation time rather than extracted to text here.",
    );
  } else {
    text = new TextDecoder().decode(file.bytes);
    kind = detectKind(text, file.name);
  }

  const parsed = text.trim()
    ? parseSource(text, kind, file.name)
    : { text: "", spans: [], meta: {} };

  const [row] = await tx
    .insert(sources)
    .values({
      orgId: scope.orgId,
      projectId: scope.projectId,
      ref,
      kind,
      label: file.name.replace(/\.[^.]+$/, ""),
      filename: file.name,
      mimeType: file.type || null,
      byteSize: file.bytes.byteLength,
      rawText: parsed.text,
      // An image has no extractable text but is not a parse failure; it is
      // ready to be used, just by a different route.
      parseStatus: parsed.text.trim() || kind === "image" ? "ready" : "failed",
      parseError: parsed.text.trim() || kind === "image"
        ? null
        : "No readable text could be extracted from this file.",
      spanCount: parsed.spans.length,
      meta: {
        ...parsed.meta,
        notes: [...(parsed.meta.notes ?? []), ...notes],
      },
    })
    .returning();

  if (!row) throw new Error(`could not store ${file.name}`);

  if (parsed.spans.length > 0) {
    await tx.insert(evidenceSpans).values(
      parsed.spans.map((span) => ({
        orgId: scope.orgId,
        projectId: scope.projectId,
        sourceId: row.id,
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

  return { ref, kind, spanCount: parsed.spans.length, notes };
}

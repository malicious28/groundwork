import type { SourceKind } from "@/db/schema";

/**
 * Binary document extraction: PDF and DOCX to plain text, before the text
 * parsers in this folder take over.
 *
 * PDF uses `unpdf` rather than the more widely installed `pdf-parse`. unpdf is
 * a serverless-oriented repackaging of PDF.js with no native dependencies, so
 * it builds on Vercel unmodified; pdf-parse pulls in a native `canvas` binding
 * that does not, and is effectively unmaintained besides.
 *
 * DOCX uses `mammoth`, converting to HTML rather than raw text so headings and
 * lists survive — structure is signal when the document is somebody's process
 * SOP, and both a reader and the model use it.
 */

export type ExtractionResult = {
  text: string;
  pageCount?: number;
  /** True when a PDF yielded almost no text, i.e. it is a scan. */
  looksScanned?: boolean;
  notes: string[];
};

export async function extractPdf(data: Uint8Array): Promise<ExtractionResult> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });

  const merged = (Array.isArray(text) ? text.join("\n\n") : text).trim();
  const notes: string[] = [`${totalPages} page${totalPages === 1 ? "" : "s"}.`];

  // A PDF of scanned pages extracts to almost nothing. Saying so is much more
  // useful than handing the model an empty document and letting it invent one.
  const charsPerPage = merged.length / Math.max(totalPages, 1);
  const looksScanned = charsPerPage < 50;
  if (looksScanned) {
    notes.push(
      "Very little extractable text — this looks like a scan. It will be read as images instead.",
    );
  }

  return { text: normaliseExtracted(merged), pageCount: totalPages, looksScanned, notes };
}

export async function extractDocx(data: Uint8Array): Promise<ExtractionResult> {
  const mammoth = await import("mammoth");
  const { value, messages } = await mammoth.convertToHtml({
    buffer: Buffer.from(data),
  });

  const notes: string[] = [];
  const warnings = messages.filter(
    (message: { type: string }) => message.type === "warning",
  );
  if (warnings.length > 0) {
    notes.push(
      `${warnings.length} formatting element${warnings.length === 1 ? "" : "s"} could not be converted (images and text boxes are dropped).`,
    );
  }

  return { text: normaliseExtracted(htmlToText(value)), notes };
}

/**
 * Flattens mammoth's HTML to text while keeping the structure that carries
 * meaning: headings become Markdown headings, list items keep their bullet, and
 * every block ends in a blank line so the text parser can find its boundaries.
 *
 * A dedicated HTML-to-Markdown library would do this more thoroughly, but the
 * subset mammoth emits from a Word document is small and known, and one fewer
 * dependency in the ingestion path is worth more here than completeness.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<h([1-6])[^>]*>/gi, (_match, level: string) => `\n\n${"#".repeat(Number(level))} `)
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<\/(p|div|tr|ul|ol|table)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<t[dh][^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Extractors emit ragged whitespace — PDF especially, where a line break in the
 * layout becomes a newline mid-sentence. Blank lines are preserved because the
 * text parser uses them to find block boundaries.
 */
function normaliseExtracted(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK.. — DOCX is a zip

/** Content sniffing, because file extensions lie and MIME types are optional. */
export function detectBinaryKind(
  data: Uint8Array,
  filename?: string,
): SourceKind | null {
  const starts = (magic: number[]) => magic.every((b, i) => data[i] === b);

  if (starts(PDF_MAGIC)) return "pdf";
  if (starts(ZIP_MAGIC)) {
    // Both DOCX and XLSX are zips; the filename settles which.
    return /\.docx$/i.test(filename ?? "") ? "docx" : "docx";
  }
  if (
    starts([0xff, 0xd8, 0xff]) || // JPEG
    starts([0x89, 0x50, 0x4e, 0x47]) || // PNG
    starts([0x47, 0x49, 0x46]) // GIF
  ) {
    return "image";
  }
  return null;
}

export const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

import type { SourceKind } from "@/db/schema";
import type { ParsedDocument } from "./types";
import { isVtt, parseVtt } from "./vtt";
import { isWhatsAppExport, parseWhatsApp } from "./whatsapp";
import { parseText } from "./text";

export type { ParsedDocument, ParsedSpan } from "./types";
export { parseVtt, isVtt } from "./vtt";
export { parseWhatsApp, isWhatsAppExport } from "./whatsapp";
export { parseText } from "./text";

/**
 * Picks a parser from the content itself rather than from the file extension.
 *
 * People rename files, WhatsApp exports arrive as `_chat.txt`, and a Teams
 * transcript saved from a browser can land as `.txt` too. Sniffing the first
 * few lines is both more reliable and lets the UI tell the user what it thinks
 * a file is before anything is generated from it.
 */
export function detectKind(
  content: string,
  filename?: string,
): Exclude<SourceKind, "pdf" | "docx" | "image" | "webpage"> {
  if (isVtt(content)) return "transcript";
  if (isWhatsAppExport(content)) return "whatsapp";

  const name = (filename ?? "").toLowerCase();
  if (name.endsWith(".vtt") || name.endsWith(".srt")) return "transcript";
  return "note";
}

/**
 * `kind` is what the ingestion pipeline decided, which may come from the file's
 * MIME type (a PDF is a PDF whatever its text looks like). Text-shaped kinds
 * still get sniffed, because that is where the ambiguity actually lives.
 */
export function parseSource(
  content: string,
  kind: SourceKind,
  filename?: string,
): ParsedDocument {
  switch (kind) {
    case "transcript":
      return isVtt(content) ? parseVtt(content) : parseText(content);
    case "whatsapp":
      return parseWhatsApp(content);
    case "pdf":
    case "docx":
    case "image":
    case "webpage":
      // These arrive already flattened to text by their extractor.
      return parseText(content);
    case "note":
    default: {
      const detected = detectKind(content, filename);
      if (detected === "transcript") return parseVtt(content);
      if (detected === "whatsapp") return parseWhatsApp(content);
      return parseText(content);
    }
  }
}

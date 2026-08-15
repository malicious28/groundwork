import type { ParsedDocument, ParsedSpan } from "./types";

/**
 * Plain text, Markdown, and anything a richer parser has already flattened
 * (extracted PDF or DOCX text arrives here).
 *
 * Unlike the transcript and chat parsers, this one keeps the document exactly
 * as written — there is no scaffolding worth stripping, and a process document
 * quoted back to a client should read the way the client wrote it. Offsets
 * therefore index into the original content.
 *
 * Blocks are separated by blank lines, which matches how both prose and
 * Markdown are actually written. Each block carries the nearest heading above
 * it so a citation can say where in a long document it came from.
 */

const HEADING = /^#{1,6}\s+(.*)$/;

export function parseText(content: string): ParsedDocument {
  const text = content.replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  const spans: ParsedSpan[] = [];

  let cursor = 0;
  let heading: string | null = null;

  for (const rawBlock of text.split(/\n{2,}/)) {
    const start = text.indexOf(rawBlock, cursor);
    if (start === -1) continue;
    cursor = start + rawBlock.length;

    const block = rawBlock.trim();
    if (block === "") continue;

    // Leading whitespace inside the block must not be counted into the span,
    // or a highlight would begin a line early.
    const offset = rawBlock.indexOf(block);
    const charStart = start + offset;

    const headingMatch = block.split("\n")[0]!.match(HEADING);
    if (headingMatch) heading = headingMatch[1]!.trim();

    spans.push({
      idx: spans.length + 1,
      speaker: null,
      tsLabel: heading,
      text: block,
      charStart,
      charEnd: charStart + block.length,
    });
  }

  return {
    text,
    spans,
    meta: { unitCount: spans.length, unitLabel: "sections" },
  };
}

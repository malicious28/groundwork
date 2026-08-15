import type { SourceMeta } from "@/db/schema";

/**
 * Every parser produces the same shape, whatever it consumed.
 *
 * `text` is the normalised rendering of the document: what the reader is shown
 * in the source panel, and what the model is given in the prompt. The uploaded
 * file itself is kept in blob storage untouched, but it is deliberately *not*
 * what offsets refer to — a WhatsApp export and a VTT file are full of
 * scaffolding that helps neither a person nor a model.
 *
 * `charStart` and `charEnd` on each span index into `text`, and they bound the
 * utterance only, not the `[12:04] Priya Nair:` prefix in front of it. That
 * keeps a quote lookup honest: a model quoting what someone said will match the
 * words it was shown.
 */
export type ParsedSpan = {
  /** 1-based ordinal within the document. */
  idx: number;
  speaker?: string | null;
  /** Human-readable anchor: `00:14:32` for a call, `12 Mar, 4:31 pm` for chat. */
  tsLabel?: string | null;
  occurredAt?: Date | null;
  text: string;
  charStart: number;
  charEnd: number;
};

export type ParsedDocument = {
  text: string;
  spans: ParsedSpan[];
  meta: SourceMeta;
};

/** Accumulates the normalised text while keeping every offset truthful. */
export class SpanBuilder {
  private parts: string[] = [];
  private cursor = 0;
  private spans: ParsedSpan[] = [];

  /**
   * Appends one rendered line and records the span. `prefix` is written to the
   * output but excluded from the span's offsets.
   */
  add(
    prefix: string,
    body: string,
    attrs: Omit<ParsedSpan, "idx" | "text" | "charStart" | "charEnd"> = {},
  ): void {
    if (this.parts.length > 0) {
      this.parts.push("\n");
      this.cursor += 1;
    }
    this.parts.push(prefix);
    this.cursor += prefix.length;

    const charStart = this.cursor;
    this.parts.push(body);
    this.cursor += body.length;

    this.spans.push({
      idx: this.spans.length + 1,
      text: body,
      charStart,
      charEnd: this.cursor,
      ...attrs,
    });
  }

  build(meta: SourceMeta = {}): ParsedDocument {
    const text = this.parts.join("");
    const dated = this.spans
      .map((s) => s.occurredAt)
      .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    return {
      text,
      spans: this.spans,
      meta: {
        ...meta,
        unitCount: this.spans.length,
        ...(dated.length > 0
          ? {
              firstOccurredAt: dated[0]!.toISOString(),
              lastOccurredAt: dated[dated.length - 1]!.toISOString(),
            }
          : {}),
      },
    };
  }
}

/** Distinct speakers, in first-appearance order. */
export function participantsOf(spans: ParsedSpan[]): string[] {
  const seen = new Set<string>();
  for (const s of spans) {
    if (s.speaker) seen.add(s.speaker);
  }
  return [...seen];
}

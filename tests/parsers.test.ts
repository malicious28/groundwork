import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseVtt, isVtt } from "../src/lib/parsers/vtt";
import { parseWhatsApp, isWhatsAppExport } from "../src/lib/parsers/whatsapp";
import { parseText } from "../src/lib/parsers/text";
import { detectKind, parseSource } from "../src/lib/parsers";
import type { ParsedDocument } from "../src/lib/parsers/types";

const FIXTURES = resolve(process.cwd(), "fixtures/nova-interiors");
const read = (name: string) => readFileSync(resolve(FIXTURES, name), "utf8");

/**
 * The invariant every citation in the product depends on: a span's recorded
 * offsets must select exactly that span's text out of the document the reader
 * is shown. If this drifts, highlights land on the wrong words and the
 * grounding score becomes a lie told confidently.
 */
function expectOffsetsAddressTheirText(doc: ParsedDocument) {
  for (const span of doc.spans) {
    expect(doc.text.slice(span.charStart, span.charEnd)).toBe(span.text);
  }
}

describe("VTT transcripts", () => {
  const doc = parseVtt(read("kickoff-call.vtt"));

  it("recognises the format", () => {
    expect(isVtt(read("kickoff-call.vtt"))).toBe(true);
    expect(isVtt(read("whatsapp-site-coordination.txt"))).toBe(false);
  });

  it("extracts speakers from Teams voice tags", () => {
    expect(doc.meta.participants).toContain("Rohit Menon");
    expect(doc.meta.participants).toContain("Priya Nair");
    expect(doc.meta.participants).toContain("Sameer Kulkarni");
  });

  it("keeps the utterance and drops the markup", () => {
    const first = doc.spans[0]!;
    expect(first.speaker).toBe("Ashika");
    expect(first.text).toContain("Thanks for making the time");
    expect(first.text).not.toContain("<v");
  });

  it("normalises timestamps and drops a zero hour", () => {
    expect(doc.spans[0]!.tsLabel).toBe("00:04");
  });

  it("captures NOTE metadata", () => {
    expect(doc.meta.notes?.join(" ")).toContain("Nova Interiors");
  });

  it("merges consecutive cues from one speaker", () => {
    const merged = parseVtt(
      [
        "WEBVTT",
        "",
        "00:00:01.000 --> 00:00:03.000",
        "<v Priya Nair>The sheet is stale</v>",
        "",
        "00:00:03.000 --> 00:00:05.000",
        "<v Priya Nair>because nobody updates it.</v>",
        "",
        "00:00:05.000 --> 00:00:07.000",
        "<v Rohit Menon>Agreed.</v>",
      ].join("\n"),
    );
    expect(merged.spans).toHaveLength(2);
    expect(merged.spans[0]!.text).toBe(
      "The sheet is stale because nobody updates it.",
    );
  });

  it("reads Zoom-style inline speakers too", () => {
    const zoom = parseVtt(
      [
        "WEBVTT",
        "",
        "1",
        "00:00:01.000 --> 00:00:04.000",
        "Anjali Deshpande: Is there somewhere I can see the plan?",
      ].join("\n"),
    );
    expect(zoom.spans[0]!.speaker).toBe("Anjali Deshpande");
    expect(zoom.spans[0]!.text).toBe("Is there somewhere I can see the plan?");
  });

  it("keeps offsets addressing their own text", () => {
    expectOffsetsAddressTheirText(doc);
  });
});

describe("WhatsApp exports", () => {
  const doc = parseWhatsApp(read("whatsapp-site-coordination.txt"));

  it("recognises the format", () => {
    expect(isWhatsAppExport(read("whatsapp-site-coordination.txt"))).toBe(true);
    expect(isWhatsAppExport(read("project-handover-sop.md"))).toBe(false);
  });

  it("separates author from message", () => {
    const withAuthor = doc.spans.find((s) => s.speaker === "Priya Nair");
    expect(withAuthor).toBeDefined();
    expect(withAuthor!.text).not.toContain("Priya Nair:");
  });

  it("treats notices as system messages, not as people", () => {
    expect(doc.meta.participants).not.toContain("Messages and calls are end-to-end encrypted. No one outside of this chat");
    expect(doc.meta.participants).toEqual([
      "Priya Nair",
      "Sameer Kulkarni",
      "Imran Shaikh",
      "Anjali Deshpande",
    ]);
  });

  it("labels media placeholders rather than dropping them", () => {
    const media = doc.spans.filter((s) => s.text.includes("media not included"));
    expect(media.length).toBeGreaterThan(5);
    expect(doc.meta.notes?.join(" ")).toContain("media placeholder");
  });

  it("dates messages", () => {
    const dated = doc.spans.filter((s) => s.occurredAt instanceof Date);
    expect(dated.length).toBe(doc.spans.length);
    expect(doc.meta.firstOccurredAt?.slice(0, 10)).toBe("2026-03-10");
    expect(doc.meta.lastOccurredAt?.slice(0, 10)).toBe("2026-04-02");
  });

  it("joins continuation lines into the message above", () => {
    const parsed = parseWhatsApp(
      [
        "12/03/2026, 16:40 - Priya Nair: First line",
        "second line of the same message",
        "third line",
        "12/03/2026, 16:41 - Sameer Kulkarni: A reply",
      ].join("\n"),
    );
    expect(parsed.spans).toHaveLength(2);
    expect(parsed.spans[0]!.text).toBe(
      "First line\nsecond line of the same message\nthird line",
    );
  });

  it("reads the iOS bracket format, direction marks and all", () => {
    const ios = parseWhatsApp(
      "‎[16/03/2026, 10:31:04] Anjali Deshpande: ‎Thank you! Excited to see progress",
    );
    expect(ios.spans).toHaveLength(1);
    expect(ios.spans[0]!.speaker).toBe("Anjali Deshpande");
    expect(ios.spans[0]!.text).toBe("Thank you! Excited to see progress");
  });

  it("detects day-first ordering from the export itself", () => {
    // 16/03 can only be day/month — 16 is not a month.
    expect(doc.meta.notes?.join(" ")).toContain("day/month");
    const dayFirst = parseWhatsApp("16/03/2026, 10:31 - A: x");
    expect(dayFirst.spans[0]!.occurredAt?.getUTCMonth()).toBe(2); // March
  });

  it("falls back to month-first when the export proves it", () => {
    // 03/16 can only be month/day.
    const monthFirst = parseWhatsApp(
      ["03/16/2026, 10:31 - A: x", "03/17/2026, 10:32 - A: y"].join("\n"),
    );
    expect(monthFirst.spans[0]!.occurredAt?.getUTCMonth()).toBe(2);
    expect(monthFirst.spans[0]!.occurredAt?.getUTCDate()).toBe(16);
  });

  it("handles 12-hour clocks", () => {
    const pm = parseWhatsApp("16/03/2026, 4:31 pm - A: afternoon");
    expect(pm.spans[0]!.occurredAt?.getUTCHours()).toBe(16);
    const midnight = parseWhatsApp("16/03/2026, 12:05 am - A: late");
    expect(midnight.spans[0]!.occurredAt?.getUTCHours()).toBe(0);
  });

  it("keeps offsets addressing their own text", () => {
    expectOffsetsAddressTheirText(doc);
  });
});

describe("text and Markdown documents", () => {
  const doc = parseText(read("project-handover-sop.md"));

  it("splits on blank lines into addressable blocks", () => {
    expect(doc.spans.length).toBeGreaterThan(20);
  });

  it("leaves the document exactly as written", () => {
    expect(doc.text).toContain("## 4. Materials and purchasing");
  });

  it("tags each block with the section it sits under", () => {
    const materials = doc.spans.find((s) =>
      s.text.includes("no shared record of expected delivery dates"),
    );
    expect(materials?.tsLabel).toBe("4. Materials and purchasing");
  });

  it("keeps offsets addressing their own text", () => {
    expectOffsetsAddressTheirText(doc);
  });
});

describe("format detection", () => {
  it("identifies each fixture from its content, not its extension", () => {
    expect(detectKind(read("kickoff-call.vtt"))).toBe("transcript");
    expect(detectKind(read("whatsapp-site-coordination.txt"))).toBe("whatsapp");
    expect(detectKind(read("project-handover-sop.md"))).toBe("note");
  });

  it("routes a mislabelled file by content", () => {
    // A WhatsApp export saved as _chat.txt and declared a plain note.
    const doc = parseSource(
      read("whatsapp-site-coordination.txt"),
      "note",
      "_chat.txt",
    );
    expect(doc.meta.unitLabel).toBe("messages");
  });
});

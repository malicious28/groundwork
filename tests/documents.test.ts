import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  detectBinaryKind,
  extractDocx,
  extractPdf,
} from "../src/lib/parsers/documents";
import { parseSource } from "../src/lib/parsers";

/**
 * These run against genuine binary files rather than mocks, because the whole
 * risk in this layer is what a real PDF or a real Word document does — a mocked
 * extractor would pass while the deployed one fell over on a native dependency.
 */

const FIXTURES = resolve(process.cwd(), "fixtures/nova-interiors");
const bytes = (name: string) =>
  new Uint8Array(readFileSync(resolve(FIXTURES, name)));

describe("binary format detection", () => {
  it("identifies a PDF by its magic bytes", () => {
    expect(detectBinaryKind(bytes("vendor-terms.pdf"))).toBe("pdf");
  });

  it("identifies a DOCX by its zip header", () => {
    expect(
      detectBinaryKind(bytes("project-handover-sop.docx"), "sop.docx"),
    ).toBe("docx");
  });

  it("returns null for text so the text sniffers get a turn", () => {
    expect(
      detectBinaryKind(bytes("whatsapp-site-coordination.txt"), "chat.txt"),
    ).toBeNull();
  });
});

describe("PDF extraction", () => {
  it("pulls the text out and reports the page count", async () => {
    const result = await extractPdf(bytes("vendor-terms.pdf"));
    expect(result.pageCount).toBe(1);
    expect(result.text).toContain("Deshmukh Traders supply Hettich hardware");
    expect(result.text).toContain("Idle labour caused by a late delivery");
    expect(result.looksScanned).toBe(false);
  });

  it("produces text the span parser can address", async () => {
    const result = await extractPdf(bytes("vendor-terms.pdf"));
    const parsed = parseSource(result.text, "pdf");
    expect(parsed.spans.length).toBeGreaterThan(0);
    for (const span of parsed.spans) {
      expect(parsed.text.slice(span.charStart, span.charEnd)).toBe(span.text);
    }
  });
});

describe("DOCX extraction", () => {
  it("keeps headings and body text", async () => {
    const result = await extractDocx(bytes("project-handover-sop.docx"));
    expect(result.text).toContain("Nova Interiors");
    expect(result.text).toContain("Materials and purchasing");
    expect(result.text).toContain(
      "There is no shared record of expected delivery dates.",
    );
  });

  it("marks up headings so section context survives", async () => {
    const result = await extractDocx(bytes("project-handover-sop.docx"));
    const parsed = parseSource(result.text, "docx");

    const materials = parsed.spans.find((span) =>
      span.text.includes("no shared record of expected delivery dates"),
    );
    expect(materials).toBeDefined();
    expect(materials!.tsLabel).toContain("Materials");
  });

  it("produces text the span parser can address", async () => {
    const result = await extractDocx(bytes("project-handover-sop.docx"));
    const parsed = parseSource(result.text, "docx");
    for (const span of parsed.spans) {
      expect(parsed.text.slice(span.charStart, span.charEnd)).toBe(span.text);
    }
  });
});

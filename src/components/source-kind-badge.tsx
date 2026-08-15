import type { SourceKind } from "@/db/schema";

const LABELS: Record<SourceKind, string> = {
  transcript: "Transcript",
  whatsapp: "WhatsApp",
  pdf: "PDF",
  docx: "Document",
  image: "Screenshot",
  webpage: "Website",
  note: "Note",
};

export function SourceKindBadge({ kind }: { kind: SourceKind }) {
  return (
    <span className="inline-block rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-ink-2 uppercase">
      {LABELS[kind]}
    </span>
  );
}

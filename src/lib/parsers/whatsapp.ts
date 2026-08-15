import { SpanBuilder, participantsOf, type ParsedDocument } from "./types";

/**
 * WhatsApp `.txt` chat exports.
 *
 * This is the input the assignment names that no requirements tool ingests, and
 * the format has four traps worth naming, because each one fails silently
 * rather than loudly:
 *
 *   Platform. Android writes `12/03/2026, 16:40 - Name: text`; iOS writes
 *   `[12/03/2026, 16:40:55] Name: text`.
 *
 *   Direction marks. iOS exports are peppered with U+200E/U+200F, which are
 *   invisible and break any regex that does not strip them first.
 *
 *   Date order. `03/04/26` is genuinely ambiguous, so the whole file is scanned
 *   before parsing: if any first component exceeds 12, the export is day-first.
 *
 *   Continuation lines. A line that does not begin with a timestamp belongs to
 *   the message above it. Parsing line-by-line silently shreds every paragraph.
 */

const ANDROID =
  /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*[-–]\s+(.*)$/i;
const IOS =
  /^\[(\d{1,4})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\]\s*(.*)$/i;

/** Localised placeholders WhatsApp substitutes when media is not exported. */
const MEDIA_PLACEHOLDER =
  /^(<media omitted>|<attached:[^>]*>|image omitted|video omitted|audio omitted|sticker omitted|document omitted|gif omitted|contact card omitted|.*\(file attached\))$/i;

const MONTHS = 12;

type RawMessage = {
  date: Date | null;
  dateLabel: string;
  author: string | null;
  body: string;
  isMedia: boolean;
  isSystem: boolean;
};

/**
 * iOS exports carry left-to-right and right-to-left marks plus directional
 * isolates around timestamps and media placeholders. They are invisible in an
 * editor, which is what makes "my regex works on Android but not on iPhone" a
 * genuinely hard afternoon. Non-breaking spaces are normalised for the same
 * reason: they look identical to a space and match none of its patterns.
 */
function stripDirectionMarks(text: string): string {
  return text
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\u00A0/g, " ");
}

type Head = {
  a: number;
  b: number;
  year: number;
  hour: number;
  minute: number;
  second: number;
  meridiem: string | null;
  rest: string;
};

function matchHead(line: string): Head | null {
  const m = IOS.exec(line) ?? ANDROID.exec(line);
  if (!m) return null;
  return {
    a: Number(m[1]),
    b: Number(m[2]),
    year: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: m[6] ? Number(m[6]) : 0,
    meridiem: m[7] ? m[7].toLowerCase().replace(/\./g, "") : null,
    rest: m[8] ?? "",
  };
}

/**
 * Decides day-first vs month-first for the whole file. A single value above 12
 * in either position settles it; with no evidence either way we assume
 * day-first, which is what every WhatsApp locale except the US produces.
 */
function detectDayFirst(heads: Head[]): { dayFirst: boolean; certain: boolean } {
  for (const h of heads) {
    if (h.a > MONTHS) return { dayFirst: true, certain: true };
    if (h.b > MONTHS) return { dayFirst: false, certain: true };
  }
  return { dayFirst: true, certain: false };
}

function toDate(head: Head, dayFirst: boolean): Date | null {
  const day = dayFirst ? head.a : head.b;
  const month = dayFirst ? head.b : head.a;
  const year = head.year < 100 ? 2000 + head.year : head.year;

  let hour = head.hour;
  if (head.meridiem === "pm" && hour < 12) hour += 12;
  if (head.meridiem === "am" && hour === 12) hour = 0;

  const date = new Date(Date.UTC(year, month - 1, day, hour, head.minute, head.second));
  return Number.isNaN(date.getTime()) ? null : date;
}

const DAY_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function labelFor(date: Date | null, head: Head): string {
  if (!date) return `${head.a}/${head.b} ${head.hour}:${String(head.minute).padStart(2, "0")}`;
  const hours = date.getUTCHours();
  const suffix = hours >= 12 ? "pm" : "am";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${date.getUTCDate()} ${DAY_LABEL[date.getUTCMonth()]}, ${twelve}:${String(
    date.getUTCMinutes(),
  ).padStart(2, "0")} ${suffix}`;
}

/**
 * Splits `Name: body`. A system notice ("Priya created group …") has no author,
 * and the length cap stops a long notice that happens to contain a colon from
 * being mistaken for one.
 */
function splitAuthor(rest: string): { author: string | null; body: string } {
  const at = rest.indexOf(": ");
  if (at === -1 || at > 60) return { author: null, body: rest };
  return { author: rest.slice(0, at).trim(), body: rest.slice(at + 2).trim() };
}

export function isWhatsAppExport(content: string): boolean {
  const lines = stripDirectionMarks(content).split(/\r?\n/).slice(0, 40);
  const hits = lines.filter((l) => matchHead(l.trim()) !== null).length;
  return hits >= 3;
}

export function parseWhatsApp(content: string): ParsedDocument {
  const lines = stripDirectionMarks(content).replace(/\r\n?/g, "\n").split("\n");

  const heads: Head[] = [];
  for (const line of lines) {
    const head = matchHead(line.trim());
    if (head) heads.push(head);
  }
  const { dayFirst, certain } = detectDayFirst(heads);

  const messages: RawMessage[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const head = matchHead(line.trim());

    if (!head) {
      // Continuation of the previous message.
      const previous = messages[messages.length - 1];
      if (previous && line.trim() !== "") {
        previous.body = `${previous.body}\n${line.trim()}`;
      }
      continue;
    }

    const date = toDate(head, dayFirst);
    const { author, body } = splitAuthor(head.rest);

    messages.push({
      date,
      dateLabel: labelFor(date, head),
      author,
      body,
      isMedia: MEDIA_PLACEHOLDER.test(body.trim()),
      isSystem: author === null,
    });
  }

  const builder = new SpanBuilder();
  for (const message of messages) {
    // System notices are kept — "X added Y", "This message was deleted" and
    // "X left" are genuine signal about how a project group was run — but they
    // are marked so the model is not misled into attributing them to a person.
    const prefix = message.isSystem
      ? `[${message.dateLabel}] (system) `
      : `[${message.dateLabel}] ${message.author}: `;

    const body = message.isMedia
      ? `(${message.body.replace(/[<>]/g, "").trim()} — media not included in export)`
      : message.body;

    builder.add(prefix, body, {
      speaker: message.author,
      tsLabel: message.dateLabel,
      occurredAt: message.date,
    });
  }

  const notes: string[] = [];
  notes.push(
    certain
      ? `Date order detected as ${dayFirst ? "day/month" : "month/day"} from the export itself.`
      : `Date order ambiguous in this export; assumed ${dayFirst ? "day/month" : "month/day"}.`,
  );
  const mediaCount = messages.filter((m) => m.isMedia).length;
  if (mediaCount > 0) {
    notes.push(
      `${mediaCount} media placeholder${mediaCount === 1 ? "" : "s"} — files were not included in the export.`,
    );
  }
  const systemCount = messages.filter((m) => m.isSystem).length;
  if (systemCount > 0) notes.push(`${systemCount} system notices retained.`);

  const doc = builder.build({ unitLabel: "messages", notes });

  return {
    ...doc,
    meta: { ...doc.meta, participants: participantsOf(doc.spans) },
  };
}

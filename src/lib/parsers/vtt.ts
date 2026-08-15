import { SpanBuilder, participantsOf, type ParsedDocument } from "./types";

/**
 * WebVTT transcripts — the format Microsoft Teams and Zoom both export, and the
 * only format the Teams Graph API will give you.
 *
 * Two things matter more than the parsing itself:
 *
 *   Consecutive cues from one speaker are merged. Teams splits a single
 *   sentence across three or four cues, so a naive parse produces fragments
 *   that read badly and cost tokens for no gain.
 *
 *   Speakers arrive as `<v Name>text</v>` voice tags in Teams, but Zoom writes
 *   `Name: text` inside the cue instead. Both are handled, because "we only
 *   support Teams" is not a useful answer to a consultant with a Zoom recording.
 */

const CUE_TIMING =
  /^(\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->\s*(\d{2}:)?\d{2}:\d{2}[.,]\d{3}/;
const VOICE_TAG = /^<v\s+([^>]+)>([\s\S]*?)(?:<\/v>)?$/i;
const INLINE_SPEAKER = /^([A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3}):\s+(.*)$/s;

type RawCue = { start: string; speaker: string | null; text: string };

/** `00:04:12.480 --> …` becomes `00:04:12`; a leading `00:` hour is dropped. */
function normaliseTimestamp(timing: string): string {
  const start = timing.split("-->")[0]!.trim().replace(",", ".");
  const withoutMillis = start.split(".")[0]!;
  const parts = withoutMillis.split(":");
  if (parts.length === 3 && parts[0] === "00") {
    return `${parts[1]}:${parts[2]}`;
  }
  return withoutMillis;
}

function stripCueTags(text: string): string {
  return text
    // Timestamp and styling tags: <00:00:04.120>, <c.colorE5E5E5>, <i>
    .replace(/<\/?[a-z0-9][^>]*>/gi, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export function isVtt(content: string): boolean {
  return /^﻿?WEBVTT/.test(content.trimStart());
}

export function parseVtt(content: string): ParsedDocument {
  const lines = content
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");

  const cues: RawCue[] = [];
  const notes: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!.trim();

    // NOTE blocks run until a blank line and carry meeting metadata in Teams
    // exports, which is worth keeping.
    if (line.startsWith("NOTE")) {
      const collected = [line.replace(/^NOTE\s*/, "")];
      i += 1;
      while (i < lines.length && lines[i]!.trim() !== "") {
        collected.push(lines[i]!.trim());
        i += 1;
      }
      const note = collected.join(" ").trim();
      if (note) notes.push(note);
      continue;
    }

    if (!CUE_TIMING.test(line)) {
      i += 1;
      continue;
    }

    const start = normaliseTimestamp(line);
    i += 1;

    const body: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "") {
      body.push(lines[i]!);
      i += 1;
    }

    // The voice tag has to be read before the generic tag stripper runs, or the
    // speaker's name is removed along with the markup that carries it.
    const joined = body.join(" ").trim();
    if (!joined) continue;

    const voice = joined.match(VOICE_TAG);
    if (voice) {
      cues.push({
        start,
        speaker: voice[1]!.trim(),
        text: stripCueTags(voice[2]!),
      });
      continue;
    }

    const stripped = stripCueTags(joined);
    if (!stripped) continue;

    const inline = stripped.match(INLINE_SPEAKER);
    if (inline) {
      cues.push({ start, speaker: inline[1]!.trim(), text: inline[2]!.trim() });
      continue;
    }

    cues.push({ start, speaker: null, text: stripped });
  }

  // Merge consecutive cues from the same speaker into one turn.
  const turns: RawCue[] = [];
  for (const cue of cues) {
    const previous = turns[turns.length - 1];
    if (previous && previous.speaker === cue.speaker && cue.speaker !== null) {
      previous.text = `${previous.text} ${cue.text}`.replace(/\s+/g, " ").trim();
    } else {
      turns.push({ ...cue });
    }
  }

  const builder = new SpanBuilder();
  for (const turn of turns) {
    const prefix = turn.speaker
      ? `[${turn.start}] ${turn.speaker}: `
      : `[${turn.start}] `;
    builder.add(prefix, turn.text, {
      speaker: turn.speaker,
      tsLabel: turn.start,
    });
  }

  const doc = builder.build({
    unitLabel: "turns",
    ...(notes.length > 0 ? { notes } : {}),
  });

  return {
    ...doc,
    meta: { ...doc.meta, participants: participantsOf(doc.spans) },
  };
}

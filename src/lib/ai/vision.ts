import Anthropic from "@anthropic-ai/sdk";
import { FAST_MODEL, hasApiKey } from "./client";

/**
 * Reading screenshots.
 *
 * A screenshot of the client's current spreadsheet or ERP screen is evidence
 * like any other, so it is transcribed at ingest rather than passed to the
 * model at generation time. That choice matters: turning the image into text
 * *once* means every downstream stage treats it identically to a transcript,
 * and — critically — a claim drawn from a screenshot can be verified and cited
 * like any other claim. Passing raw images into each generation call would put
 * that content outside the verification path entirely.
 *
 * Haiku rather than the main model: this is transcription, not judgement, and
 * it runs once per file at upload.
 */

const MAX_TOKENS = 2000;

const INSTRUCTION = `Transcribe this screenshot for a consultant who cannot see it.

Write it as plain text, in this order:

1. One line saying what application or document this appears to be.
2. The visible text, preserving the structure. For a table or spreadsheet, keep the rows and columns readable — one row per line, columns separated by " | ", with the header row first.
3. A short note of anything visually significant that is not text: a highlighted cell, an error state, an empty column, a status colour.

Rules:
- Transcribe only what is actually visible. If a value is cut off or unreadable, write [unclear] rather than guessing it.
- Do not interpret, summarise, or draw conclusions. Somebody else does that with your transcription as evidence, and an inference of yours mixed into it would be indistinguishable from something the client actually wrote.
- If the image contains no legible text at all, say exactly that and nothing more.`;

export type VisionResult = { text: string; notes: string[] };

export const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export async function transcribeScreenshot(
  base64: string,
  mediaType: string,
  filename: string,
): Promise<VisionResult> {
  if (!hasApiKey()) {
    return {
      text: "",
      notes: [
        "Screenshot stored but not read — ANTHROPIC_API_KEY is not set, so no transcription was made.",
      ],
    };
  }

  if (!SUPPORTED_IMAGE_TYPES.has(mediaType)) {
    return {
      text: "",
      notes: [`${mediaType} is not an image format that can be read.`],
    };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: FAST_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/png",
              data: base64,
            },
          },
          { type: "text", text: INSTRUCTION },
        ],
      },
    ],
  });

  if (message.stop_reason === "refusal") {
    return {
      text: "",
      notes: ["This screenshot could not be read: the request was declined."],
    };
  }

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  const notes = [`Transcribed from ${filename} by ${FAST_MODEL}.`];
  if (message.stop_reason === "max_tokens") {
    notes.push("The transcription was truncated — this is a dense screenshot.");
  }

  return { text, notes };
}

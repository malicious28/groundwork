import { describe, it, expect, afterEach } from "vitest";
import { apiKey, hasApiKey } from "../src/lib/ai/client";

/**
 * Whether a key is present decides whether the app calls a model or replays
 * recorded output, so getting it wrong is expensive in both directions.
 *
 * `Boolean(process.env.ANTHROPIC_API_KEY)` was the original check. It is right
 * about the common case and wrong about every near miss: a value left blank is
 * correctly read as absent, but whitespace, or the quotes a key is often pasted
 * with, read as present. The app would then say it was analysing for real and
 * fail deep inside an HTTP call with an authentication error that never
 * mentions the .env file — which is a much worse experience than being told
 * plainly that no key is set.
 */

const original = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = original;
});

const set = (value: string | undefined) => {
  if (value === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = value;
};

describe("deciding whether a key is set", () => {
  it.each([
    ["the variable is absent", undefined],
    ["the line is left empty", ""],
    ["it is only whitespace", "   "],
    ["empty double quotes were pasted", '""'],
    ["empty single quotes were pasted", "''"],
    ["quotes around whitespace", '"  "'],
    ["a newline crept in", "\n"],
  ])("counts as absent when %s", (_why, value) => {
    set(value as string | undefined);
    expect(hasApiKey()).toBe(false);
    expect(apiKey()).toBe("");
  });

  it.each([
    ["plain", "sk-ant-example123"],
    ["wrapped in double quotes", '"sk-ant-example123"'],
    ["wrapped in single quotes", "'sk-ant-example123'"],
    ["with trailing whitespace", "sk-ant-example123  "],
    ["quoted with padding inside", '" sk-ant-example123 "'],
  ])("counts as present when %s, and is cleaned", (_why, value) => {
    set(value);
    expect(hasApiKey()).toBe(true);
    expect(apiKey()).toBe("sk-ant-example123");
  });

  it("never hands the SDK something quoted or padded", () => {
    for (const value of ['"sk-x"', " sk-x ", "'sk-x'"]) {
      set(value);
      expect(apiKey()).not.toMatch(/^["'\s]|["'\s]$/);
    }
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { isUuid } from "../src/lib/ids";

/**
 * Ids arriving from a URL are checked for shape before they reach a query.
 *
 * Postgres rejects a non-uuid with a type error rather than an empty result, so
 * a mistyped or stale link produced a 500 with an empty body where the honest
 * answer was 404 — on the API and on the page alike. The structural half of
 * this suite is deliberate: the failure is an omission, and the only thing that
 * catches an omission is a check that every route with an id in its path has
 * remembered to look at it.
 */

describe("isUuid", () => {
  it("accepts a real one", () => {
    expect(isUuid("66adf671-d86c-4074-a8ea-2cf1a932c66e")).toBe(true);
  });

  it("rejects what actually turns up in a URL", () => {
    for (const value of [
      "not-a-uuid",
      "xx",
      "undefined",
      "",
      "66adf671d86c4074a8ea2cf1a932c66e",
      "66adf671-d86c-4074-a8ea-2cf1a932c66e'; drop table projects; --",
      "../../etc/passwd",
    ]) {
      expect(isUuid(value), value).toBe(false);
    }
  });

  it("rejects a nil uuid, which is never a real row here", () => {
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  it("survives being handed nothing", () => {
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});

/** Every route or page whose path carries an id must check it. */
function filesUnder(dir: string, name: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...filesUnder(path, name));
    else if (entry === name) found.push(path);
  }
  return found;
}

describe("routes and pages with an id in the path guard it", () => {
  const files = [
    ...filesUnder(resolve(process.cwd(), "src/app/api"), "route.ts"),
    ...filesUnder(resolve(process.cwd(), "src/app/projects"), "page.tsx"),
    ...filesUnder(resolve(process.cwd(), "src/app/projects"), "layout.tsx"),
  ].filter((file) => /\[\w+\]/.test(file));

  it("finds them", () => expect(files.length).toBeGreaterThan(10));

  it.each(files.map((f) => relative(process.cwd(), f)))("%s", (rel) => {
    const source = readFileSync(resolve(process.cwd(), rel), "utf8");
    // Only files that actually read an id from params need the guard.
    if (!/await params/.test(source)) return;
    const reads = source.match(/const \{[^}]*\} = await params;/g) ?? [];
    const readsAnId = reads.some((line) => /\bid\b|Id\b/.test(line));
    if (!readsAnId) return;

    expect(
      source.includes("isUuid"),
      `${rel} reads an id from the URL but never checks its shape, so a ` +
        `malformed one reaches Postgres and returns 500 instead of 404.`,
    ).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Every API route that requires a session must turn a rejected one into a
 * status the caller can act on.
 *
 * `requireSession` throws, and an uncaught throw in a route handler is a 500
 * with an empty body. The forms in this app read `error` out of the response,
 * so an unmapped AuthError reaches somebody as "Could not create the project."
 * when what actually happened is that their session ended — a message that
 * sends them looking for a bug in the thing they were doing.
 *
 * This is a structural check rather than a behavioural one because the failure
 * is an omission: the convention was already followed in eleven route files and
 * simply forgotten in the twelfth, which is exactly the kind of gap no
 * individual test would be written for.
 */

const API = resolve(process.cwd(), "src/app/api");

function routeFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...routeFiles(path));
    else if (entry === "route.ts") found.push(path);
  }
  return found;
}

describe("API routes map a rejected session to a status", () => {
  const files = routeFiles(API);

  it("finds the route handlers", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((file) => relative(process.cwd(), file)))(
    "%s",
    (relativePath) => {
      const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
      if (!source.includes("requireSession")) return;

      expect(
        source.includes("AuthError"),
        `${relativePath} calls requireSession but never maps AuthError, so a ` +
          `revoked or expired session returns 500 with no body.`,
      ).toBe(true);
    },
  );
});

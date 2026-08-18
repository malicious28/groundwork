import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { claimDataDirectory, DataDirectoryBusyError } from "../src/db/lock";

/**
 * PGlite corrupts rather than refuses when a second process opens its data
 * directory, and the corruption surfaces much later as an unrelated query
 * failing with `RuntimeError: Aborted()` — at which point the directory cannot
 * be recovered and has to be deleted and re-seeded. The two ordinary ways in
 * are running a seed script while the dev server is up, and starting a second
 * server without pointing it somewhere else.
 *
 * So the lock has to hold in both directions: refuse a live owner, and never
 * strand a directory behind a lock whose owner has died.
 */

const dirs: string[] = [];
const make = () => {
  const dir = mkdtempSync(join(tmpdir(), "groundwork-lock-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const LOCK = ".groundwork-writer.pid";

describe("claiming the local data directory", () => {
  it("writes this process's id when it is free", () => {
    const dir = make();
    claimDataDirectory(dir);
    expect(readFileSync(join(dir, LOCK), "utf8")).toBe(String(process.pid));
  });

  it("refuses when a living process holds it", () => {
    const dir = make();
    // pid 1 always exists and is not us.
    writeFileSync(join(dir, LOCK), "1", "utf8");
    expect(() => claimDataDirectory(dir)).toThrow(DataDirectoryBusyError);
  });

  it("says what to do about it", () => {
    const dir = make();
    writeFileSync(join(dir, LOCK), "1", "utf8");
    try {
      claimDataDirectory(dir);
      expect.unreachable("should have refused");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("already open in process 1");
      expect(message).toContain("PGLITE_DATA_DIR");
    }
  });

  it("takes over a lock whose owner has died", () => {
    const dir = make();
    // A pid that cannot be running: above the kernel maximum.
    writeFileSync(join(dir, LOCK), "4294967000", "utf8");
    expect(() => claimDataDirectory(dir)).not.toThrow();
    expect(readFileSync(join(dir, LOCK), "utf8")).toBe(String(process.pid));
  });

  it("is happy to re-claim a directory it already holds", () => {
    const dir = make();
    claimDataDirectory(dir);
    expect(() => claimDataDirectory(dir)).not.toThrow();
  });

  it("ignores a lock file containing nonsense rather than refusing forever", () => {
    const dir = make();
    writeFileSync(join(dir, LOCK), "not-a-pid", "utf8");
    expect(() => claimDataDirectory(dir)).not.toThrow();
  });

  it("does not lock an in-memory database, which is per-process anyway", () => {
    expect(() => claimDataDirectory("memory://")).not.toThrow();
  });

  it("creates the directory when it does not exist yet", () => {
    const dir = join(make(), "nested", "deeper");
    expect(() => claimDataDirectory(dir)).not.toThrow();
    expect(readFileSync(join(dir, LOCK), "utf8")).toBe(String(process.pid));
  });
});

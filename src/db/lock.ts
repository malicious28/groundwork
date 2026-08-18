import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * One writer at a time for the local database.
 *
 * PGlite is Postgres compiled to WASM running inside this process, and its data
 * directory is not safe for two processes to hold at once. It does not stop you
 * either: a second opener does not fail, it corrupts — and the damage surfaces
 * later as `RuntimeError: Aborted()` on an unrelated query, long after the
 * moment that caused it, by which point the directory is unrecoverable and the
 * only remedy is to delete it and re-seed.
 *
 * The two ways this happens are both ordinary: running `npm run db:seed` while
 * `npm run dev` is up, or starting a second server without pointing it at a
 * different directory. Postgres itself refuses this with postmaster.pid, and
 * this is the same idea — a pid file checked for a living owner, so a lock left
 * behind by a crash is taken over rather than blocking startup forever.
 *
 * Refusing loudly is the entire point. Losing a morning of uploads to silent
 * corruption is far worse than being told to stop the other process.
 */

const LOCK = ".groundwork-writer.pid";

/** True if a process with this id exists and we may signal it. */
function alive(pid: number): boolean {
  try {
    // Signal 0 performs the permission and existence checks without delivering
    // anything.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists but belongs to somebody else, which still counts.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export class DataDirectoryBusyError extends Error {
  constructor(dir: string, pid: number) {
    super(
      `The local database at ${dir} is already open in process ${pid}.\n\n` +
        `PGlite allows one process at a time, and opening it twice corrupts it ` +
        `rather than failing — so this stops here instead.\n\n` +
        `Either stop that process (usually \`npm run dev\`), or give this one ` +
        `its own copy:\n\n` +
        `    PGLITE_DATA_DIR=./.pglite-scratch npm run <command>\n`,
    );
    this.name = "DataDirectoryBusyError";
  }
}

/**
 * Claims the directory for this process, or throws if somebody else holds it.
 * In-memory databases are per-process by definition and need no lock.
 */
export function claimDataDirectory(dataDir: string): void {
  if (dataDir.startsWith("memory://")) return;

  const dir = resolve(dataDir);
  mkdirSync(dir, { recursive: true });
  const lockPath = join(dir, LOCK);

  if (existsSync(lockPath)) {
    const owner = Number.parseInt(readFileSync(lockPath, "utf8").trim(), 10);
    if (Number.isFinite(owner) && owner !== process.pid && alive(owner)) {
      throw new DataDirectoryBusyError(dataDir, owner);
    }
    // Otherwise the owner is gone, or it is us: the lock is ours to take.
  }

  writeFileSync(lockPath, String(process.pid), "utf8");

  const release = () => {
    try {
      const held = Number.parseInt(readFileSync(lockPath, "utf8").trim(), 10);
      if (held === process.pid) rmSync(lockPath, { force: true });
    } catch {
      // Already gone, or the directory was removed underneath us. Either way
      // there is nothing left to release.
    }
  };

  process.once("exit", release);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.once(signal, () => {
      release();
      process.exit(0);
    });
  }
}

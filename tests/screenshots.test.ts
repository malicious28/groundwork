import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { organizations, projects, sources } from "../src/db/schema";
import { withTenant } from "../src/db/tenant";
import { ingestFile } from "../src/lib/ingest";
import { detectBinaryKind } from "../src/lib/parsers/documents";
import { SUPPORTED_IMAGE_TYPES } from "../src/lib/ai/vision";

/**
 * Screenshots are transcribed at ingest rather than handed to the model at
 * generation time, so that anything drawn from one can be cited and verified
 * like any other evidence.
 *
 * These tests run without an API key, which is the case worth pinning: the file
 * must still be stored and viewable, and the absence of a transcription must be
 * stated plainly rather than looking like an empty document.
 */

let orgId: string;
let projectId: string;

const png = new Uint8Array(
  readFileSync(
    resolve(process.cwd(), "fixtures/nova-interiors/master-tracker-screenshot.png"),
  ),
);

beforeAll(async () => {
  const db = getDb();
  const [org] = await db
    .insert(organizations)
    .values({ name: "Shots", slug: "shots" })
    .returning();
  orgId = org!.id;

  await withTenant(orgId, async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({ orgId, name: "P", clientName: "C" })
      .returning();
    projectId = project!.id;
  });
});

describe("screenshot ingestion", () => {
  it("recognises a PNG from its magic bytes", () => {
    expect(detectBinaryKind(png, "whatever.bin")).toBe("image");
  });

  it("declares the image types it can read", () => {
    expect(SUPPORTED_IMAGE_TYPES.has("image/png")).toBe(true);
    expect(SUPPORTED_IMAGE_TYPES.has("image/jpeg")).toBe(true);
    expect(SUPPORTED_IMAGE_TYPES.has("application/pdf")).toBe(false);
  });

  it("stores the image and says why it was not read", async () => {
    const result = await withTenant(orgId, (tx) =>
      ingestFile(
        tx,
        { orgId, projectId },
        { name: "master-tracker.png", type: "image/png", bytes: png },
        "master-tracker",
      ),
    );

    expect(result.kind).toBe("image");
    expect(result.notes.join(" ")).toContain("ANTHROPIC_API_KEY is not set");

    const [row] = await withTenant(orgId, (tx) =>
      tx.select().from(sources).where(eq(sources.ref, "master-tracker")),
    );

    // Stored and viewable even though nothing could be read from it.
    expect(row!.imageData).toBeTruthy();
    expect(row!.imageData!.length).toBeGreaterThan(100);
    expect(row!.parseStatus).toBe("ready");
    expect(row!.spanCount).toBe(0);
  });

  it("round-trips the image bytes intact", async () => {
    const [row] = await withTenant(orgId, (tx) =>
      tx.select().from(sources).where(eq(sources.ref, "master-tracker")),
    );

    const decoded = Buffer.from(row!.imageData!, "base64");
    expect(decoded.byteLength).toBe(png.byteLength);
    // Still a valid PNG after the round trip.
    expect(decoded.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });
});

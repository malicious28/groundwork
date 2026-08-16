import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "../src/db";
import { organizations, projects } from "../src/db/schema";
import { withTenant } from "../src/db/tenant";
import {
  issueShareToken,
  resolveShareToken,
  revokeShareToken,
  newShareToken,
} from "../src/lib/share";

/**
 * Share links are the one read that happens before a tenant is known, so they
 * are also the one place a tenancy bug would be invisible. These tests pin the
 * behaviour that matters: a token resolves to exactly one project, revoking is
 * immediate, and nothing about the token tells you anything about other tenants.
 */

let orgA: string;
let orgB: string;
let projectA: string;
let projectB: string;

beforeAll(async () => {
  const db = getDb();
  const [a] = await db
    .insert(organizations)
    .values({ name: "Share A", slug: "share-a" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "Share B", slug: "share-b" })
    .returning();
  orgA = a!.id;
  orgB = b!.id;

  await withTenant(orgA, async (tx) => {
    const [row] = await tx
      .insert(projects)
      .values({ orgId: orgA, name: "A's project", clientName: "A Client" })
      .returning();
    projectA = row!.id;
  });
  await withTenant(orgB, async (tx) => {
    const [row] = await tx
      .insert(projects)
      .values({ orgId: orgB, name: "B's project", clientName: "B Client" })
      .returning();
    projectB = row!.id;
  });
});

describe("share tokens", () => {
  it("generates tokens that are unguessable and unique", () => {
    const tokens = new Set(Array.from({ length: 200 }, newShareToken));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(token.length).toBeGreaterThanOrEqual(32);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("resolves a token to its own project and tenant", async () => {
    const token = await issueShareToken(orgA, projectA);
    const resolved = await resolveShareToken(token);

    expect(resolved).toEqual({ orgId: orgA, projectId: projectA });
  });

  it("keeps tenants' tokens entirely separate", async () => {
    const tokenA = await issueShareToken(orgA, projectA);
    const tokenB = await issueShareToken(orgB, projectB);

    expect(await resolveShareToken(tokenA)).toEqual({
      orgId: orgA,
      projectId: projectA,
    });
    expect(await resolveShareToken(tokenB)).toEqual({
      orgId: orgB,
      projectId: projectB,
    });
  });

  it("stops resolving the old token when a link is rotated", async () => {
    const first = await issueShareToken(orgA, projectA);
    const second = await issueShareToken(orgA, projectA);

    expect(first).not.toBe(second);
    expect(await resolveShareToken(first)).toBeNull();
    expect(await resolveShareToken(second)).not.toBeNull();
  });

  it("stops resolving after revocation", async () => {
    const token = await issueShareToken(orgA, projectA);
    await revokeShareToken(orgA, projectA);

    expect(await resolveShareToken(token)).toBeNull();
  });

  it("rejects unknown, empty and trivially short tokens", async () => {
    expect(await resolveShareToken("does-not-exist-at-all")).toBeNull();
    expect(await resolveShareToken("")).toBeNull();
    expect(await resolveShareToken("abc")).toBeNull();
  });
});

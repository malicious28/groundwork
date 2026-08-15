import { and, desc, eq } from "drizzle-orm";
import { withTenant } from "@/db/tenant";
import {
  artifacts,
  citations as citationsTable,
  claims as claimsTable,
  type ArtifactKind,
  type GroundingSummary,
  type ModelUsage,
} from "@/db/schema";
import type { EvidenceTarget } from "@/components/evidence/evidence-panel";

/**
 * Reads the latest version of an artifact together with the verification
 * results for every claim inside it, keyed by the JSON path the claim occupies.
 *
 * The renderer then walks the artifact content and looks up `painPoints[2]` to
 * find that item's citations — which keeps the artifact JSON exactly as the
 * model produced it, with verification stored alongside rather than mixed in.
 */

export type ClaimEvidence = {
  confidence: string;
  citations: EvidenceTarget[];
};

export type LoadedArtifact<T> = {
  id: string;
  kind: ArtifactKind;
  version: number;
  content: T;
  usage: ModelUsage | null;
  grounding: GroundingSummary | null;
  createdAt: Date;
  evidence: Map<string, ClaimEvidence>;
};

export async function loadArtifact<T>(
  orgId: string,
  projectId: string,
  kind: ArtifactKind,
): Promise<LoadedArtifact<T> | null> {
  return withTenant(orgId, async (tx) => {
    const [artifact] = await tx
      .select()
      .from(artifacts)
      .where(
        and(
          eq(artifacts.orgId, orgId),
          eq(artifacts.projectId, projectId),
          eq(artifacts.kind, kind),
        ),
      )
      .orderBy(desc(artifacts.version))
      .limit(1);

    if (!artifact) return null;

    const rows = await tx
      .select({
        path: claimsTable.path,
        confidence: claimsTable.confidence,
        citationId: citationsTable.id,
        sourceId: citationsTable.sourceId,
        citedRef: citationsTable.citedRef,
        quote: citationsTable.quote,
        verified: citationsTable.verified,
        matchKind: citationsTable.matchKind,
        charStart: citationsTable.charStart,
        charEnd: citationsTable.charEnd,
      })
      .from(claimsTable)
      .leftJoin(citationsTable, eq(citationsTable.claimId, claimsTable.id))
      .where(eq(claimsTable.artifactId, artifact.id));

    const evidence = new Map<string, ClaimEvidence>();
    for (const row of rows) {
      const entry = evidence.get(row.path) ?? {
        confidence: row.confidence,
        citations: [],
      };
      // The left join means every citation column is nullable in the row type
      // even though they cannot be null when citationId is present.
      if (row.citationId && row.sourceId && row.citedRef && row.quote) {
        entry.citations.push({
          sourceId: row.sourceId,
          citedRef: row.citedRef,
          quote: row.quote,
          charStart: row.charStart,
          charEnd: row.charEnd,
          verified: row.verified ?? false,
          matchKind: row.matchKind ?? "none",
        });
      }
      evidence.set(row.path, entry);
    }

    return {
      id: artifact.id,
      kind: artifact.kind,
      version: artifact.version,
      content: artifact.content as T,
      usage: artifact.usage,
      grounding: artifact.grounding,
      createdAt: artifact.createdAt,
      evidence,
    };
  });
}

/** Which stages have run, for the project navigation and the empty states. */
export async function artifactSummary(
  orgId: string,
  projectId: string,
): Promise<Record<ArtifactKind, boolean>> {
  const rows = await withTenant(orgId, (tx) =>
    tx
      .selectDistinct({ kind: artifacts.kind })
      .from(artifacts)
      .where(
        and(eq(artifacts.orgId, orgId), eq(artifacts.projectId, projectId)),
      ),
  );

  const present = new Set(rows.map((row) => row.kind));
  return {
    brief: present.has("brief"),
    conflicts: present.has("conflicts"),
    questions: present.has("questions"),
    process: present.has("process"),
    outline: present.has("outline"),
    prototype: present.has("prototype"),
  };
}

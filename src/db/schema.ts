import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Tenancy model
 * -------------
 * `organizations` is the tenant root. Every table below that holds customer
 * data carries `org_id`, and every index that supports a read path leads with
 * it, so the planner can never be tempted into a cross-tenant scan.
 *
 * Isolation is enforced twice, on purpose:
 *   1. In the application, through the scoped-query helpers in src/db/tenant.ts
 *      — no route handler is allowed to build a query without a tenant.
 *   2. In the database, through row-level security policies in
 *      drizzle/policies.sql, keyed to the `app.current_org` session variable.
 *
 * Layer 1 catches mistakes early and reads well. Layer 2 is what still holds if
 * someone forgets layer 1.
 */

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const memberRole = pgEnum("member_role", [
  "owner", // billing + members; full access to every project in the org
  "consultant", // creates projects, uploads sources, runs synthesis
  "client", // read-only, and only on projects explicitly shared with them
]);

export const sourceKind = pgEnum("source_kind", [
  "transcript",
  "whatsapp",
  "pdf",
  "docx",
  "image",
  "webpage",
  "note",
]);

export const parseStatus = pgEnum("parse_status", [
  "pending",
  "parsing",
  "ready",
  "failed",
]);

export const artifactKind = pgEnum("artifact_kind", [
  "brief", // stage 2 — the discovery brief
  "conflicts", // stage 2 — contradictions between sources
  "questions", // stage 2 — the blind-spot register
  "process", // stage 3 — as-is / to-be
  "outline", // stage 4 — roles, modules, MoSCoW
  "prototype", // stage 5 — the generated clickable POC
]);

/**
 * How much weight a claim carries. The distinction is the product's entire
 * point: a reader must be able to tell what the client said from what the
 * model worked out from what the model simply assumed.
 */
export const confidenceTier = pgEnum("confidence_tier", [
  "explicit", // stated directly in a source
  "inferred", // derived from evidence across one or more sources
  "assumed", // the model filled a gap; belongs in the assumptions register
]);

/** Result of checking a model-supplied quote against the stored source text. */
export const matchKind = pgEnum("match_kind", [
  "exact", // byte-for-byte substring of the source
  "normalized", // matched after collapsing whitespace and unifying quote glyphs
  "fuzzy", // matched approximately; surfaced to the reader as approximate
  "none", // not found — the claim renders as unverified
]);

export const conflictStatus = pgEnum("conflict_status", [
  "open",
  "resolved",
  "dismissed",
]);

export const questionStatus = pgEnum("question_status", [
  "open",
  "asked",
  "answered",
  "dismissed",
]);

/* -------------------------------------------------------------------------- */
/* Tenancy + identity                                                         */
/* -------------------------------------------------------------------------- */

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("organizations_slug_key").on(t.slug)],
);

/**
 * A user is global; their access is granted per organization through
 * `memberships`. This is what lets one person be a consultant in the agency's
 * org and a client in their own, which is exactly how the demo is set up.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("consultant"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_org_user_key").on(t.orgId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

/**
 * An invitation to join an organization.
 *
 * Deliberately a row rather than a signed link with no server-side record: an
 * invitation must be revocable, must expire, and an owner must be able to see
 * what is outstanding. A stateless token can do none of those.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: memberRole("role").notNull().default("consultant"),
    /** Random, unguessable, and the only thing the recipient needs. */
    token: text("token").notNull(),
    invitedBy: uuid("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("invitations_token_key").on(t.token),
    index("invitations_org_idx").on(t.orgId, t.createdAt),
    // One outstanding invitation per address per organization.
    uniqueIndex("invitations_org_email_key").on(t.orgId, t.email),
  ],
);

/* -------------------------------------------------------------------------- */
/* Projects                                                                   */
/* -------------------------------------------------------------------------- */

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    clientName: text("client_name").notNull(),
    summary: text("summary"),
    /** Opaque token behind the read-only client link. Null until shared. */
    shareToken: text("share_token"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("projects_org_created_idx").on(t.orgId, t.createdAt),
    uniqueIndex("projects_share_token_key").on(t.shareToken),
  ],
);

/* -------------------------------------------------------------------------- */
/* The Evidence Ledger                                                        */
/* -------------------------------------------------------------------------- */

export type SourceMeta = {
  /** Participants detected in a transcript or chat export. */
  participants?: string[];
  /** ISO dates bounding the content, where the format carries them. */
  firstOccurredAt?: string;
  lastOccurredAt?: string;
  /** Pages for a PDF, messages for a chat export, cues for a transcript. */
  unitCount?: number;
  unitLabel?: string;
  /** Set by the cheap per-file normalisation pass at ingest. */
  aiSummary?: string;
  aiTopics?: string[];
  /** Free-form notes from the parser, e.g. a detected export locale. */
  notes?: string[];
};

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /**
     * Short, human-meaningful handle (`kickoff-call`, `whatsapp-site-group`).
     * This is what the model is shown and what it must cite, because a UUID in
     * a prompt is an invitation to hallucinate one.
     */
    ref: text("ref").notNull(),
    kind: sourceKind("kind").notNull(),
    label: text("label").notNull(),
    filename: text("filename"),
    mimeType: text("mime_type"),
    blobUrl: text("blob_url"),
    byteSize: integer("byte_size"),
    /** Normalised plain text. Every citation offset is relative to this. */
    rawText: text("raw_text"),
    /**
     * Base64 image data, for screenshots only. Kept so the evidence panel can
     * show the reader the actual screen a claim was drawn from — a transcription
     * alone would make a visual source the one thing you cannot check by eye.
     * Capped at a few megabytes by the ingest path; larger files belong in blob
     * storage, which is the obvious next step if this grows.
     */
    imageData: text("image_data"),
    parseStatus: parseStatus("parse_status").notNull().default("pending"),
    parseError: text("parse_error"),
    spanCount: integer("span_count").notNull().default(0),
    meta: jsonb("meta").$type<SourceMeta>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sources_org_project_idx").on(t.orgId, t.projectId, t.createdAt),
    uniqueIndex("sources_project_ref_key").on(t.projectId, t.ref),
  ],
);

/**
 * The addressable unit of evidence: one chat message, one transcript turn, one
 * PDF paragraph, one OCR region. Offsets are into `sources.raw_text`, so the
 * reader can be shown the passage in place rather than a detached snippet.
 */
export const evidenceSpans = pgTable(
  "evidence_spans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    /** Ordinal within the source, 1-based. Stable across re-parses. */
    idx: integer("idx").notNull(),
    speaker: text("speaker"),
    /** Display anchor: `00:14:32` for a call, `12 Mar, 4:31 pm` for chat. */
    tsLabel: text("ts_label"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    text: text("text").notNull(),
    charStart: integer("char_start").notNull(),
    charEnd: integer("char_end").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("evidence_spans_source_idx_key").on(t.sourceId, t.idx),
    index("evidence_spans_org_project_idx").on(t.orgId, t.projectId),
    index("evidence_spans_source_occurred_idx").on(t.sourceId, t.occurredAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* Artifacts and their claims                                                 */
/* -------------------------------------------------------------------------- */

export type GroundingSummary = {
  claimCount: number;
  verifiedCount: number;
  /** verifiedCount / claimCount, 0–1. Rendered as the grounding score. */
  score: number;
  byTier: Partial<Record<"explicit" | "inferred" | "assumed", number>>;
};

export type ModelUsage = {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  latencyMs?: number;
};

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: artifactKind("kind").notNull(),
    /** Monotonic per (project, kind). Regenerating never overwrites history. */
    version: integer("version").notNull().default(1),
    content: jsonb("content").notNull(),
    usage: jsonb("usage").$type<ModelUsage>(),
    grounding: jsonb("grounding").$type<GroundingSummary>(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("artifacts_project_kind_version_key").on(
      t.projectId,
      t.kind,
      t.version,
    ),
    index("artifacts_org_project_kind_idx").on(t.orgId, t.projectId, t.kind),
  ],
);

/**
 * One assertion inside an artifact. `path` locates it in the artifact JSON
 * (`painPoints[2]`, `requirements[7].text`) so the UI can attach the citation
 * chip to the exact line the reader is looking at.
 */
export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    text: text("text").notNull(),
    confidence: confidenceTier("confidence").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("claims_artifact_idx").on(t.artifactId),
    index("claims_org_project_idx").on(t.orgId, t.projectId),
  ],
);

/**
 * The chain of custody. A claim with no verified citation is not allowed to
 * render as fact — see src/lib/verify.ts, which populates `verified`,
 * `matchKind` and the offsets before any of this reaches a reader.
 */
export const citations = pgTable(
  "citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => sources.id, {
      onDelete: "cascade",
    }),
    spanId: uuid("span_id").references(() => evidenceSpans.id, {
      onDelete: "set null",
    }),
    /** Exactly what the model returned, kept verbatim even when unverified. */
    quote: text("quote").notNull(),
    /** The source ref the model cited, kept even if it resolves to nothing. */
    citedRef: text("cited_ref").notNull(),
    verified: boolean("verified").notNull().default(false),
    matchKind: matchKind("match_kind").notNull().default("none"),
    charStart: integer("char_start"),
    charEnd: integer("char_end"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("citations_claim_idx").on(t.claimId),
    index("citations_source_idx").on(t.sourceId),
    index("citations_org_verified_idx").on(t.orgId, t.verified),
  ],
);

/* -------------------------------------------------------------------------- */
/* Conflict Radar                                                             */
/* -------------------------------------------------------------------------- */

export const conflicts = pgTable(
  "conflicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** `budget`, `scope`, `timeline`, `authority`, `process`. */
    topic: text("topic").notNull(),
    summary: text("summary").notNull(),
    /** 1 (cosmetic) to 3 (would derail the build if it stays unresolved). */
    severity: integer("severity").notNull().default(2),
    status: conflictStatus("status").notNull().default("open"),
    resolution: text("resolution"),
    resolvedBy: uuid("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("conflicts_org_project_status_idx").on(
      t.orgId,
      t.projectId,
      t.status,
    ),
  ],
);

/** One side of a contradiction: who said what, where, and when. */
export const conflictSides = pgTable(
  "conflict_sides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conflictId: uuid("conflict_id")
      .notNull()
      .references(() => conflicts.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => sources.id, {
      onDelete: "cascade",
    }),
    spanId: uuid("span_id").references(() => evidenceSpans.id, {
      onDelete: "set null",
    }),
    citedRef: text("cited_ref").notNull(),
    quote: text("quote").notNull(),
    /** The position this side represents, in a few words. */
    stance: text("stance").notNull(),
    speaker: text("speaker"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    verified: boolean("verified").notNull().default(false),
    matchKind: matchKind("match_kind").notNull().default("none"),
    charStart: integer("char_start"),
    charEnd: integer("char_end"),
  },
  (t) => [index("conflict_sides_conflict_idx").on(t.conflictId)],
);

/* -------------------------------------------------------------------------- */
/* Blind-Spot Register                                                        */
/* -------------------------------------------------------------------------- */

export const openQuestions = pgTable(
  "open_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Slug from the fixed completeness checklist, e.g. `data_migration`. */
    category: text("category").notNull(),
    question: text("question").notNull(),
    whyItMatters: text("why_it_matters").notNull(),
    /** 1 = nice to know, 3 = blocks the build. Drives ordering. */
    priority: integer("priority").notNull().default(2),
    status: questionStatus("status").notNull().default("open"),
    answer: text("answer"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("open_questions_org_project_status_idx").on(
      t.orgId,
      t.projectId,
      t.status,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  projects: many(projects),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [memberships.orgId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.orgId],
    references: [organizations.id],
  }),
  sources: many(sources),
  artifacts: many(artifacts),
  conflicts: many(conflicts),
  openQuestions: many(openQuestions),
}));

export const sourcesRelations = relations(sources, ({ one, many }) => ({
  project: one(projects, {
    fields: [sources.projectId],
    references: [projects.id],
  }),
  spans: many(evidenceSpans),
}));

export const evidenceSpansRelations = relations(evidenceSpans, ({ one }) => ({
  source: one(sources, {
    fields: [evidenceSpans.sourceId],
    references: [sources.id],
  }),
}));

export const artifactsRelations = relations(artifacts, ({ one, many }) => ({
  project: one(projects, {
    fields: [artifacts.projectId],
    references: [projects.id],
  }),
  claims: many(claims),
}));

export const claimsRelations = relations(claims, ({ one, many }) => ({
  artifact: one(artifacts, {
    fields: [claims.artifactId],
    references: [artifacts.id],
  }),
  citations: many(citations),
}));

export const citationsRelations = relations(citations, ({ one }) => ({
  claim: one(claims, { fields: [citations.claimId], references: [claims.id] }),
  source: one(sources, {
    fields: [citations.sourceId],
    references: [sources.id],
  }),
  span: one(evidenceSpans, {
    fields: [citations.spanId],
    references: [evidenceSpans.id],
  }),
}));

export const conflictsRelations = relations(conflicts, ({ one, many }) => ({
  project: one(projects, {
    fields: [conflicts.projectId],
    references: [projects.id],
  }),
  sides: many(conflictSides),
}));

export const conflictSidesRelations = relations(conflictSides, ({ one }) => ({
  conflict: one(conflicts, {
    fields: [conflictSides.conflictId],
    references: [conflicts.id],
  }),
  source: one(sources, {
    fields: [conflictSides.sourceId],
    references: [sources.id],
  }),
}));

export const openQuestionsRelations = relations(openQuestions, ({ one }) => ({
  project: one(projects, {
    fields: [openQuestions.projectId],
    references: [projects.id],
  }),
}));

/* -------------------------------------------------------------------------- */
/* Inferred types                                                             */
/* -------------------------------------------------------------------------- */

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type MemberRole = (typeof memberRole.enumValues)[number];
export type Project = typeof projects.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type EvidenceSpan = typeof evidenceSpans.$inferSelect;
export type NewEvidenceSpan = typeof evidenceSpans.$inferInsert;
export type Artifact = typeof artifacts.$inferSelect;
export type ArtifactKind = (typeof artifactKind.enumValues)[number];
export type Claim = typeof claims.$inferSelect;
export type Citation = typeof citations.$inferSelect;
export type Conflict = typeof conflicts.$inferSelect;
export type ConflictSide = typeof conflictSides.$inferSelect;
export type OpenQuestion = typeof openQuestions.$inferSelect;
export type SourceKind = (typeof sourceKind.enumValues)[number];
export type ConfidenceTier = (typeof confidenceTier.enumValues)[number];
export type MatchKind = (typeof matchKind.enumValues)[number];

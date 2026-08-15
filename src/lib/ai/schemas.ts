import { z } from "zod";

/**
 * The shape of every artifact the model produces.
 *
 * Two rules run through all of them:
 *
 *   Nothing asserts without evidence. Every claim carries `citations`, and a
 *   citation is a source handle plus a verbatim quote — which the server then
 *   checks actually occurs in that source before the claim is allowed to render
 *   as fact.
 *
 *   Nothing hides how sure it is. `confidence` separates what the client said
 *   from what was worked out from what was simply filled in, so a reader can
 *   argue with the brief at the level of individual lines.
 */

export const Citation = z.object({
  sourceRef: z
    .string()
    .describe("The `ref` of the source, exactly as given in the corpus."),
  quote: z
    .string()
    .min(12)
    .max(320)
    .describe(
      "A verbatim span copied from that source. Copy it exactly; do not tidy, join or paraphrase it.",
    ),
});

export const Confidence = z.enum(["explicit", "inferred", "assumed"]);

const Cited = {
  citations: z.array(Citation).describe("At least one unless confidence is `assumed`."),
  confidence: Confidence,
};

/* -------------------------------------------------------------------------- */
/* Stage 2 — understand                                                       */
/* -------------------------------------------------------------------------- */

export const BriefSchema = z.object({
  headline: z
    .string()
    .describe("One sentence a busy partner could read and know what this is."),

  goal: z.object({
    text: z.string().describe("What the client is actually trying to achieve."),
    ...Cited,
  }),

  stakeholders: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      cares: z.string().describe("What this person is measured by or worried about."),
    }),
  ),

  asIsProcess: z.array(
    z.object({
      step: z.string(),
      actor: z.string(),
      tools: z.array(z.string()),
      friction: z.string().nullable().describe("What goes wrong here, if anything."),
      ...Cited,
    }),
  ),

  painPoints: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      severity: z.number().int().min(1).max(3),
      whoFeelsIt: z.string(),
      ...Cited,
    }),
  ),

  requirements: z.array(
    z.object({
      text: z.string(),
      category: z.enum([
        "functional",
        "operational",
        "constraint",
        "integration",
        "non_functional",
      ]),
      ...Cited,
    }),
  ),

  outOfScope: z
    .array(z.object({ text: z.string(), ...Cited }))
    .describe("Things the client explicitly ruled out. Worth recording."),

  assumptions: z
    .array(z.object({ text: z.string(), why: z.string() }))
    .describe("Anything you filled in yourself. Be honest and complete here."),
});

export const ConflictsSchema = z.object({
  conflicts: z.array(
    z.object({
      topic: z.enum(["budget", "scope", "timeline", "authority", "process", "other"]),
      summary: z.string().describe("The contradiction in one sentence."),
      severity: z
        .number()
        .int()
        .min(1)
        .max(3)
        .describe("3 = would derail the build if it stays unresolved."),
      sides: z
        .array(
          z.object({
            stance: z.string().describe("The position, in a few words."),
            speaker: z.string().nullable(),
            ...Citation.shape,
          }),
        )
        .min(2),
      suggestedResolution: z.string(),
    }),
  ),
});

export const QuestionsSchema = z.object({
  questions: z.array(
    z.object({
      category: z.enum([
        "budget",
        "timeline",
        "users_and_roles",
        "integrations",
        "data_migration",
        "auth_and_access",
        "success_metrics",
        "compliance",
        "support",
        "other",
      ]),
      question: z.string().describe("Phrased so it can be sent to the client as-is."),
      whyItMatters: z.string().describe("What changes depending on the answer."),
      priority: z.number().int().min(1).max(3),
    }),
  ),
});

/* -------------------------------------------------------------------------- */
/* Stage 3 — improve                                                          */
/* -------------------------------------------------------------------------- */

export const ProcessSchema = z.object({
  asIsMermaid: z
    .string()
    .describe("Mermaid `flowchart TD` of the current process. Quote every label."),
  toBeMermaid: z
    .string()
    .describe("Mermaid `flowchart TD` of the proposed process. Quote every label."),
  changes: z.array(
    z.object({
      change: z.string(),
      removes: z.string().describe("The specific waste this removes."),
      effort: z.enum(["low", "medium", "high"]),
      ...Cited,
    }),
  ),
});

/* -------------------------------------------------------------------------- */
/* Stage 4 — specify                                                          */
/* -------------------------------------------------------------------------- */

export const OutlineSchema = z.object({
  roles: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      permissions: z.array(z.string()),
    }),
  ),
  modules: z.array(
    z.object({
      name: z.string(),
      purpose: z.string(),
      screens: z.array(z.string()),
    }),
  ),
  features: z.array(
    z.object({
      title: z.string(),
      module: z.string(),
      moscow: z.enum(["must", "should", "could", "wont"]),
      rationale: z.string(),
      ...Cited,
    }),
  ),
  flowMermaid: z
    .string()
    .describe("Mermaid `flowchart LR` of the main end-to-end flow."),
});

/* -------------------------------------------------------------------------- */
/* Stage 5 — prototype                                                        */
/* -------------------------------------------------------------------------- */

export const PrototypeSchema = z.object({
  screens: z.array(z.object({ name: z.string(), purpose: z.string() })),
  html: z
    .string()
    .describe(
      "One self-contained HTML document. Inline all CSS and JS; no external requests of any kind.",
    ),
});

export type Brief = z.infer<typeof BriefSchema>;
export type Conflicts = z.infer<typeof ConflictsSchema>;
export type Questions = z.infer<typeof QuestionsSchema>;
export type ProcessArtifact = z.infer<typeof ProcessSchema>;
export type Outline = z.infer<typeof OutlineSchema>;
export type Prototype = z.infer<typeof PrototypeSchema>;
export type CitationInput = z.infer<typeof Citation>;

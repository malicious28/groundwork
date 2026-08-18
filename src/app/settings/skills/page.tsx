import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { AppHeader } from "@/components/app-header";

/**
 * What the job description asks for, and where in this codebase each one is
 * actually demonstrated.
 *
 * This exists because a reviewer's real question is not "did they build
 * something" but "can they do the specific things we listed" — and answering
 * that by pointing at files is stronger than asserting it in a README. Every
 * row links to code that can be opened and read.
 */

type Skill = {
  claim: string;
  where: string;
  paths: string[];
  proof?: string;
};

const GROUPS: Array<{ heading: string; skills: Skill[] }> = [
  {
    heading: "Multi-tenant SaaS",
    skills: [
      {
        claim: "Multi-tenant architecture",
        where:
          "organizations is the tenant root; every customer table carries org_id, and each index leads with it so the planner cannot drift into a cross-tenant scan.",
        paths: ["src/db/schema.ts"],
      },
      {
        claim: "Strict data isolation between customers",
        where:
          "Enforced twice and independently: application scoping in withTenant, and forced row-level security policies the app can only reach as a restricted role.",
        paths: ["src/db/tenant.ts", "drizzle/policies.sql"],
        proof:
          "tests/tenant-isolation.test.ts — including that a missing tenant returns nothing rather than everything",
      },
      {
        claim: "Teams and shared workspaces",
        where:
          "Owners invite by email and role; invitations are revocable, expiring, single-use rows, and the last owner cannot be removed.",
        paths: ["src/lib/team.ts"],
        proof: "tests/team.test.ts",
      },
    ],
  },
  {
    heading: "Authentication and authorisation",
    skills: [
      {
        claim: "JWT and RBAC",
        where:
          "Hand-rolled with jose rather than a library, because the point was to show the mechanism. Three roles; middleware gates route trees and every data path re-checks with a live lookup.",
        paths: ["src/lib/auth/jwt.ts", "src/lib/auth/session.ts", "src/middleware.ts"],
      },
      {
        claim: "Bearer-token access without accounts",
        where:
          "Client share links carry their own token, are revoked by rotation, and are the only read in the codebase outside a tenant scope — deliberately confined to one function.",
        paths: ["src/lib/share.ts"],
        proof: "tests/share.test.ts",
      },
    ],
  },
  {
    heading: "API and data modelling",
    skills: [
      {
        claim: "REST API design",
        where:
          "Resource-shaped routes for sources, URL ingestion, generation, conflicts, questions, team and sharing, with consistent error envelopes and correct status codes.",
        paths: ["src/app/api"],
      },
      {
        claim: "Data modelling for multi-tenant systems",
        where:
          "13 tables including a span-level evidence store, versioned artifacts, and claim/citation tables that make every assertion traceable.",
        paths: ["src/db/schema.ts"],
      },
      {
        claim: "Streaming responses",
        where:
          "Discovery runs six model calls and streams each stage over server-sent events, so a minutes-long job reports progress instead of holding a connection silently.",
        paths: ["src/app/api/projects/[id]/generate/route.ts"],
      },
    ],
  },
  {
    heading: "Working with AI, with ownership of the output",
    skills: [
      {
        claim: "Not trusting model output",
        where:
          "Every claim must carry a verbatim quote, which the server locates in the named source before the claim may render as fact. Unverifiable claims render as unsupported.",
        paths: ["src/lib/verify.ts", "src/lib/ai/pipeline.ts"],
        proof:
          "tests/verify.test.ts and tests/recorded-artifacts.test.ts — which assert both that real citations pass and that a planted false one still fails",
      },
      {
        claim: "Prompt caching and cost control",
        where:
          "System prompt and corpus form a byte-stable prefix with the cache breakpoint on the last source block, so only the first of six calls pays to read the documents.",
        paths: ["src/lib/ai/prompts.ts", "src/lib/ai/client.ts"],
      },
      {
        claim: "Structured output with schema validation",
        where:
          "Every artifact is a Zod schema compiled to JSON Schema and enforced on the request, then re-parsed on the way back.",
        paths: ["src/lib/ai/schemas.ts"],
      },
    ],
  },
  {
    heading: "Engineering practice",
    skills: [
      {
        claim: "Automated testing",
        where:
          "109 unit tests over parsers, verification, isolation, sharing, teams and regeneration; 10 browser tests driving the demo walkthrough end to end.",
        paths: ["tests", "e2e/discovery.spec.ts"],
      },
      {
        claim: "CI/CD and multiple environments",
        where:
          "GitHub Actions runs typecheck, unit tests and build in one job and the browser suite in another. PGlite locally, Neon in deployment, behind one schema and one migration path.",
        paths: [".github/workflows/ci.yml", "src/db/index.ts", "vercel.json"],
      },
      {
        claim: "Preventing bugs rather than fixing them",
        where:
          "TypeScript strict with noUncheckedIndexedAccess, Zod at every boundary, and tests written to catch the specific mistakes this codebase is prone to — a regeneration silently discarding recorded decisions, or a sandbox attribute being weakened.",
        paths: ["tsconfig.json"],
      },
      {
        claim: "Security decisions made deliberately",
        where:
          "Generated markup renders sandboxed without same-origin; the URL reader refuses private ranges and re-checks after DNS resolution; share links are noindex and no-referrer.",
        paths: ["src/lib/parsers/webpage.ts", "src/app/projects/[id]/prototype/page.tsx"],
      },
    ],
  },
];

export default async function SkillsPage() {
  const session = await requireSession("consultant");

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 font-serif text-3xl font-semibold tracking-tight">
          What this demonstrates
        </h1>
        <p className="mb-8 max-w-prose text-ink-2">
          Each line the job description asks for, and the file where it is
          actually done. Nothing here is a claim you have to take on trust —
          every path can be opened and read.
        </p>

        {GROUPS.map((group) => (
          <section key={group.heading} className="mb-10">
            <h2 className="mb-3 font-mono text-[11px] tracking-[0.1em] text-accent uppercase">
              {group.heading}
            </h2>
            <ul className="flex flex-col gap-3">
              {group.skills.map((skill) => (
                <li
                  key={skill.claim}
                  className="rounded border border-line bg-surface p-4"
                >
                  <p className="font-medium">{skill.claim}</p>
                  <p className="mt-1 max-w-prose text-sm text-ink-2">
                    {skill.where}
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {skill.paths.map((path) => (
                      <li
                        key={path}
                        className="rounded border border-line bg-ground px-1.5 py-0.5 font-mono text-[10px] text-muted"
                      >
                        {path}
                      </li>
                    ))}
                  </ul>
                  {skill.proof ? (
                    <p className="mt-2 font-mono text-[11px] text-accent">
                      Proved by: {skill.proof}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="max-w-prose border-t border-line pt-4 text-sm text-muted">
          Deliberately not built: a requirement-drift timeline, chat over the
          evidence, and server-side refusal fallbacks. All three are listed in
          the README with the reasoning — a tight complete story is worth more
          than a wider one with thin patches.{" "}
          <Link href="/projects" className="text-accent">
            Back to projects
          </Link>
        </p>
      </main>
    </>
  );
}

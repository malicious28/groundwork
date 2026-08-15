# Groundwork

Turn scattered client inputs — meeting transcripts, WhatsApp exports, PDFs,
process documents, screenshots — into a requirements brief where every claim can
be clicked back to the sentence a human actually said, then into an improved
process, a prioritised solution outline, and a clickable prototype.

Built for the *AI Business Discovery to POC* assignment. The build plan, and the
market survey behind it, is in [`docs/groundwork-plan.html`](docs/groundwork-plan.html).

---

## Running it

No Docker, no database server, no cloud account.

```bash
npm install
cp .env.example .env      # then set AUTH_SECRET — the file tells you how
npm run setup             # migrate + seed the demo project
npm run dev
```

Open <http://localhost:3000>. Every demo account uses the password `demo1234`:

| Email | Role | What they see |
| --- | --- | --- |
| `ashika@meridian.example` | owner / consultant | The Nova Interiors engagement, all five stages |
| `rohit@novainteriors.example` | client | The published brief and prototype, read-only |
| `dev@northwind.example` | owner of a second tenant | Their own project — and a 404 on Meridian's, even by direct URL |

**`ANTHROPIC_API_KEY` is optional.** Without it, *Run discovery* replays recorded
model output instead of calling Claude, and labels the result as such. Every
citation is still verified against the real source text and the grounding score
is still computed from those results, so the demo is honest about what it is.
With a key set, the same code path calls `claude-opus-5` for real.

```bash
npm test            # 66 tests: parsers, verification, extraction, isolation
npm run typecheck
npm run db:reset    # wipe local data and re-seed
```

### The local database

Development and tests run on [PGlite](https://pglite.dev) — real Postgres
compiled to WebAssembly, running inside the Node process with its data in
`./.pglite`. Setup is two commands rather than a Docker Compose file, and it is
the same Postgres a deployment runs, so row-level security, `EXPLAIN` and every
other SQL feature behave identically.

Set `DATABASE_URL` and the app switches to Neon over its WebSocket pool driver.
Same schema, same migrations, same policies.

---

## The five stages

Each maps onto one of the assignment's five requirements, and all of them sit on
one shared spine.

**The Evidence Ledger.** Every source is parsed into addressable spans — one
chat message, one transcript turn, one document section — each recording
character offsets into the normalised text the reader is shown. Nothing
downstream is allowed to be a free-floating assertion; findings, requirements
and proposed changes all hold a foreign key to the spans that justify them.

1. **Intake** — transcripts (Teams/Zoom `.vtt`), WhatsApp `.txt` exports, PDFs,
   Word documents, screenshots. Format is detected from the file's own bytes,
   not its extension.
2. **Understand** — the discovery brief: goal, stakeholders, as-is process, pain
   points, requirements, out-of-scope, assumptions. Plus the Conflict Radar and
   the Blind-Spot Register.
3. **Improve** — as-is and to-be process diagrams side by side, with each change
   naming the specific waste it removes.
4. **Specify** — roles, modules, screens, and a MoSCoW feature list where every
   row cites its evidence.
5. **Prototype** — a self-contained clickable prototype seeded with the client's
   own vocabulary, rendered in a locked-down sandbox.

---

## The part that matters: verified grounding

The model is required to return a verbatim quote with every claim. The server
then checks that the quote genuinely occurs in the source it named, and stores
where. **A claim whose quote cannot be found is never rendered as fact.**

Matching runs strict-to-forgiving, and the distinction is surfaced rather than
hidden:

| Result | Meaning | Counts as verified |
| --- | --- | --- |
| `exact` | Byte-for-byte substring | yes |
| `normalized` | Matches once curly quotes, dashes, case, whitespace and Markdown line prefixes are unified | yes |
| `fuzzy` | The same sentence with a word or two different | **no** — shown as approximate |
| `none` | Not found | **no** — shown as unsupported |

The forgiveness is deliberate and bounded. A model straightening a curly
apostrophe while copying has still copied faithfully, and rejecting that would
flag honest citations as invented. A model rewording a sentence has not, so
fuzzy never counts as verified.

The seeded demo scores **83% — 24 of 29 claims verified**. It is not 100% by
design: four claims are assumptions the model declared as its own, and one is a
planted requirement citing a sentence that appears in no source. It renders with
a red ✗ and the panel says the quote could not be located. That is the feature
working, and [`tests/recorded-artifacts.test.ts`](tests/recorded-artifacts.test.ts)
asserts both halves — that every real citation verifies, and that the planted one
still fails.

---

## Architecture

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 App Router, TypeScript strict | Route handlers for the REST surface, server components for reads |
| Database | PGlite locally, Neon in deployment | One schema, one migration path, zero-setup clone |
| ORM | Drizzle | Typed SQL rather than a query-builder abstraction |
| AI | Official `@anthropic-ai/sdk`, `claude-opus-5` | Direct access to prompt caching and structured output |
| Auth | Hand-rolled JWT with `jose`, HTTP-only cookies | The job asks for JWT/RBAC understanding; a library hides it |
| Diagrams | Mermaid, validated before render | A diagram that fails to parse degrades to its source |

### Tenant isolation, twice

`organizations` is the tenant root. Every table holding customer data carries
`org_id`, and isolation is enforced in two independent places:

1. **In the application** — all customer data is read and written inside
   `withTenant()` ([`src/db/tenant.ts`](src/db/tenant.ts)), and queries carry
   their own `where org_id = …`.
2. **In the database** — RLS policies ([`drizzle/policies.sql`](drizzle/policies.sql))
   compare `org_id` against a transaction-local `app.current_org` setting.

The second layer is what still holds when someone forgets the first. Two details
make it real rather than decorative, and both are easy to get wrong:

- **`FORCE ROW LEVEL SECURITY`.** Without it, policies are skipped for the table
  owner — which is exactly who the app connects as on a default Neon setup.
- **A non-superuser role.** Superusers bypass RLS regardless of `FORCE`, so
  `withTenant` issues `set local role groundwork_app` before touching anything.
  This was not theoretical: the first version of the isolation test failed for
  precisely this reason, with every tenant seeing every row.

`set_config(..., true)` makes the org setting transaction-local, so it cannot
leak to the next request on a pooled connection.

### The AI layer

- **Long context, not RAG.** Six to fifteen documents is roughly 50–200K tokens,
  which fits in context with room to spare. Retrieval would add a vector store,
  chunking heuristics and retrieval-failure modes in order to make
  cross-document synthesis *worse*.
- **Prompt caching across six calls.** The system prompt and corpus are a
  byte-stable prefix with the cache breakpoint on the last corpus block; each
  stage's instruction goes after it. Only the first call pays to read the
  sources.
- **Six calls, not one.** Each fits inside a function's time budget, a failure
  in the prototype stage does not cost the brief that already succeeded, and the
  reader watches the work arrive over SSE rather than staring at a spinner.
- **Prototype sandboxing.** Generated markup renders in an iframe with
  `sandbox="allow-scripts"` and deliberately *without* `allow-same-origin` —
  together those two would let the framed document remove its own sandbox.

---

## Proving the backend claims

| Requirement | Where it lives |
| --- | --- |
| Multi-tenant architecture | `organizations` as tenant root; `org_id` on every customer table, composite indexes leading with it |
| Strict data isolation | App-level scoping + forced RLS on a restricted role; [`tests/tenant-isolation.test.ts`](tests/tenant-isolation.test.ts) |
| Auth & authorisation | JWT via `jose`; `owner`/`consultant`/`client`; middleware gate plus a live re-check in every data path |
| API design | `/api/projects/:id/sources`, `/api/projects/:id/generate` (SSE), consistent error envelopes |
| Data modelling | 12 tables including the span-level evidence store |
| Automated testing | 66 tests across parsers, verification, binary extraction and isolation |
| CI/CD | GitHub Actions: typecheck, test, build on every PR |
| Preventing bugs | TypeScript strict, Zod at every boundary, and the quote verifier itself |

---

## Demo scenario

Nova Interiors, a 40-person interior fit-out firm in Pune running client projects
on WhatsApp and a shared spreadsheet. Its fixtures
([`fixtures/nova-interiors/`](fixtures/nova-interiors/)) are two call
transcripts, a 69-message WhatsApp export, a process SOP as a real `.docx`, and a
vendor-terms `.pdf` — containing planted contradictions and gaps:

- a first-phase budget given as two lakh by the founder and around five lakh by
  the head of operations two weeks later;
- a disagreement about who approves client-facing updates;
- a materials module that appears only in the second call;
- and several questions nobody thought to ask, including what happens to eight
  months of spreadsheet history on the day the portal goes live.

Stages 2 and 3 exist to surface exactly those.

---

## What I would do next

- **Screenshots.** Images are accepted and stored but not yet read; the next step
  is passing them to the model as image blocks at generation time.
- **Website ingestion.** `fetch` + Readability, with a screenshot API fallback for
  JavaScript-rendered pages.
- **Regeneration diffs.** Artifacts are already versioned; showing what changed
  between v1 and v2 of a brief is a small step from there.
- **Resolving a conflict should propagate.** Today resolution is recorded; it
  should update the requirement it fed.
- **Server-side refusal fallbacks.** `claude-opus-5` can decline a request; the
  code handles the `refusal` stop reason but does not yet configure a fallback
  model, which I would not ship untested against a live key.

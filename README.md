# Groundwork

Turn scattered client inputs — meeting transcripts, WhatsApp exports, PDFs,
process documents, screenshots, a website — into a requirements brief where
every claim can be clicked back to the sentence a human actually said, then into
an improved process, a prioritised solution outline, and a clickable prototype.

Built for the *AI Business Discovery to POC* assignment. The plan it was built
from, and the market survey behind it, is in
[`docs/groundwork-plan.html`](docs/groundwork-plan.html).

---

## Running it

No Docker, no database server, no cloud account.

```bash
npm install
cp .env.example .env      # then set AUTH_SECRET — the file tells you how
npm run setup             # migrate + seed the demo project
npm run dev
```

Open <http://localhost:3000>. The sign-in screen explains the product and
carries these credentials, so there is nothing to look up. Every demo account
uses the password `demo1234`:

| Email | Role | What they see |
| --- | --- | --- |
| `ashika@meridian.example` | owner / consultant | The Nova Interiors engagement, all six documents and all five stages |
| `rohit@novainteriors.example` | client | The published brief and prototype, read-only |
| `dev@northwind.example` | owner of a second tenant | Their own project — and a 404 on Meridian's, even by direct URL |

Or create your own workspace at `/signup`. It starts genuinely empty: no
project, no documents, nothing copied from the demo. The demo material exists
in one account and only there, which is what makes it possible to tell what the
tool read from *your* documents.

**`ANTHROPIC_API_KEY` is optional.** Without it, *Run discovery* replays recorded
model output and labels the result as such. Every citation is still verified
against the real source text and the grounding score is still computed from
those results, so the demo is honest about what it is. With a key set, the same
code path calls `claude-opus-5` for real.

```bash
npm test            # 136 unit tests
npm run test:e2e    # 12 browser tests over the demo walkthrough
npm run typecheck
npm run db:reset    # wipe local data and re-seed
npm run db:fresh    # the opposite: an empty workspace for your own documents
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
downstream is allowed to be a free-floating assertion.

1. **Intake** — transcripts (Teams/Zoom `.vtt`), WhatsApp `.txt` exports, PDFs,
   Word documents, screenshots, website URLs, and text typed or pasted straight
   in. Format is detected from the file's own bytes, not its extension. Sources
   can be withdrawn as well as added, and everything derived from a withdrawn
   document goes with it.
2. **Understand** — the discovery brief: goal, stakeholders, as-is process, pain
   points, requirements, out-of-scope, assumptions. Plus the Conflict Radar and
   the Blind-Spot Register.
3. **Improve** — as-is and to-be process diagrams side by side, each change
   naming the specific waste it removes.
4. **Specify** — roles, modules, screens, and a MoSCoW feature list where every
   row cites its evidence.
5. **Prototype** — not a mock-up but a small working tool, so a client can carry
   out the proposed workflow and find out whether it holds up. It holds real
   state, and an action on one screen has a consequence on another: post a
   progress update and it appears on the client's own view; post something
   touching a date, cost or scope and it queues for approval instead. Rendered
   in a locked-down sandbox and shareable by link.

Alongside those, the work accumulates rather than resetting: **teams** share one
workspace and one ledger, every run is kept and can be **compared** against
another, and the client can **download the proposal** as Markdown.

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

The seeded demo scores **84% — 27 of 32 claims verified**. It is not 100% by
design: four claims are assumptions the model declared as its own, and one is a
planted requirement citing a sentence that appears in no source. It renders with
a red ✗ and the panel says the quote could not be located.

That is the feature working, and it is asserted from both ends — every real
citation must verify, and the planted one must still fail. A verification layer
that cannot be caught failing proves nothing.

---

## Teams, and what a client gets

A workspace is shared. Owners invite by email and role; the invitee opens a
link, chooses a password and is signed straight in. Invitations are rows rather
than stateless signed links, because they must be revocable, must expire, and an
owner must be able to see what is outstanding. The invited address is fixed and
shown read-only, so holding a link cannot become a way to claim somebody else's.

The client gets three things: a forwardable link needing no account, a prototype
they can actually try, and a **proposal to download**. That last is Markdown
rather than a generated PDF — it opens anywhere, pastes into a proposal
template, and survives being edited before it goes out, which is what happens to
these documents. It carries what was understood, what is not working, what is
proposed and what would be built, plus the grounding score and the assumptions,
because a client should see how much of it rests on guesswork. It deliberately
omits the conflict radar: quoting their own people disagreeing is a working
note, not something to hand them.

## The engagement accumulates

Discovery is not a single pass. Three things a consultant does are recorded, and
all three are carried into the next run's prompt as settled context:

- **Deciding a contradiction.** Choosing which position stands, with a note.
- **Answering an open question.** What the client said, in their words.
- **Regenerating.** Artifacts are versioned, never overwritten.

So a second run stops re-litigating what has already been answered. The
**Compare** tab puts two runs against each other — what appeared, what dropped
away, what stayed but was reworded, and how the grounding score moved. Matching
is by what a line says rather than where it sits, because the model reorders
freely between runs; a reordered line reported as "dropped, and a new one added"
would make the view untrustworthy after the first false alarm.

That makes "did the new evidence actually help?" a question with an answer
rather than a feeling — and a fall in grounding is shown as a fall.

This also drove a real fix: the first implementation deleted every conflict
before inserting new ones, so a second run would have silently destroyed every
decision recorded since the first.

---

## Architecture

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 App Router, TypeScript strict | Route handlers for the REST surface, server components for reads |
| Database | PGlite locally, Neon in deployment | One schema, one migration path, zero-setup clone |
| ORM | Drizzle | Typed SQL rather than a query-builder abstraction |
| AI | Official `@anthropic-ai/sdk`, `claude-opus-5` | Direct access to prompt caching and structured output |
| Vision | `claude-haiku-4-5` at ingest | Transcription, not judgement, and it runs once per file |
| Auth | Hand-rolled JWT with `jose`, HTTP-only cookies | The job asks for JWT/RBAC understanding; a library hides it |
| Diagrams | Mermaid, validated before render | A diagram that fails to parse degrades to its source |

### Tenant isolation, twice

`organizations` is the tenant root. Every table holding customer data carries
`org_id`, and isolation is enforced in two independent places:

1. **In the application** — all customer data is read and written inside
   `withTenant()` ([`src/db/tenant.ts`](src/db/tenant.ts)).
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

There is exactly one read in the codebase outside a tenant scope — resolving a
share token, which is what *establishes* the tenant. It is confined to a single
function that selects two ids and nothing else.

### The AI layer

- **Long context, not RAG.** Six to fifteen documents is roughly 50–200K tokens,
  which fits in context with room to spare. Retrieval would add a vector store,
  chunking heuristics and retrieval-failure modes in order to make
  cross-document synthesis *worse*.
- **Prompt caching across six calls.** The system prompt and corpus are a
  byte-stable prefix with the cache breakpoint on the last corpus block. Only
  the first call pays to read the sources.
- **Six calls, not one.** Each fits inside a function's time budget, a failure
  in the prototype stage does not cost the brief that already succeeded, and the
  reader watches the work arrive over SSE.
- **Screenshots are transcribed at ingest**, not passed to each generation call,
  so their content goes through the same verification path as everything else.

### Security decisions worth naming

- **Prototype sandboxing.** `sandbox="allow-scripts"` and deliberately *without*
  `allow-same-origin` — together those two would let the framed document remove
  its own sandbox. An end-to-end test asserts the exact attribute value, so
  nobody can "fix" a console warning by adding it.
- **SSRF.** The URL endpoint makes the server fetch a user-supplied address.
  Private ranges, loopback, link-local (including the cloud metadata address)
  and non-http schemes are refused, and the hostname is resolved and re-checked.
  The residual DNS-rebinding window is documented rather than papered over.
- **Share links** are `noindex`, `no-referrer`, and revoked by rotation so the
  old link stops resolving immediately.

---

## Proving the backend claims

| Requirement | Where it lives |
| --- | --- |
| Multi-tenant architecture | `organizations` as tenant root; `org_id` on every customer table, composite indexes leading with it |
| Strict data isolation | App-level scoping + forced RLS on a restricted role; [`tests/tenant-isolation.test.ts`](tests/tenant-isolation.test.ts) |
| Auth & authorisation | JWT via `jose`; `owner`/`consultant`/`client`; middleware gate plus a live re-check in every data path |
| Teams | Invitations that expire, are single-use and revocable; the last owner cannot be removed |
| API design | REST resources for sources, URL ingestion, generation (SSE), conflicts, questions and sharing; consistent error envelopes |
| Data modelling | 13 tables including the span-level evidence store |
| Automated testing | 136 unit tests + 12 browser tests over the demo walkthrough |
| Multiple environments | Neon branching for preview vs production; migrations run at build |
| CI/CD | GitHub Actions: typecheck, unit tests and build in one job, end-to-end in another |
| Preventing bugs | TypeScript strict, Zod at every boundary, and the quote verifier itself |

---

## Demo scenario

Nova Interiors, a 40-person interior fit-out firm in Pune running client projects
on WhatsApp and a shared spreadsheet. Its fixtures
([`fixtures/nova-interiors/`](fixtures/nova-interiors/)) are six documents in
five formats — two call transcripts, a 69-message WhatsApp export, a process SOP
as a real `.docx`, a vendor-terms `.pdf`, and a screenshot of the master tracker
— containing planted contradictions and gaps:

- a first-phase budget given as two lakh by the founder and around five lakh by
  the head of operations two weeks later;
- a disagreement about who approves client-facing updates;
- a materials module that appears only in the second call;
- and several questions nobody thought to ask, including what happens to eight
  months of spreadsheet history on the day the portal goes live.

Stages 2 and 3 exist to surface exactly those.

---

## Deploying

Configured but not yet deployed. [`vercel.json`](vercel.json) runs migrations as
part of the build, sets per-route durations, and adds security headers.

1. Create a Neon project; put its pooled connection string in `DATABASE_URL`.
2. Set `AUTH_SECRET` and `ANTHROPIC_API_KEY` in the Vercel project.
3. Deploy. Use a separate Neon branch for previews so a preview deployment never
   writes to production data.

---

## What I would do next

- **Deploy it**, which also exercises the Neon path for the first time.
- **A drift timeline** — the sources are already dated, so ordering findings by
  when they were said and flagging where the ask changed is a small step.
- **Grounded chat over the evidence**, using the same verification layer to
  answer follow-up questions with citations.
- **Sending invitations by email.** Today an owner copies the link themselves,
  which is honest but not what a product would do.
- **Server-side refusal fallbacks.** `claude-opus-5` can decline a request; the
  code handles the `refusal` stop reason but does not configure a fallback
  model, which I would not ship untested against a live key.

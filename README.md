# Groundwork

Turn scattered client inputs — meeting transcripts, WhatsApp exports, PDFs,
process documents, screenshots, a website — into a requirements brief where
every claim can be clicked back to the sentence a human actually said, then into
an improved process, a prioritised solution outline, and a clickable prototype.

Built for the *AI Business Discovery to POC* assignment.

**Start here**

| | |
| --- | --- |
| Run it locally | [Running it](#running-it) — two commands, no Docker and no cloud account |
| What it does, stage by stage | [The five stages](#the-five-stages) |
| The idea the whole thing rests on | [Verified grounding](#the-part-that-matters-verified-grounding) |
| Why it is built this way | [Architecture](#architecture) |
| What I assumed, and where I could be wrong | [Assumptions](#assumptions) |
| Plain-language explainer, 19 pages | [`docs/groundwork-explained.pdf`](docs/groundwork-explained.pdf) |
| The plan and market survey it was built from | [`docs/groundwork-plan.html`](docs/groundwork-plan.html) |

The same code is also supplied as a zip. The zip and this repository are
identical except that the zip cannot carry the git history, and the history is
worth a look: every feature was built on its own branch and merged separately,
so `git log --graph --first-parent` reads as a sequence of decisions rather
than one drop of code.

---

## Running it

No Docker, no database server, no cloud account.

```bash
npm install
cp .env.example .env

# AUTH_SECRET is required — it signs session cookies. Generate one:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# paste it after AUTH_SECRET= in .env

npm run setup             # migrate, apply RLS policies, seed the demo
npm run dev
```

That is enough to see everything. `ANTHROPIC_API_KEY` is **optional**: without
it the app replays a recorded analysis of the seeded project, and the
verification layer still runs for real against the actual documents — which is
why the demo can show a claim failing its check. With a key set, the same code
path calls the model. `npm run set-key` writes it into `.env` without the usual
traps (quotes, whitespace, or a duplicate line that dotenv silently ignores),
and the server must be restarted afterwards because `.env` is read once at
startup.

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
code path calls `claude-sonnet-5` for real.

```bash
npm test            # 230 unit tests
npm run test:e2e    # 12 browser tests over the demo walkthrough
npm run typecheck
npm run db:reset    # wipe local data and re-seed
npm run db:fresh    # the opposite: an empty workspace for your own documents
npm run set-key     # writes ANTHROPIC_API_KEY into .env without the usual traps
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
| AI | Official `@anthropic-ai/sdk`, `claude-sonnet-5` | Direct access to prompt caching and structured output |
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
- **Prompt caching is set up, and does not currently pay off — measured, not
  assumed.** The system prompt and corpus are a byte-stable prefix with the
  cache breakpoint on the last corpus block, and the artifact instruction comes
  after it. Every stage still reports `cache_read_input_tokens: 0`. Probing the
  API directly explains why: the structured-output schema sits *ahead* of the
  system prompt in the cached prefix, so two calls that differ only in their
  instruction hit the cache, and two that differ in their schema do not. The six
  stages each need their own schema, so the prefix never repeats.

  The fix would be one schema shared across all six, validated only locally
  afterwards. That is not worth it here: a guaranteed-shape response is what
  makes every downstream stage parseable, in a product whose entire claim is
  that its output can be checked. Output tokens also dominate the bill — the
  brief alone returns ~24k of them against ~11k of cached input — so the saving
  is real but small. Left in place, because the day the schemas converge it
  starts working, and documented here because an efficiency claim nobody
  verified is worse than no claim.
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
| Automated testing | 230 unit tests + 12 browser tests over the demo walkthrough |
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

## Assumptions

Stated plainly, because most of them could reasonably have gone the other way.

**About the assignment**

- **"Scattered inputs" means formats, not volume.** I took the brief to be about
  a handful of documents in incompatible formats, not thousands of files. That
  ruled out a vector database and retrieval: the whole corpus fits in one
  context window, and chunking it would make cross-document synthesis worse
  rather than better. At a few hundred documents this decision reverses.
- **The reviewer's time is the scarcest resource.** Hence a demo that runs with
  no API key, no Docker and no cloud account, and a seeded engagement that shows
  the whole flow without anyone uploading anything.
- **A prototype the client can operate beats a prototype they look at.** The
  assignment says "basic POC". I read that as something they can carry the
  proposed workflow through, which is why the generated demo has working state
  and cross-screen consequences rather than being a clickable picture.

**About the product**

- **A consultant will not trust output they cannot check.** Everything rests on
  this. It is why every claim carries a verbatim quote that is re-checked
  against the source, and why the grounding score is shown rather than hidden.
- **A wrong claim is worse than a missing one.** So an unverifiable claim is
  shown as unverified rather than quietly dropped, and gaps are raised as
  questions instead of being filled with plausible guesses.
- **Clients read what you send them and nothing else.** So the client view and
  the exported proposal deliberately omit the conflict radar — quoting their own
  staff disagreeing with each other is a working note for the consultant.

**About the technical setting**

- **Single Postgres, multi-tenant, small scale.** Row-level security in one
  database is the right shape for tens of workspaces. A database per tenant
  would be right at a different scale and is not this.
- **No email service.** Invitations produce a link you copy to somebody. Adding
  a transactional email provider is an afternoon and would have proved nothing
  about the parts being assessed.
- **The model changes its mind between runs.** Every artifact is versioned and
  nothing is overwritten, and the comparison view exists because two runs of the
  same corpus genuinely differ.

**Where I could be wrong**

- The verification is exact-match with a normalised and a fuzzy fallback. A
  model that paraphrases well but quotes loosely would score badly here even
  when it is right. I would rather that than the reverse.
- Prompt caching is set up and does not currently pay off, for the reason
  documented above. I kept the per-stage schemas anyway. Somebody optimising for
  cost over output guarantees would make the opposite call.
- The recorded-analysis fallback only describes the seeded project, and refuses
  to run against anyone else's documents. That is deliberate, but it does mean
  the no-key demo is a demo rather than a trial.

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
- **Server-side refusal fallbacks.** The model can decline a request; the
  code handles the `refusal` stop reason but does not configure a fallback
  model, which I would not ship untested against a live key.

# Groundwork

Turn scattered client inputs — meeting transcripts, WhatsApp exports, PDFs,
process documents, screenshots — into a requirements brief where every claim can
be clicked back to the sentence a human actually said, and then into a working
prototype.

Built for the *AI Business Discovery to POC* assignment. The full build plan,
including the market survey it came from, is in
[`docs/groundwork-plan.html`](docs/groundwork-plan.html).

---

## Running it

No Docker, no database server, no cloud account.

```bash
npm install
cp .env.example .env      # then set AUTH_SECRET (the file tells you how)
npm run setup             # migrate + seed the demo project
npm run dev
```

Open <http://localhost:3000> and sign in. Every demo account uses the password
`demo1234`:

| Email | Role | What they see |
| --- | --- | --- |
| `ashika@meridian.example` | owner / consultant | The Nova Interiors engagement and its evidence ledger |
| `rohit@novainteriors.example` | client | The read-only shared view, and nothing else |
| `dev@northwind.example` | owner of a second tenant | Their own project — and a 404 on Meridian's, even by direct URL |

`ANTHROPIC_API_KEY` is optional for now: ingestion and every read view work
without it. It is needed once the synthesis pipeline lands.

### The local database

Development and tests run on [PGlite](https://pglite.dev) — real Postgres
compiled to WebAssembly, running inside the Node process with its data in
`./.pglite`. That is why setup is two commands rather than a Docker Compose
file, and it is the same Postgres the deployed app runs, so row-level security,
`EXPLAIN`, and every SQL feature behave identically.

Set `DATABASE_URL` and the app switches to Neon over its WebSocket pool driver.
Nothing else changes: same schema, same migrations, same policies.

```bash
npm test            # parsers + tenant isolation
npm run typecheck
npm run db:reset    # wipe local data and re-seed
```

---

## How it is put together

### Tenant isolation, twice

`organizations` is the tenant root. Every table holding customer data carries
`org_id`, and isolation is enforced in two independent places:

1. **In the application** — all customer data is read and written inside
   `withTenant()` ([`src/db/tenant.ts`](src/db/tenant.ts)), and the queries
   carry their own `where org_id = …`.
2. **In the database** — row-level security policies
   ([`drizzle/policies.sql`](drizzle/policies.sql)) compare `org_id` against a
   transaction-local `app.current_org` setting.

The second layer is what still holds when someone forgets the first. Two details
make it real rather than decorative, and both are easy to get wrong:

- **`FORCE ROW LEVEL SECURITY`.** Without it, policies are skipped for the table
  owner — which is exactly who the app connects as on a default Neon setup.
- **A non-superuser role.** Superusers bypass RLS regardless of `FORCE`, so
  `withTenant` issues `set local role groundwork_app` before it touches
  anything. This was not a theoretical concern: the first version of the
  isolation test failed for precisely this reason.

`set_config(..., true)` makes the org setting transaction-local, so it cannot
leak to the next request that reuses a pooled connection.

[`tests/tenant-isolation.test.ts`](tests/tenant-isolation.test.ts) pins the
behaviour, including the case that matters most — with the application role and
no org set, queries return nothing rather than everything.

### Auth

A signed JWT (`jose`, HS256) in an HTTP-only, SameSite=Lax cookie.
[`src/middleware.ts`](src/middleware.ts) verifies it before a request reaches a
page, but it is treated as a convenience layer, not a security boundary: it
never queries the database, so it cannot know a membership was revoked a minute
ago. Every route that touches tenant data calls `requireSession()` as well.

Roles are `owner`, `consultant` and `client`. A user is global; access is granted
per organization through `memberships`, so the same person can be a consultant in
one workspace and a client in another.

### The Evidence Ledger

Each source is parsed into addressable spans — one chat message, one transcript
turn, one document section — and every span records `charStart`/`charEnd`
offsets into the normalised text the reader is shown.

That invariant is what makes citation highlighting trustworthy, so it is tested
directly: for every span of every fixture,
`text.slice(charStart, charEnd) === span.text`.

Parsers so far:

| Format | Notes |
| --- | --- |
| **WebVTT** (Teams, Zoom) | Merges consecutive cues from one speaker — Teams splits a sentence across four cues. Reads both Teams `<v Name>` voice tags and Zoom's inline `Name:` form. |
| **WhatsApp `.txt` export** | Handles Android and iOS layouts, invisible direction marks in iOS exports, multi-line continuations, localised media placeholders, and system notices. Date order is detected from the file rather than assumed. |
| **Text / Markdown** | Blocks split on blank lines, each tagged with the nearest heading so a citation can say where in a long document it came from. |

PDF, DOCX, image and website ingestion are next.

---

## Where this is up to

Working end to end: multi-tenant schema with enforced isolation, JWT auth with
three roles, the ingestion pipeline for three formats, the Evidence Ledger, and
the consultant and client read views. 31 tests, typecheck and production build
all pass.

Not built yet: the synthesis pipeline (brief, conflicts, open questions), the
process diff, the solution outline, and prototype generation. Those are stages 2
through 5 of the plan.

## Demo scenario

The seeded project is a fictional but deliberately realistic engagement: Nova
Interiors, a 40-person interior fit-out firm in Pune running client projects on
WhatsApp and a shared spreadsheet. Its fixtures
([`fixtures/nova-interiors/`](fixtures/nova-interiors/)) contain planted
contradictions and gaps — a budget stated two different ways across two calls, a
disagreement about who approves client updates, a module that appears only in the
second call, and several questions nobody thought to ask — because those are what
stages 2 and 3 exist to surface.

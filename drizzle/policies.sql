-- Row-level security: the second of the two isolation layers.
--
-- Applied by src/db/migrate.ts after the generated schema migrations, and
-- written to be idempotent so re-running a migration is always safe.
--
-- Three details carry the weight here, and the first two are the ones that
-- quietly turn RLS into decoration when they are missed:
--
--   A non-superuser role. Superusers bypass RLS unconditionally — FORCE does
--   not change that. Migrations run as the owner; request-time work switches
--   to `groundwork_app` inside the transaction (see src/db/tenant.ts), which is
--   the role the policies actually apply to.
--
--   FORCE ROW LEVEL SECURITY. Without it, policies are skipped for the table
--   owner, and on a default Neon setup the owner is who the app connects as.
--
--   current_setting('app.current_org', true) — the `true` means "return NULL
--   rather than raise if unset". A NULL comparison matches no rows, so a query
--   issued outside withTenant() fails closed and returns nothing.
--
-- `organizations` and `users` are deliberately excluded: they are the tenancy
-- directory rather than customer data, and access to them is mediated by a
-- membership lookup before any org id is trusted.

-- 1. The restricted role the application runs as.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'groundwork_app') then
    create role groundwork_app nologin;
  end if;
end
$$;
--> statement-breakpoint

-- The migrating role must be a member of groundwork_app to be allowed to
-- `set role` to it at request time.
do $$
begin
  execute format('grant groundwork_app to %I', current_user);
exception
  when duplicate_object then null;
  when others then null; -- already a member, or is a superuser that needs no grant
end
$$;
--> statement-breakpoint

grant usage on schema public to groundwork_app;
--> statement-breakpoint
grant select, insert, update, delete on all tables in schema public to groundwork_app;
--> statement-breakpoint
alter default privileges in schema public
  grant select, insert, update, delete on tables to groundwork_app;


--> statement-breakpoint
-- 2. Enable, force, and define the isolation policy on every tenant table.
do $$
declare
  t text;
  tenant_tables text[] := array[
    'memberships',
    'projects',
    'sources',
    'evidence_spans',
    'artifacts',
    'claims',
    'citations',
    'conflicts',
    'conflict_sides',
    'open_questions'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists %I on %I', t || '_tenant_isolation', t);
    execute format(
      'create policy %I on %I
         using (org_id = nullif(current_setting(''app.current_org'', true), '''')::uuid)
         with check (org_id = nullif(current_setting(''app.current_org'', true), '''')::uuid)',
      t || '_tenant_isolation',
      t
    );
  end loop;
end
$$;

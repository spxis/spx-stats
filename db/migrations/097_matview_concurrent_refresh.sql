-- Refreshing an api materialized view must never block the site's reads.
--
-- Why: `refresh materialized view x` takes an ACCESS EXCLUSIVE lock on x for the whole rebuild, so every read of x waits, and the anon
-- role's statement_timeout (8 s on production) turns that wait into errors. On 2026-10-13 rebuilding api.player_index (migration 063)
-- locked reads for about 4 minutes. api.refresh() ran a plain refresh of 10 of the 14 views after every release. Only stat_reference
-- (064) and the four country views (068) were refreshed `concurrently`, which takes an EXCLUSIVE lock instead: readers carry on
-- against the old rows until the new ones are merged in.
--
-- This migration is add-only. It does not drop, recreate or rewrite any materialized view and changes no data:
--   1. a unique index on the natural key of each of the six views that had none (they are all small: 1 to 8,913 rows), because
--      `refresh ... concurrently` needs one;
--   2. api.refresh_order(), api.refresh_one() and api.refresh_all() (new; the last two return a jsonb result) and api.refresh() (replaced,
--      still `returns void`, same callers) that refresh EVERY materialized view in schema api one at a time, concurrently, smallest first,
--      each with a lock_timeout, a failure of one not stopping the rest;
--   3. api.swap_matview() (new): the way to change a view's definition without a read-blocking drop and create (AGENTS.md section 8).
-- Needs 015, 034, 036, 037, 056, 063, 064 and 068. Rerunnable.
--
-- Index build lock: a plain `create unique index` on a materialized view takes a SHARE lock, which blocks writes to the view (only a
-- refresh writes to it) and not reads. The six views hold 1 to 8,913 rows each, so every build is a few milliseconds, and the file runs
-- in one transaction (ds1-apply.sh and the Supabase query API both wrap it), where `create index concurrently` is not allowed. So the plain
-- form is the right one here. `lock_timeout` makes the file fail (and roll back, nothing half done) instead of waiting if a refresh holds the
-- view at that moment; run it again a minute later.
--
-- Null keys: provenance (league, checked_by) and quality (resolution) have key columns that can be null. A unique index accepts that
-- (nulls are distinct), and `refresh concurrently` handles it correctly: a row with a null in its key is never matched, so it is deleted
-- and inserted again each time. Both views are tiny (107 and 4,462 rows), so that costs nothing.

begin;
set local lock_timeout = '5s';

-- api.totals is one row; its refreshed_at (now() at each refresh) is the key of that row.
create unique index if not exists totals_refreshed_at_key on api.totals (refreshed_at);
create unique index if not exists games_by_source_key on api.games_by_source (league, source);
create unique index if not exists quality_key on api.quality (kind, source, entity, what, resolution);
create unique index if not exists provenance_key on api.provenance (kind, league, source, checked_by, outcome);
-- one row per team season: a franchise has one team season in a season of one league
create unique index if not exists team_season_index_key on api.team_season_index (league, year, franchise_id);
-- one row per team season; team_id is core.team_season.team_season_id
create unique index if not exists standing_index_key on api.standing_index (team_id);

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Refreshing: three functions.
--
-- api.refresh_order(): the materialized views of schema api in the order they are refreshed, found from the catalog (not from a list), so
-- a view added later is refreshed without editing anything.
--   * `mode` is `concurrently` for a view with data and a usable unique index (unique, valid, immediate, no WHERE, plain columns), else
--     `plain`. A `plain` view blocks reads while it refreshes, so it is put LAST. db/checks/081_matview_unique_index.sql reports it.
--   * Order: a view built from another one comes after it (team_index after team_season_index), then smallest first, so the small ones
--     are fresh within milliseconds and the big ones come last.
create or replace function api.refresh_order() returns table (view_name text, mode text, bytes bigint) language sql stable security definer set search_path = pg_catalog as $$
  with recursive mv as (
    select c.oid, n.nspname, c.relname, c.relispopulated,
           exists (select 1 from pg_index i
                   where i.indrelid = c.oid and i.indisunique and i.indisvalid and i.indislive and i.indimmediate
                     and i.indpred is null and i.indexprs is null) as has_key,
           pg_total_relation_size(c.oid) as sz
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'm' and n.nspname = 'api'),
  -- what each view reads, through plain views in between
  dep as (
    select rw.ev_class as mv_oid, d.refobjid as dep_oid
    from pg_rewrite rw join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = rw.oid and d.refobjid <> rw.ev_class
    where d.refclassid = 'pg_class'::regclass),
  reach as (
    select mv_oid as top, dep_oid as oid from dep where mv_oid in (select oid from mv)
    union
    select reach.top, dep.dep_oid from reach join dep on dep.mv_oid = reach.oid)
  select format('%I.%I', mv.nspname, mv.relname),
         case when mv.has_key and mv.relispopulated then 'concurrently' else 'plain' end,
         mv.sz
  from mv
  order by (mv.has_key and mv.relispopulated) desc,
           (select count(*) from reach where reach.top = mv.oid and reach.oid in (select oid from mv)),
           mv.sz, mv.relname
$$;

-- api.refresh_one('api.x'): refresh one view of that list and return {"view", "mode", "ms", "status": "ok" | "failed", "error"}.
-- It does not raise for a failure of that view (the error is in the result); a cancel (statement_timeout of the caller, pg_cancel_backend)
-- is not caught, so it stops the call. `lock_timeout` is 10 s: a refresh waits that long for its lock, then gives up with a clear error,
-- instead of queueing for an ACCESS EXCLUSIVE lock that would hold up every reader behind it.
-- THE CALLER'S statement_timeout is the only time limit on the rebuild itself: a statement_timeout set inside a function is not applied
-- to the statements it runs (tested on Postgres 17: the timer is armed once, when the outer statement starts). So a caller that wants a
-- limit per view calls this once per view, as separate statements:   set statement_timeout = '10min'; select api.refresh_one('api.player_index');
create or replace function api.refresh_one(p_view text) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  o record;
  t0 timestamptz := clock_timestamp();
  old_lock text := current_setting('lock_timeout');
begin
  select * into o from api.refresh_order() where view_name = p_view;
  if not found then
    raise exception 'api.refresh_one: % is not a materialized view of schema api', p_view;
  end if;
  begin
    perform set_config('lock_timeout', '10s', true);
    execute 'refresh materialized view ' || case when o.mode = 'concurrently' then 'concurrently ' else '' end || o.view_name;
    perform set_config('lock_timeout', old_lock, true);
    return jsonb_build_object('view', o.view_name, 'mode', o.mode, 'ms', (extract(epoch from clock_timestamp() - t0) * 1000)::int, 'status', 'ok');
  exception when others then
    perform set_config('lock_timeout', old_lock, true);
    return jsonb_build_object('view', o.view_name, 'mode', o.mode, 'ms', (extract(epoch from clock_timestamp() - t0) * 1000)::int,
                              'status', 'failed', 'error', left(sqlerrm, 300));
  end;
end $$;
revoke all on function api.refresh_one(text) from public, anon, authenticated;
revoke all on function api.refresh_order() from public, anon, authenticated;
comment on function api.refresh_order() is 'The materialized views of schema api in refresh order (dependencies first, then smallest first, views without a unique index last) with their refresh mode.';
comment on function api.refresh_one(text) is 'Refreshes one materialized view of schema api (concurrently when it has a unique index) and returns a jsonb result; its failure is in the result, not raised.';

-- api.refresh_all(): refresh_one for every view in that order, in one call. A view that fails does not stop the rest. Returns
-- {"views": [refresh_one results], "refreshed": n, "failed": n, "total_ms": n}.
-- One call is one transaction: the EXCLUSIVE locks of the views done so far stay until it returns. They do not block reads; they block another
-- refresh and any ALTER / rename of those views (which is why api.swap_matview() uses a short lock_timeout). A statement_timeout of the caller
-- covers the whole call, not each view; to limit each view, call api.refresh_one() per view (the names are in api.refresh_order()).
-- Cost: a concurrent refresh builds the new rows in a temporary table, diffs them against the old ones and applies only the difference,
-- so it takes 1 to 4 times a plain refresh (about 4 times when nearly every row changed) and leaves dead rows for autovacuum.
-- It is the price of keeping reads open.
create or replace function api.refresh_all() returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  o record;
  res jsonb;
  out jsonb := '[]'::jsonb;
  t_all timestamptz := clock_timestamp();
  n_ok int := 0;
  n_fail int := 0;
begin
  for o in select view_name from api.refresh_order() loop
    res := api.refresh_one(o.view_name);
    out := out || res;
    if res->>'status' = 'ok' then n_ok := n_ok + 1; else n_fail := n_fail + 1; end if;
  end loop;
  return jsonb_build_object('views', out, 'refreshed', n_ok, 'failed', n_fail,
                            'total_ms', (extract(epoch from clock_timestamp() - t_all) * 1000)::int);
end $$;
revoke all on function api.refresh_all() from public, anon, authenticated;
comment on function api.refresh_all() is 'Refreshes every materialized view in schema api in api.refresh_order(), one at a time; a failure does not stop the rest. Returns a jsonb summary.';

-- api.refresh(): what every caller (the release runner, scripts/daily, the load scripts) already runs. Same name and result, now with the
-- behaviour above. A view that failed is a WARNING here, not an error: an error would roll back the views that did refresh. A caller that
-- wants the per-view result calls api.refresh_all() instead (or api.refresh_one() per view, each under its own statement_timeout).
create or replace function api.refresh() returns void language plpgsql security definer set search_path = pg_catalog as $$
declare res jsonb;
begin
  res := api.refresh_all();
  if (res->>'failed')::int > 0 then
    raise warning 'api.refresh: % view(s) failed: %', res->>'failed',
      (select string_agg(v->>'view' || ' (' || (v->>'error') || ')', '; ') from jsonb_array_elements(res->'views') v where v->>'status' = 'failed');
  end if;
end $$;
revoke all on function api.refresh() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- api.swap_matview('<view>', '<view>_new'): put a rebuilt materialized view in place of the live one.
-- A materialized view's query cannot be altered, and `drop materialized view` + `create materialized view` leaves the name missing, then
-- locked, for as long as the rebuild takes (about 4 minutes for player_index). The pattern instead:
--   1. in its own transaction (or file), BEFORE the swap, build the new one under another name, with its indexes. Readers do not see it:
--          create materialized view api.x_new as <new query>;                        -- slow part; locks only x_new
--          create unique index x_new_key on api.x_new (<natural key>);              -- plus the other indexes, named x_new_*
--          analyze api.x_new;
--   2. in a second, short transaction:        select api.swap_matview('x', 'x_new');
--   3. the swap drops the old copy. api.refresh() needs no change (it finds the view by its name in the catalog).
-- The swap takes ACCESS EXCLUSIVE locks for a few milliseconds. With `lock_timeout` at 5 s it gives up (and rolls back, nothing changed)
-- rather than queue behind a running refresh while readers queue behind it: run it again when no refresh is running.
-- It renames x to x_old and drops it, renames x_new to x and its indexes named x_new_* to x_*, copies the comment, and grants select to
-- anon and authenticated (as every api view has); all in the caller's one transaction, so a failure leaves the old view untouched. It
-- refuses, changing nothing, if x_new is unpopulated or has no unique index, or if a view or another materialized view is built from x
-- (dropping x would break it: drop and recreate those in the same file, after the swap).
-- Names are bare (no schema); both live in schema api.
create or replace function api.swap_matview(p_name text, p_new text) returns void language plpgsql set search_path = pg_catalog as $$
declare
  old_oid oid := to_regclass(format('api.%I', p_name));
  new_oid oid := to_regclass(format('api.%I', p_new));
  cmt text;
  ix record;
  dependents text;
begin
  if old_oid is null or new_oid is null then
    raise exception 'api.swap_matview: api.% or api.% does not exist', p_name, p_new;
  end if;
  if (select relkind from pg_class where oid = old_oid) <> 'm' or (select relkind from pg_class where oid = new_oid) <> 'm' then
    raise exception 'api.swap_matview: both must be materialized views';
  end if;
  if not (select relispopulated from pg_class where oid = new_oid) then
    raise exception 'api.swap_matview: api.% is not populated', p_new;
  end if;
  if not exists (select 1 from pg_index i where i.indrelid = new_oid and i.indisunique and i.indisvalid and i.indpred is null and i.indexprs is null) then
    raise exception 'api.swap_matview: api.% needs a unique index on plain columns (refresh concurrently requires it)', p_new;
  end if;
  select string_agg(distinct c.relnamespace::regnamespace || '.' || c.relname, ', ') into dependents
  from pg_depend d join pg_rewrite r on r.oid = d.objid join pg_class c on c.oid = r.ev_class
  where d.classid = 'pg_rewrite'::regclass and d.refobjid = old_oid and r.ev_class <> old_oid;
  if dependents is not null then
    raise exception 'api.swap_matview: % is built from api.%; drop it and recreate it in the same file after the swap', dependents, p_name;
  end if;

  set local lock_timeout = '5s';
  cmt := obj_description(old_oid, 'pg_class');
  execute format('alter materialized view api.%I rename to %I', p_name, p_name || '_old');
  execute format('drop materialized view api.%I', p_name || '_old');   -- frees the old index names too (same transaction: all or nothing)
  execute format('alter materialized view api.%I rename to %I', p_new, p_name);
  for ix in select c.relname from pg_index i join pg_class c on c.oid = i.indexrelid
            where i.indrelid = new_oid and c.relname like p_new || '\_%' loop
    execute format('alter index api.%I rename to %I', ix.relname, p_name || substr(ix.relname, length(p_new) + 1));
  end loop;
  if cmt is not null then
    execute format('comment on materialized view api.%I is %L', p_name, cmt);
  end if;
  execute format('grant select on api.%I to anon, authenticated', p_name);
end $$;
revoke all on function api.swap_matview(text, text) from public, anon, authenticated;
comment on function api.swap_matview(text, text) is 'Swaps api.<new> in for api.<name> (rename, indexes, comment, grants, drop old) in one short transaction. See migration 097.';

analyze api.totals;
analyze api.games_by_source;
analyze api.quality;
analyze api.provenance;
analyze api.team_season_index;
analyze api.standing_index;

commit;

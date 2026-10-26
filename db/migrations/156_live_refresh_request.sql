-- Admin "Refresh" requests for the live score layer: one game, one day's list, a league, the main five, all sports, with the sources the admin ticked.
-- PRODUCTION AND DS1 migration (DS1 first, then production; needs 053 and 150). Add-only and rerunnable apart from the open-request index, which is
-- replaced by one that allows one open request of each class (see below). Nothing is dropped from the data.
--
-- A request row now says what to refresh: `scope` (game, day, league, main5, all), the league, the day or the game id, and the source ids ticked in the
-- picker (null = the registry defaults). kind 'live' is a refresh of the live layer alone: the runner runs scripts/daily/run.py --live-only (read-only on
-- DS1, writes Turso only) and never prepares a release. kind 'scores' with a scope is the existing slow path (daily job, release, your click counts as the
-- approval) preceded by the same live refresh. A kind 'scores' row with no scope behaves exactly as before.

alter table meta.score_update_request add column if not exists scope text;
alter table meta.score_update_request add column if not exists game_day date;
alter table meta.score_update_request add column if not exists game_id bigint;
alter table meta.score_update_request add column if not exists sources text[];
comment on column meta.score_update_request.scope is 'What a live or scoped scores request covers: game, day, league, main5 or all. Null for a request made before migration 156.';
comment on column meta.score_update_request.sources is 'The score source ids the admin ticked (meta source registry, scripts/daily/sources.py). Null means the defaults.';

alter table meta.score_update_request drop constraint if exists score_update_request_kind_check;
alter table meta.score_update_request add constraint score_update_request_kind_check check (kind in ('scores', 'drift', 'live'));
alter table meta.score_update_request drop constraint if exists score_update_request_league_kind_check;
alter table meta.score_update_request add constraint score_update_request_league_kind_check check (league is null or kind in ('scores', 'live'));
alter table meta.score_update_request drop constraint if exists score_update_request_scope_check;
alter table meta.score_update_request add constraint score_update_request_scope_check check (
  scope is null
  or (kind in ('scores', 'live') and (
       (scope = 'game' and kind = 'live' and game_id is not null and league is null and game_day is null)
    or (scope = 'day' and kind = 'live' and league is not null and game_day is not null and game_id is null)
    or (scope = 'league' and league is not null and game_day is null and game_id is null)
    or (scope in ('main5', 'all') and league is null and game_day is null and game_id is null))));
alter table meta.score_update_request drop constraint if exists score_update_request_sources_check;
alter table meta.score_update_request add constraint score_update_request_sources_check check (sources is null or (cardinality(sources) between 1 and 8 and array_position(sources, null) is null));

-- One open request of each class: a live refresh must not wait behind the slow path's "one open request" (a scores job can run for minutes),
-- and the slow path keeps its rule.
drop index if exists meta.score_update_request_one_open;
create unique index score_update_request_one_open on meta.score_update_request ((kind = 'live')) where status in ('queued', 'running');

-- 150's queue_request, with its "a request is already open" check limited to the slow path's kinds (a live refresh has its own check below).
create or replace function api.queue_request(p_secret text, p_actor text, p_kind text, p_league text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := btrim(coalesce(p_actor, ''));
  v_league text := nullif(btrim(coalesce(p_league, '')), '');
  v_id bigint;
begin
  if not api.release_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(v_actor) < 1 or length(v_actor) > 80 or v_actor ~* '^(auto:|request:|system$)' or p_kind not in ('scores', 'drift')
     or (v_league is not null and (p_kind <> 'scores' or v_league !~ '^[a-z0-9_]{2,20}$')) then
    raise exception 'bad request' using errcode = '22023';
  end if;
  if exists (select 1 from meta.score_update_request where status in ('queued', 'running') and kind <> 'live') then
    raise exception 'a request is already open' using errcode = '55006';
  end if;
  if exists (select 1 from meta.score_update_request
             where kind = p_kind and league is not distinct from v_league and coalesce(finished_at, requested_at) > now() - interval '10 minutes') then
    raise exception 'wait about 10 minutes after the last request' using errcode = '55000';
  end if;
  begin
    insert into meta.score_update_request (requested_by, kind, league) values (v_actor, p_kind, v_league) returning id into v_id;
  exception when unique_violation then
    raise exception 'a request is already open' using errcode = '55006';
  end;
  return jsonb_build_object('id', v_id, 'status', 'queued', 'kind', p_kind, 'league', v_league);
end;
$$;
revoke all on function api.queue_request(text, text, text, text) from public, anon, authenticated;

-- The one place a scoped or live request row is made.
--   p_settle false: kind 'live', any scope. One open live request; the same target needs about 30 seconds between requests (the sources' answers are
--                   kept a minute anyway).
--   p_settle true : kind 'scores' with a scope league, main5 or all (the slow path settles a whole league, never one game or one day): the 10 minute
--                   rule of 150 applies per league/scope.
-- p_day must fall in the 7 days the live layer keeps (plus tomorrow); the league and the sources are checked by shape here and by the runner against its lists.
create or replace function api.request_live(p_secret text, p_actor text, p_scope text, p_league text, p_day date, p_game_id bigint, p_sources text[], p_settle boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := btrim(coalesce(p_actor, ''));
  v_league text := nullif(btrim(coalesce(p_league, '')), '');
  v_kind text := case when coalesce(p_settle, false) then 'scores' else 'live' end;
  v_sources text[] := case when p_sources is null or cardinality(p_sources) = 0 then null else (select array_agg(distinct s order by s) from unnest(p_sources) s) end;
  v_id bigint;
begin
  if not api.release_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(v_actor) < 1 or length(v_actor) > 80 or v_actor ~* '^(auto:|request:|system$)'
     or p_scope not in ('game', 'day', 'league', 'main5', 'all')
     or (v_league is not null and v_league !~ '^[a-z0-9_]{2,20}$')
     or (v_sources is not null and (cardinality(v_sources) > 8 or exists (select 1 from unnest(v_sources) s where s is null or s !~ '^[a-z0-9_]{2,30}$')))
     or (p_scope = 'game' and (v_kind <> 'live' or p_game_id is null or p_game_id < 1 or v_league is not null or p_day is not null))
     or (p_scope = 'day' and (v_kind <> 'live' or v_league is null or p_day is null or p_game_id is not null))
     or (p_scope = 'league' and (v_league is null or p_day is not null or p_game_id is not null))
     or (p_scope in ('main5', 'all') and (v_league is not null or p_day is not null or p_game_id is not null))
     or (p_day is not null and (p_day < current_date - 8 or p_day > current_date + 2)) then
    raise exception 'bad request' using errcode = '22023';
  end if;
  if v_kind = 'live' then
    if exists (select 1 from meta.score_update_request where kind = 'live' and status in ('queued', 'running')) then
      raise exception 'a request is already open' using errcode = '55006';
    end if;
    if exists (select 1 from meta.score_update_request
               where kind = 'live' and scope = p_scope and league is not distinct from v_league and game_day is not distinct from p_day and game_id is not distinct from p_game_id
                 and coalesce(finished_at, requested_at) > now() - interval '30 seconds') then
      raise exception 'wait about 30 seconds after the last request for this' using errcode = '55000';
    end if;
  else
    if exists (select 1 from meta.score_update_request where kind <> 'live' and status in ('queued', 'running')) then
      raise exception 'a request is already open' using errcode = '55006';
    end if;
    if exists (select 1 from meta.score_update_request
               where kind = 'scores' and league is not distinct from v_league and coalesce(finished_at, requested_at) > now() - interval '10 minutes') then
      raise exception 'wait about 10 minutes after the last request' using errcode = '55000';
    end if;
  end if;
  begin
    insert into meta.score_update_request (requested_by, kind, scope, league, game_day, game_id, sources)
    values (v_actor, v_kind, p_scope, v_league, p_day, p_game_id, v_sources) returning id into v_id;
  exception when unique_violation then
    raise exception 'a request is already open' using errcode = '55006';
  end;
  return jsonb_build_object('id', v_id, 'status', 'queued', 'kind', v_kind, 'scope', p_scope);
end;
$$;
revoke all on function api.request_live(text, text, text, text, date, bigint, text[], boolean) from public;
grant execute on function api.request_live(text, text, text, text, date, bigint, text[], boolean) to anon, authenticated;

-- 053's dashboard, with the last 15 slow-path requests and the last 10 live refreshes listed apart, so a run of refreshes never pushes the slow path's last request out of the list the cooldown is read from.
create or replace function api.release_dashboard(p_secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not api.release_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'pending', (select coalesce(jsonb_agg(to_jsonb(r) - 'digest' order by r.id), '[]'::jsonb)
                from meta.data_release r where r.status = 'pending'),
    'approved', (select coalesce(jsonb_agg(to_jsonb(r) - 'digest' - 'preview' - 'checks' order by r.id), '[]'::jsonb)
                 from meta.data_release r where r.status in ('approved', 'running')),
    'recent', (select coalesce(jsonb_agg(x order by (x ->> 'id')::bigint desc), '[]'::jsonb)
               from (select to_jsonb(r) - 'digest' - 'preview' - 'checks' as x
                     from meta.data_release r where r.status not in ('pending', 'approved', 'running')
                     order by r.id desc limit 60) q),
    'sync', (select coalesce(jsonb_agg(to_jsonb(s) order by s.table_name), '[]'::jsonb) from meta.sync_status s),
    'space', (select coalesce(jsonb_agg(jsonb_build_object('table', t.name, 'bytes', t.bytes) order by t.bytes desc), '[]'::jsonb)
              from (select c.relnamespace::regnamespace::text || '.' || c.relname as name, pg_total_relation_size(c.oid) as bytes
                    from pg_class c
                    where c.relkind in ('r', 'p') and not c.relispartition
                      and c.relnamespace::regnamespace::text in ('core', 'meta', 'ref')) t),
    'auto', (select to_jsonb(a) - 'id' from meta.auto_approval a),
    'requests', (select coalesce(jsonb_agg(x order by (x ->> 'id')::bigint desc), '[]'::jsonb)
                 from (select to_jsonb(q) || jsonb_build_object('release_status', (select r.status from meta.data_release r where r.number = q.release_number)) as x
                       from (select * from meta.score_update_request where kind <> 'live' order by id desc limit 15) q
                       union all
                       select to_jsonb(q) as x from (select * from meta.score_update_request where kind = 'live' order by id desc limit 10) q) s),
    'request_cooldown_minutes', 10,
    'server_now', now(),
    'database_bytes', pg_database_size(current_database())
  );
end;
$$;
revoke all on function api.release_dashboard(text) from public;
grant execute on function api.release_dashboard(text) to anon, authenticated;

notify pgrst, 'reload schema';

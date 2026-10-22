-- "Update now" per league on /admin/ops: a scores request may name one league (nhl, nba, mlb, nfl, cfl). PRODUCTION AND DS1 migration
-- (DS1 first, then production, like 053, which this builds on; needs 053 and 104). Add-only and rerunnable: a column, two checks, one new
-- function (and the old 3-argument function now calls it) and ops_dashboard with one more key. Nothing is dropped, renamed or rewritten.
--
-- The request row gains `league` (null = every league, as before). The runner (scripts/release/release.py) runs
-- `scripts/daily/run.py --apply --league <league>` for a request that names one, under the same shared lock, the same open-release check and
-- the same auto-approval policy as an all-leagues request. A league the runner does not know ends the request as failed.
-- Still one open request at a time (the unique index of 053), and about 10 minutes after the last request of the same kind AND league.

alter table meta.score_update_request add column if not exists league text;
alter table meta.score_update_request drop constraint if exists score_update_request_league_check;
alter table meta.score_update_request add constraint score_update_request_league_check check (league is null or league ~ '^[a-z0-9_]{2,20}$');
alter table meta.score_update_request drop constraint if exists score_update_request_league_kind_check;
alter table meta.score_update_request add constraint score_update_request_league_kind_check check (league is null or kind = 'scores');
comment on column meta.score_update_request.league is 'The league a scores request is limited to (lower-case league code), null for every league. Only for kind scores.';

-- The one place a request row is made. The 3-argument form of 053 stays (it calls this with no league), so a site that has not been
-- redeployed yet keeps working.
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
  if exists (select 1 from meta.score_update_request where status in ('queued', 'running')) then
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

create or replace function api.queue_request(p_secret text, p_actor text, p_kind text)
returns jsonb language sql security definer set search_path = '' as $$
  select api.queue_request(p_secret, p_actor, p_kind, null::text);
$$;
revoke all on function api.queue_request(text, text, text) from public, anon, authenticated;

-- "Update now" on one league's row of /admin/ops.
create or replace function api.request_league_update(p_secret text, p_actor text, p_league text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_league is null or btrim(p_league) = '' then
    raise exception 'bad request' using errcode = '22023';
  end if;
  return api.queue_request(p_secret, p_actor, 'scores', p_league);
end;
$$;
revoke all on function api.request_league_update(text, text, text) from public;
grant execute on function api.request_league_update(text, text, text) to anon, authenticated;

-- 104's dashboard plus the last scores requests (every league and one league), so /admin/ops can switch the buttons off while one is open
-- and say what the last "Update now" of a league did. Same keys as before; `score_requests` is new.
create or replace function api.ops_dashboard(p_secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not api.release_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'latest', (select jsonb_build_object('id', s.id, 'taken_at', s.taken_at, 'payload', s.payload) from meta.ops_status s order by s.id desc limit 1),
    'history', (select coalesce(jsonb_agg(h order by (h ->> 'id')::bigint), '[]'::jsonb)
                from (select jsonb_build_object('id', s.id, 't', s.taken_at,
                                                'pages', s.payload #> '{harvester,hour,archived}',
                                                'requests', s.payload #> '{harvester,hour,requests}',
                                                'gaps', s.payload #> '{harvester,gap_total}',
                                                'queued', s.payload #> '{harvester,queued_total}',
                                                'differs', s.payload #> '{sync,differs}') as h
                      from meta.ops_status s order by s.id desc limit 96) q),
    'requests', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id desc), '[]'::jsonb)
                 from (select id, kind, requested_by, requested_at, status, finished_at, summary from meta.ops_request order by id desc limit 10) r),
    'score_requests', (select coalesce(jsonb_agg(to_jsonb(q) order by q.id desc), '[]'::jsonb)
                       from (select id, league, requested_by, requested_at, status, started_at, finished_at, summary, release_number
                             from meta.score_update_request where kind = 'scores' order by id desc limit 12) q),
    'server_now', now()
  );
end;
$$;
revoke all on function api.ops_dashboard(text) from public;
grant execute on function api.ops_dashboard(text) to anon, authenticated;

notify pgrst, 'reload schema';

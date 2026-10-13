-- "Request scores update" and "Check now" (drift) on /admin/data, the admin bar summary, and the request list. Apply on DS1 and on production
-- (after 045 and 047). Rerunnable. Nothing here is readable or writable by anon or authenticated except through the functions.
--
-- Production cannot reach DS1, so the site cannot start a scores update. A signed-in admin's click writes ONE row to
-- meta.score_update_request; the release runner (which already queries production once a minute) sees it, runs the daily
-- scores job against DS1, prepares a daily_scores release and approves it as 'request:<admin email>' if the auto-approval
-- policy passes and the global Hold switch is off. The runner writes the status and a short summary back to the row.
-- DS1 carries the table only so the migration is the same on both sides; the runner writes the row on production.

create table if not exists meta.score_update_request (
  id            bigint generated always as identity primary key,
  requested_by  text not null check (length(requested_by) between 1 and 80),
  requested_at  timestamptz not null default now(),
  status        text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'nothing')),
  started_at    timestamptz,
  finished_at   timestamptz,
  summary       text check (length(summary) <= 600),
  release_number text,
  kind          text not null default 'scores' check (kind in ('scores', 'drift'))
);
comment on table meta.score_update_request is 'A signed-in admin''s request for the runner: kind scores (a scores update) or drift (a drift check). status: queued, running, done, failed, nothing (nothing new). At most one queued or running row.';
create unique index if not exists score_update_request_one_open on meta.score_update_request ((true)) where status in ('queued', 'running');
create index if not exists score_update_request_recent on meta.score_update_request (id desc);
alter table meta.score_update_request enable row level security;
revoke all on meta.score_update_request from public, anon, authenticated;

-- 047's approve_release, and the names the runner uses for gated approvals ('request:') cannot be claimed by the site either
create or replace function api.approve_release(p_secret text, p_id bigint, p_approve boolean, p_actor text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_number text;
  v_actor text := btrim(coalesce(p_actor, ''));
begin
  if not api.release_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(v_actor) < 1 or length(v_actor) > 80 or p_approve is null or v_actor ~* '^(auto:|request:|system$)' then
    raise exception 'bad request' using errcode = '22023';
  end if;
  update meta.data_release
     set status = case when p_approve then 'approved' else 'rejected' end,
         approved_by = v_actor,
         approved_at = now()
   where id = p_id
     and status = 'pending'
     and (not p_approve or coalesce(jsonb_array_length(preview -> 'blockers'), 0) = 0)
  returning number into v_number;
  if v_number is null then
    raise exception 'release is not pending, or it has blockers' using errcode = '22023';
  end if;
  return jsonb_build_object('number', v_number, 'status', case when p_approve then 'approved' else 'rejected' end);
end;
$$;
revoke all on function api.approve_release(text, bigint, boolean, text) from public;
grant execute on function api.approve_release(text, bigint, boolean, text) to anon, authenticated;

-- Rerunnable on a table made by an earlier version of this file
alter table meta.score_update_request add column if not exists kind text not null default 'scores';
alter table meta.score_update_request drop constraint if exists score_update_request_kind_check;
alter table meta.score_update_request add constraint score_update_request_kind_check check (kind in ('scores', 'drift'));

-- The only write the site can make for the runner: add one queued request. One open request at a time, of any kind (also enforced
-- by the unique index, so two clicks at once make one row), and about 10 minutes after the last request of the same kind ended.
-- Not callable through the API; the two functions below are.
create or replace function api.queue_request(p_secret text, p_actor text, p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := btrim(coalesce(p_actor, ''));
  v_id bigint;
begin
  if not api.release_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(v_actor) < 1 or length(v_actor) > 80 or v_actor ~* '^(auto:|request:|system$)' or p_kind not in ('scores', 'drift') then
    raise exception 'bad request' using errcode = '22023';
  end if;
  if exists (select 1 from meta.score_update_request where status in ('queued', 'running')) then
    raise exception 'a request is already open' using errcode = '55006';
  end if;
  if exists (select 1 from meta.score_update_request where kind = p_kind and coalesce(finished_at, requested_at) > now() - interval '10 minutes') then
    raise exception 'wait about 10 minutes after the last request' using errcode = '55000';
  end if;
  begin
    insert into meta.score_update_request (requested_by, kind) values (v_actor, p_kind) returning id into v_id;
  exception when unique_violation then
    raise exception 'a request is already open' using errcode = '55006';
  end;
  return jsonb_build_object('id', v_id, 'status', 'queued', 'kind', p_kind);
end;
$$;
revoke all on function api.queue_request(text, text, text) from public, anon, authenticated;

create or replace function api.request_score_update(p_secret text, p_actor text)
returns jsonb language sql security definer set search_path = '' as $$
  select api.queue_request(p_secret, p_actor, 'scores');
$$;
revoke all on function api.request_score_update(text, text) from public;
grant execute on function api.request_score_update(text, text) to anon, authenticated;

create or replace function api.request_drift_check(p_secret text, p_actor text)
returns jsonb language sql security definer set search_path = '' as $$
  select api.queue_request(p_secret, p_actor, 'drift');
$$;
revoke all on function api.request_drift_check(text, text) from public;
grant execute on function api.request_drift_check(text, text) to anon, authenticated;

-- 047's dashboard, plus the recent requests (with the status of the release each one prepared) and the server's clock
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
                       from meta.score_update_request q order by q.id desc limit 15) s),
    'request_cooldown_minutes', 10,
    'server_now', now(),
    'database_bytes', pg_database_size(current_database())
  );
end;
$$;
revoke all on function api.release_dashboard(text) from public;
grant execute on function api.release_dashboard(text) to anon, authenticated;

-- A cheap summary for the admin bar (three small counts, no table sizes). 'waiting' counts the pending releases that will not
-- approve themselves: an eligible daily_scores release that is not held, while auto-approval is on, is not counted.
create or replace function api.release_summary(p_secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_paused boolean := coalesce((select a.paused from meta.auto_approval a), false);
begin
  if not api.release_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'waiting', (select count(*) from meta.data_release r
                where r.status = 'pending'
                  and not (r.kind = 'daily_scores' and (r.preview #>> '{auto,eligible}') = 'true' and r.held_at is null and not v_paused)),
    'drift', (select count(*) from meta.data_release r where r.status = 'pending' and r.created_by = 'drift'),
    'paused', v_paused
  );
end;
$$;
revoke all on function api.release_summary(text) from public;
grant execute on function api.release_summary(text) to anon, authenticated;

notify pgrst, 'reload schema';

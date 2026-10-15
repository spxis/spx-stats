-- /admin/ops: the DS1 side of the project on one internal page. PRODUCTION migration (apply with the Supabase MCP apply_migration; it is
-- also safe to run on DS1, which is what the tests do, but DS1 does not need it). Add-only and rerunnable. Needs 045 (api.release_secret_ok)
-- and 053. Nothing here is readable or writable by anon or authenticated except through the functions at the end, which need the release
-- approval secret.
--
-- Production cannot reach DS1, so the release runner (scripts/release/ops.py, on the NAS next to DS1) pushes ONE status snapshot into
-- meta.ops_status every 15 minutes (only when something changed, or once an hour) and the site reads the latest through api.ops_dashboard.
-- Controls go the other way the same way every admin control does: a click adds a row to meta.ops_request, the runner acts within a minute.
-- Neither table is a release table (the drift check and prepare skip them: RESERVED in release.py, compare.py).

-- ---------------------------------------------------------------- the snapshots (a ring of the latest 96)

create table if not exists meta.ops_status (
  id       bigint generated always as identity primary key,
  taken_at timestamptz not null default now(),
  hash     text not null,
  payload  jsonb not null check (octet_length(payload::text) <= 32000)
);
comment on table meta.ops_status is 'Status snapshots of the DS1 side written by the runner (scripts/release/ops.py), newest 96 kept. Not a release table.';
alter table meta.ops_status enable row level security;
revoke all on meta.ops_status from public, anon, authenticated;

-- The runner's one write: add a snapshot and keep the newest 96. Only the database owner (the Management API) can call it.
create or replace function meta.ops_status_put(p_hash text, p_payload jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  insert into meta.ops_status (hash, payload) values (p_hash, p_payload) returning id into v_id;
  delete from meta.ops_status where id <= v_id - 96;
  return v_id;
end;
$$;
revoke all on function meta.ops_status_put(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- the requests

create table if not exists meta.ops_request (
  id           bigint generated always as identity primary key,
  kind         text not null check (kind in ('snapshot', 'harvest_pause', 'harvest_resume')),
  requested_by text not null check (length(requested_by) between 1 and 80),
  requested_at timestamptz not null default now(),
  status       text not null default 'queued' check (status in ('queued', 'done', 'failed')),
  finished_at  timestamptz,
  summary      text check (length(summary) <= 300)
);
comment on table meta.ops_request is 'A signed-in admin''s request for the runner on /admin/ops: snapshot now, pause or resume the harvester. One queued row per kind. ("Check drift now" uses meta.score_update_request, kind drift.)';
create unique index if not exists ops_request_one_queued on meta.ops_request (kind) where status = 'queued';
create index if not exists ops_request_recent on meta.ops_request (id desc);
alter table meta.ops_request enable row level security;
revoke all on meta.ops_request from public, anon, authenticated;

-- The only write the site can make: add one queued request. Rules in SQL: a known kind, a real actor name (not the runner's own names),
-- one queued request per kind, about a minute (two for a snapshot) after the last of that kind finished, and at most 20 requests an hour.
create or replace function api.request_ops(p_secret text, p_actor text, p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := btrim(coalesce(p_actor, ''));
  v_id bigint;
  v_gap interval := case when p_kind = 'snapshot' then interval '2 minutes' else interval '1 minute' end;
begin
  if not api.release_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(v_actor) < 1 or length(v_actor) > 80 or v_actor ~* '^(auto:|request:|system$)'
     or p_kind is null or p_kind not in ('snapshot', 'harvest_pause', 'harvest_resume') then
    raise exception 'bad request' using errcode = '22023';
  end if;
  if exists (select 1 from meta.ops_request where kind = p_kind and status = 'queued') then
    raise exception 'a request of this kind is already waiting' using errcode = '55006';
  end if;
  if exists (select 1 from meta.ops_request where kind = p_kind and coalesce(finished_at, requested_at) > now() - v_gap) then
    raise exception 'wait a minute or two after the last one' using errcode = '55000';
  end if;
  if (select count(*) from meta.ops_request where requested_at > now() - interval '1 hour') >= 20 then
    raise exception 'too many requests this hour' using errcode = '55000';
  end if;
  begin
    insert into meta.ops_request (kind, requested_by) values (p_kind, v_actor) returning id into v_id;
  exception when unique_violation then
    raise exception 'a request of this kind is already waiting' using errcode = '55006';
  end;
  return jsonb_build_object('id', v_id, 'status', 'queued', 'kind', p_kind);
end;
$$;
revoke all on function api.request_ops(text, text, text) from public;
grant execute on function api.request_ops(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- what the page reads

-- The newest snapshot, a day of small history points for the sparklines (oldest first), the last requests and the server's clock.
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
    'server_now', now()
  );
end;
$$;
revoke all on function api.ops_dashboard(text) from public;
grant execute on function api.ops_dashboard(text) to anon, authenticated;

notify pgrst, 'reload schema';

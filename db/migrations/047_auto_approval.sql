-- Automatic approval of the daily score release (kind daily_scores) and the switch that pauses every automatic approval.
-- Apply on DS1 and on production (after 045). Rerunnable.
--
-- The auto-approval itself is done by the release runner, which holds the Supabase token and re-checks the policy; the
-- site can only (1) hold a release back for John, (2) pause and (3) resume automatic approvals, through the three
-- security definer functions below. Each needs the approval secret (as in 045) and validates the state change in SQL.
-- No new table is readable or writable by anon or authenticated.

-- the new release kind
alter table meta.data_release drop constraint if exists data_release_kind_check;
alter table meta.data_release add constraint data_release_kind_check
  check (kind in ('publish', 'ds1_step', 'rollback', 'daily_scores'));

-- set when John (through the site) holds a release back: the runner never auto-approves a release with held_at set
alter table meta.data_release add column if not exists held_by text;
alter table meta.data_release add column if not exists held_at timestamptz;

-- one row: the global switch for every automatic approval, now and future. Production's copy is the one the runner obeys;
-- DS1 keeps a mirror written by the runner.
create table if not exists meta.auto_approval (
  id          boolean primary key default true check (id),
  paused      boolean not null default false,
  paused_at   timestamptz,
  paused_by   text,
  reason      text,
  resumed_at  timestamptz,
  resumed_by  text
);
comment on table meta.auto_approval is 'Global switch for automatic release approvals. paused true = every auto policy is held: releases are still prepared but stay pending. One row.';
insert into meta.auto_approval (id) values (true) on conflict (id) do nothing;
alter table meta.auto_approval enable row level security;
revoke all on meta.auto_approval from public, anon, authenticated;

-- 045's approve_release, with one more rule: the names the runner uses for automatic actions cannot be claimed by the site
create or replace function api.approve_release(p_secret text, p_id bigint, p_approve boolean, p_actor text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_number text;
  v_actor text := btrim(coalesce(p_actor, ''));
begin
  if not api.release_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(v_actor) < 1 or length(v_actor) > 80 or p_approve is null or v_actor ~* '^(auto:|system$)' then
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

-- Hold: a daily_scores release that is waiting for its automatic approval (pending, flagged eligible) or has been
-- auto-approved but has not started goes back to pending, for John. Nothing else changes state here.
create or replace function api.hold_release(p_secret text, p_id bigint, p_actor text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_number text;
  v_actor text := btrim(coalesce(p_actor, ''));
begin
  if not api.release_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(v_actor) < 1 or length(v_actor) > 80 or v_actor ~* '^(auto:|system$)' then
    raise exception 'bad request' using errcode = '22023';
  end if;
  update meta.data_release
     set status = 'pending', approved_by = null, approved_at = null, held_by = v_actor, held_at = now()
   where id = p_id
     and kind = 'daily_scores'
     and held_at is null
     and ((status = 'pending' and (preview #>> '{auto,eligible}') = 'true')
          or (status = 'approved' and approved_by like 'auto:%'))
  returning number into v_number;
  if v_number is null then
    raise exception 'release cannot be held now' using errcode = '22023';
  end if;
  return jsonb_build_object('number', v_number, 'status', 'pending');
end;
$$;
revoke all on function api.hold_release(text, bigint, text) from public;
grant execute on function api.hold_release(text, bigint, text) to anon, authenticated;

-- Pause every automatic approval. Pausing twice keeps the first reason.
create or replace function api.pause_auto_approvals(p_secret text, p_actor text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := btrim(coalesce(p_actor, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_changed int;
begin
  if not api.release_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(v_actor) < 1 or length(v_actor) > 80 or v_actor ~* '^(auto:|system$)'
     or length(v_reason) < 1 or length(v_reason) > 300 then
    raise exception 'bad request' using errcode = '22023';
  end if;
  update meta.auto_approval
     set paused = true, paused_at = now(), paused_by = v_actor, reason = v_reason
   where id and not paused;
  get diagnostics v_changed = row_count;
  return jsonb_build_object('paused', true, 'changed', v_changed > 0);
end;
$$;
revoke all on function api.pause_auto_approvals(text, text, text) from public;
grant execute on function api.pause_auto_approvals(text, text, text) to anon, authenticated;

-- Resume. This only clears the switch; the runner then approves the eligible queue, oldest first, re-checking each release.
create or replace function api.resume_auto_approvals(p_secret text, p_actor text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := btrim(coalesce(p_actor, ''));
  v_changed int;
begin
  if not api.release_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(v_actor) < 1 or length(v_actor) > 80 or v_actor ~* '^(auto:|system$)' then
    raise exception 'bad request' using errcode = '22023';
  end if;
  update meta.auto_approval set paused = false, resumed_at = now(), resumed_by = v_actor where id and paused;
  get diagnostics v_changed = row_count;
  return jsonb_build_object('paused', false, 'changed', v_changed > 0);
end;
$$;
revoke all on function api.resume_auto_approvals(text, text) from public;
grant execute on function api.resume_auto_approvals(text, text) to anon, authenticated;

-- 045's dashboard, plus the switch
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
    'database_bytes', pg_database_size(current_database())
  );
end;
$$;
revoke all on function api.release_dashboard(text) from public;
grant execute on function api.release_dashboard(text) to anon, authenticated;

-- the footer counts a finished daily_scores release as a data change
create or replace view api.data_version as
select number, finished_at
from meta.data_release
where status = 'done' and kind in ('publish', 'rollback', 'daily_scores')
order by finished_at desc nulls last, id desc
limit 1;
grant select on api.data_version to anon, authenticated;

notify pgrst, 'reload schema';

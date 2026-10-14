-- "API health" on /admin/data: one row per time production's REST API stayed down, written by the release runner's watchdog
-- (scripts/release/watchdog.py). Apply on DS1 and on production (after 045). Add-only and rerunnable. Nothing here is readable or
-- writable by anon or authenticated except through api.api_health, which needs the release approval secret.
--
-- The runner writes the incident to DS1 first and copies it to production through the Management API (which still answers when
-- PostgREST does not). An incident is recorded once the API has failed 5 probes in a row; reload_at is when the runner asked
-- PostgREST to reload its schema cache, restart_at when it restarted the project, recovered_at when the first probe worked again.

create table if not exists meta.api_health_event (
  failing_since timestamptz primary key,
  detected_at   timestamptz not null,
  probes_failed integer not null default 0,
  reload_at     timestamptz,
  restart_at    timestamptz,
  recovered_at  timestamptz,
  last_error    text check (length(last_error) <= 300),
  updated_at    timestamptz not null default now()
);
comment on table meta.api_health_event is 'One row per incident of the production REST API being down, written by the runner watchdog. Not a release table (the drift comparison skips it).';
alter table meta.api_health_event enable row level security;
revoke all on meta.api_health_event from public, anon, authenticated;

-- The ten latest incidents and the server's clock, behind the same secret as the other /admin/data functions.
create or replace function api.api_health(p_secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not api.release_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'events', (select coalesce(jsonb_agg(to_jsonb(e) - 'updated_at' order by e.failing_since desc), '[]'::jsonb)
               from (select * from meta.api_health_event order by failing_since desc limit 10) e),
    'server_now', now()
  );
end;
$$;
revoke all on function api.api_health(text) from public;
grant execute on function api.api_health(text) to anon, authenticated;

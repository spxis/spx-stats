-- api.release_summary(secret) gains a fourth count, 'failed', for the admin bar and the "Data releases (N)" count in the account menu:
-- releases that failed in the last 48 hours and that no later release has made good (a release that finished 'done' afterwards and touched
-- any of the same tables). Without it a failed release leaves nothing on the page an admin opens first, and one that was fixed by a rerun
-- would stay counted for as long as it is in the list.
--
-- Add-only for a reader: the three existing keys keep their meaning, the site reads 'failed' as 0 while this is not on production.
-- Replaces only the body of the function from migration 053 (same name, arguments, result and grants). No table, view or data changes.
-- Needs 045 (meta.data_release) and 053. Rerunnable. Production: apply to production, and to DS1 (it has the same function).

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
    'paused', v_paused,
    'failed', (select count(*) from meta.data_release f
               where f.status = 'failed'
                 and coalesce(f.finished_at, f.created_at) > now() - interval '48 hours'
                 and not exists (select 1 from meta.data_release d
                                 where d.status = 'done' and d.finished_at > coalesce(f.finished_at, f.created_at) and d.tables && f.tables))
  );
end;
$$;
revoke all on function api.release_summary(text) from public;
grant execute on function api.release_summary(text) to anon, authenticated;

notify pgrst, 'reload schema';

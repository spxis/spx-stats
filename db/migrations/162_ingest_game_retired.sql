-- Games the daily job made from a club article's row and that no article lists any more are retired (scripts/daily/retire.sql).
--
-- Why (SPX-761, 2026-10-29): the daily job makes a scheduled game from every row an article lists, including the games a playoff series
-- only plays "if necessary" (the NLCS games 5 to 7 after a sweep, the ALCS game 7) and, until the parser was fixed, World Series rows
-- against a club that was not decided yet. When the article drops such a row nothing took the game back: it stayed "scheduled" in core
-- for good, and the club-count check (checks.sql) then failed the whole league on every run (MLB, 2026-10-20 to 29).
--
-- The job now deletes those games itself, but only its own scheduled games with no result that this run's sources do not list. The
-- observation log is append-only and is replayed after a rebuild of core (db/build/153, ingest.replay): a replay of the retired game's
-- scheduled observation would make the placeholder again. ingest.game_retired remembers the retired game_refs so that replay skips them.
-- A game_ref the sources list again is taken off the list by the job before it reports (scripts/daily/revive.sql), so a game that is
-- really played after all comes back through the usual path.
--
-- ingest.replay is the original of migration 044 with one more condition; nothing else about it changes. Rerunnable.
-- Apply with scripts/mac/ds1-apply.sh (run.py --apply applies it itself, after 044, 046, 055 and 114).
begin;

create table if not exists ingest.game_retired (
  game_ref    text primary key,                       -- the retired game's reporter key (a chain of observations)
  game_id     bigint,                                 -- the core.game that was deleted (informational: ids are not stable across a rebuild)
  league      text not null,
  season      smallint not null,
  game_date   date not null,
  home_key    text,
  away_key    text,
  reason      text not null,
  retired_at  timestamptz not null default now()
);
comment on table ingest.game_retired is 'Games of the daily source that no source listed any more and the job deleted (scripts/daily/retire.sql). ingest.replay skips these game_refs.';
alter table ingest.game_retired enable row level security;      -- no policies: nothing but the owner reads it
revoke all on ingest.game_retired from public;

create or replace function ingest.replay(p_create boolean default true, p_only_unmatched boolean default false) returns jsonb
language plpgsql set search_path = pg_catalog, pg_temp
as $$
declare id bigint; res jsonb; outcomes jsonb := '{}'::jsonb; n integer := 0; made integer := 0; nchanged integer := 0; changed jsonb := '[]'::jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('ingest.report_results', 0));
  for id in select o.observation_id from ingest.game_observation o
             where (not p_only_unmatched
                or ((o.outcome = 'unmatched' or o.outcome is null) and o.observation_id = (select max(o2.observation_id) from ingest.game_observation o2 where o2.game_ref = o.game_ref)))
               and not exists (select 1 from ingest.game_retired r where r.game_ref = o.game_ref)
             order by o.observation_id loop
    res := ingest.apply_observation(id, p_create);
    n := n + 1;
    if (res ->> 'created')::boolean then made := made + 1; end if;
    outcomes := jsonb_set(outcomes, array[res ->> 'outcome'], to_jsonb(coalesce((outcomes ->> (res ->> 'outcome'))::integer, 0) + 1));
    if res -> 'changed' is not null and res -> 'changed' <> 'null'::jsonb then
      nchanged := nchanged + 1;
      if p_only_unmatched then changed := changed || (res -> 'changed'); end if;      -- the whole list only for the small daily call
    end if;
  end loop;
  return jsonb_build_object('replayed', n, 'games_made', made, 'games_changed', nchanged, 'outcomes', outcomes, 'changed', changed);
end $$;

commit;

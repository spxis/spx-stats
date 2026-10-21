-- DS1 only (like 135); not in a release, not on production. Do not apply it there.
-- Adds core.franchise_identity to the ids db/checks/093_row_id_drift.sql watches (view from migration 136, same columns) and the function the build
-- steps use to give an identity the id the map remembers for it. An identity's natural key is its franchise and first day (a franchise's identities never overlap).
-- Steps 140, 145, 146, 150, 151, 154, 216, 218 and 219 write the id of each identity they delete to ingest.row_id_map (a key already there keeps its first id)
-- and call ingest.identity_id_for for each one they add, so a rerun keeps every identity id (bash db/tests/identity-ids.sh).
-- Apply after 136, then rerun db/build/221_row_id_map.sql to remember the ids the identities hold now.
begin;
create or replace view ingest.row_id_current as
select 'core.game'::text as tbl, source_id::text || '/' || source_key as natural_key, game_id::bigint as id from core.game
union all select 'core.series', source_id::text || '/' || source_key, series_id from core.series
union all select 'core.venue', source_id::text || '/' || source_key, venue_id from core.venue where source_key is not null
union all select 'core.franchise', source_id::text || '/' || source_key, franchise_id from core.franchise where source_key is not null
union all select 'core.award', code, award_id from core.award
union all select 'core.season', league_code || '/' || start_year, season_id from core.season
union all select 'core.team_season', franchise_id || '/' || season_id, team_season_id from core.team_season
union all select 'core.soccer_match', source_key, match_id from core.soccer_match
union all select 'core.cup_series', cup_year || '/' || seq, cup_series_id from core.cup_series
union all select 'core.roster_stint',
       coalesce(source_id::text, '') || '/' || person_id || '/' || team_season_id || '/' || role || '/' || coalesce(captaincy, '') || '/'
         || row_number() over (partition by source_id, person_id, team_season_id, role, captaincy order by lower(valid_during) nulls first, roster_stint_id),
       roster_stint_id
from core.roster_stint
union all select 'core.franchise_owner',
       coalesce(source_id::text, '') || '/' || franchise_id || '/' || owner_name || '/' || valid_during::text || '/' || coalesce(share_note, ''),
       franchise_owner_id
from core.franchise_owner
union all select 'core.franchise_identity', franchise_id || '/' || coalesce(lower(valid_during)::text, ''), franchise_identity_id
from core.franchise_identity;

-- The id ingest.row_id_map remembers for the identity of this franchise that starts on this day, if no identity holds it now; else a new one.
create or replace function ingest.identity_id_for(p_franchise integer, p_start date) returns integer language sql as $$
  select coalesce(
    (select m.row_id::integer from ingest.row_id_map m
      where m.tbl = 'core.franchise_identity' and m.natural_key = p_franchise || '/' || coalesce(p_start::text, '')
        and not exists (select 1 from core.franchise_identity y where y.franchise_identity_id = m.row_id)),
    nextval(pg_get_serial_sequence('core.franchise_identity', 'franchise_identity_id'))::integer) $$;
revoke all on function ingest.identity_id_for(integer, date) from public;
commit;

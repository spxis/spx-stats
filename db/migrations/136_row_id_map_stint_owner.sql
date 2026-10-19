-- DS1 only (like 135); not in a release, not on production. Do not apply it there.
-- Adds core.roster_stint and core.franchise_owner to the ids db/checks/093_row_id_drift.sql watches (view from migration 135, same columns).
-- A stint's natural key is source, person, team season, role, captaincy and its nth row by start date; an owner's is franchise, name, period and share note.
-- Apply after 135, then rerun db/build/221_row_id_map.sql to remember the ids these tables hold now.
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
from core.franchise_owner;
commit;

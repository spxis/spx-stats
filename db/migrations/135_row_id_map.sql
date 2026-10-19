-- DS1 only (like the rest of schema ingest); not in a release, not on production. Do not apply it there.
-- Remembers the id a game, series, venue, franchise, award, season, team season, soccer match or Stanley Cup series had the first time the build
-- saw it, under its natural key. A rerun of a build step that deletes and re-adds rows gives them new ids, which breaks the site's game addresses and
-- fails a release (production keeps the old ids and its unique keys then clash). db/checks/093_row_id_drift.sql returns every row whose id is no longer
-- the remembered one; db/build/221_row_id_map.sql adds the keys that are new. Rerunnable.
-- To add a table to the map, replace the view in a later migration (create or replace view, same columns) and rerun 221.
-- To accept an id that changed on purpose, delete its map row (delete from ingest.row_id_map where tbl = '...' and natural_key = '...') and rerun 221.
begin;
create schema if not exists ingest;
create table if not exists ingest.row_id_map (
  tbl          text not null,
  natural_key  text not null,
  row_id       bigint not null,
  first_seen   timestamptz not null default now(),
  primary key (tbl, natural_key)
);
comment on table ingest.row_id_map is 'The id each game, series, venue, ... had when the build first saw its natural key (db/build/221). DS1 only.';

create or replace view ingest.row_id_current as
select 'core.game'::text as tbl, source_id::text || '/' || source_key as natural_key, game_id::bigint as id from core.game
union all select 'core.series', source_id::text || '/' || source_key, series_id from core.series
union all select 'core.venue', source_id::text || '/' || source_key, venue_id from core.venue where source_key is not null
union all select 'core.franchise', source_id::text || '/' || source_key, franchise_id from core.franchise where source_key is not null
union all select 'core.award', code, award_id from core.award
union all select 'core.season', league_code || '/' || start_year, season_id from core.season
union all select 'core.team_season', franchise_id || '/' || season_id, team_season_id from core.team_season
union all select 'core.soccer_match', source_key, match_id from core.soccer_match
union all select 'core.cup_series', cup_year || '/' || seq, cup_series_id from core.cup_series;
comment on view ingest.row_id_current is 'The ids the tables of ingest.row_id_map hold now, by the same natural keys.';

revoke all on ingest.row_id_map from public;
revoke all on ingest.row_id_current from public;
do $$
declare r text;
begin
  for r in select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role', 'ingest_writer') loop
    execute format('revoke all on ingest.row_id_map from %I', r);
    execute format('revoke all on ingest.row_id_current from %I', r);
  end loop;
end $$;
commit;

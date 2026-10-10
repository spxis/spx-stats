-- spxn's 2012-13 NBA and NHL games (legacy_mongo.game) -> core. spxn names a
-- team by its city; the city maps to the SPX team, so the franchise is the
-- same one the SPX database uses. Safe to re-run; runs after 100 and 110.
begin;

insert into meta.source (code, name, kind, licence, attribution, covers_from, covers_to, notes)
values ('spxn_database', 'spxn MongoDB (spxn.com scraper store)', 'database_backup', 'Owned by SPX',
        'SPX (spxn.com), 2012-2013', '2012-10-30', '2013-02-10',
        'Games and box scores parsed by spxn''s scraper, from the dump of 2013-07-29.')
on conflict (code) do nothing;

delete from core.game where source_id = (select source_id from meta.source where code = 'spxn_database');

create temp table spxn_team (league_code text, city text, spx_team_id integer, primary key (league_code, city));
insert into spxn_team
select fl.league_code, t.team_city, t.team_id
from legacy_spx.tbl_teams t
join core.external_id e on e.entity_kind = 'franchise' and e.external_key = 'team:' || t.team_id
join core.franchise_league fl on fl.franchise_id = e.entity_id
where fl.league_code in ('nhl', 'nba') and upper(fl.valid_during) > '2011-06-01'
on conflict do nothing;
insert into spxn_team values ('nba', 'LA Clippers', 40), ('nba', 'LA Lakers', 41), ('nba', 'Brooklyn', 45),
                             ('nba', 'Oklahoma City', 2412), ('nhl', 'Winnipeg', 2419)
on conflict (league_code, city) do update set spx_team_id = excluded.spx_team_id;

create temp table tmap as
select st.league_code, st.city, e.entity_id as franchise_id
from spxn_team st join core.external_id e on e.entity_kind = 'franchise' and e.external_key = 'team:' || st.spx_team_id;

insert into core.season (league_code, start_year, end_year, label, games_per_team, notes)
select distinct sport, left(season, 4)::smallint, left(season, 4)::smallint + 1,
       left(season, 4) || '-' || right(season, 2), case sport when 'nhl' then 48 else 82 end,
       'Season row created from the spxn games.'
from legacy_mongo.game
on conflict (league_code, start_year) do nothing;

insert into core.team_season (franchise_id, season_id, source_id)
select distinct m.franchise_id, s.season_id, (select source_id from meta.source where code = 'spxn_database')
from legacy_mongo.game g
join core.season s on s.league_code = g.sport and s.start_year = left(g.season, 4)::smallint
join tmap m on m.league_code = g.sport and m.city in (g.home_team, g.away_team)
on conflict (franchise_id, season_id) do nothing;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'spxn_database'), 'game', 'spxn:' || g.sport || ':' || g.source_gameid,
       format('Team not matched: %s at %s', g.away_team, g.home_team), 'Game left out'
from legacy_mongo.game g
where not exists (select 1 from tmap m where m.league_code = g.sport and m.city = g.home_team)
   or not exists (select 1 from tmap m where m.league_code = g.sport and m.city = g.away_team);

insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, status, home_score, away_score,
                       went_to_overtime, decided_by_shootout, source_id, source_key)
select s.season_id, case g.season_type when 'regular' then 'regular' when 'playoff' then 'playoffs' else 'regular' end::core.season_phase,
       g.game_date, hts.team_season_id, ats.team_season_id,
       case when g.is_cancelled then 'cancelled' when g.status = 'final' and g.home_score is not null then 'final' else 'scheduled' end::core.game_status,
       g.home_score, g.away_score, g.is_overtime or g.is_shootout, g.is_shootout,
       (select source_id from meta.source where code = 'spxn_database'), 'spxn:' || g.sport || ':' || g.source_gameid
from legacy_mongo.game g
join core.season s on s.league_code = g.sport and s.start_year = left(g.season, 4)::smallint
join tmap hm on hm.league_code = g.sport and hm.city = g.home_team
join tmap am on am.league_code = g.sport and am.city = g.away_team
join core.team_season hts on hts.franchise_id = hm.franchise_id and hts.season_id = s.season_id
join core.team_season ats on ats.franchise_id = am.franchise_id and ats.season_id = s.season_id
where g.season_type in ('regular', 'playoff') and g.game_date is not null;

commit;

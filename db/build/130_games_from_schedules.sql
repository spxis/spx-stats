-- Games SPX listed in schedule files for seasons the database does not hold
-- (NHL 1999-2000 and 2000-01). They carry no result: each is logged as a
-- missing result until a source with scores is loaded. Runs after 100-120.
begin;

insert into meta.source (code, name, kind, licence, attribution, notes)
values ('spx_files', 'SPX published files (CSV/XML)', 'file_archive', 'Owned by SPX', 'SPX (SportsInteractive.com)',
        'Files SPX published or kept: schedules, scores, standings, stat tables.')
on conflict (code) do nothing;

delete from meta.data_issue where source_id = (select source_id from meta.source where code = 'spx_files');
delete from core.game where source_id = (select source_id from meta.source where code = 'spx_files');

create temp table abbr (league_code text, abbr text, spx_team_id integer);
insert into abbr values
  ('nhl','ana',1),('nhl','atl',2),('nhl','bos',3),('nhl','buf',4),('nhl','cgy',5),('nhl','car',6),('nhl','chi',7),
  ('nhl','col',8),('nhl','dal',9),('nhl','det',10),('nhl','edm',11),('nhl','fla',12),('nhl','los',13),('nhl','mon',14),
  ('nhl','nas',15),('nhl','njd',16),('nhl','nyi',17),('nhl','nyr',18),('nhl','ott',19),('nhl','phi',20),('nhl','pho',21),
  ('nhl','pit',22),('nhl','san',23),('nhl','stl',24),('nhl','tam',25),('nhl','tor',26),('nhl','van',27),('nhl','was',28),
  ('nhl','cob',88),('nhl','min',89);

create temp table sg as
select sg.*, left(sg.season, 4)::smallint as start_year,
       coalesce(ah.spx_team_id, case when sg.home_team ~ '^\d+$' then sg.home_team::int end) as home_id,
       coalesce(aa.spx_team_id, case when sg.away_team ~ '^\d+$' then sg.away_team::int end) as away_id
from legacy_files.schedule_game sg
left join abbr ah on ah.league_code = sg.league and ah.abbr = sg.home_team
left join abbr aa on aa.league_code = sg.league and aa.abbr = sg.away_team
-- only seasons the SPX database holds no games for
where not exists (select 1 from core.game g join core.season s using (season_id)
                  where s.league_code = sg.league and s.start_year = left(sg.season, 4)::smallint);

create temp table fmap as
select substring(external_key from 'team:(\d+)')::int as team_id, entity_id as franchise_id
from core.external_id where entity_kind = 'franchise' and external_key like 'team:%';

insert into core.season (league_code, start_year, end_year, label, games_per_team, notes)
select distinct league, start_year, start_year + 1, season, 82, 'Season row created from an SPX schedule file.'
from sg on conflict (league_code, start_year) do nothing;

insert into core.team_season (franchise_id, season_id, source_id)
select distinct m.franchise_id, s.season_id, (select source_id from meta.source where code = 'spx_files')
from sg join core.season s on s.league_code = sg.league and s.start_year = sg.start_year
join fmap m on m.team_id in (sg.home_id, sg.away_id)
on conflict (franchise_id, season_id) do nothing;

insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, status, broadcaster, source_id, source_key)
select s.season_id, 'regular', sg.game_date::date, hts.team_season_id, ats.team_season_id, 'scheduled', sg.network,
       (select source_id from meta.source where code = 'spx_files'),
       'spx-schedule:' || sg.league || ':' || sg.game_date || ':' || sg.away_team || '@' || sg.home_team
from sg join core.season s on s.league_code = sg.league and s.start_year = sg.start_year
join fmap hm on hm.team_id = sg.home_id join core.team_season hts on hts.franchise_id = hm.franchise_id and hts.season_id = s.season_id
join fmap am on am.team_id = sg.away_id join core.team_season ats on ats.franchise_id = am.franchise_id and ats.season_id = s.season_id;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select source_id, 'game', source_key, 'Result not in any SPX source loaded yet', 'Listed as scheduled'
from core.game where source_id = (select source_id from meta.source where code = 'spx_files') and status = 'scheduled';

commit;

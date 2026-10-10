-- NFL from nflverse (CC BY 4.0): every game from 1999, and team names by
-- season from 2002 (1999-2001 take the 2002 name). Where the SPX database
-- holds a season (2002-2011), SPX stays the base: nflverse fills a result SPX
-- never entered, confirms one that agrees and flags one that does not.
-- Runs after 100-140, before 155.
begin;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, notes)
values ('nflverse', 'nflverse NFL schedules and results', 'dataset', 'CC BY 4.0', 'NFL data from nflverse (github.com/nflverse), CC BY 4.0.',
        'https://github.com/nflverse/nfldata', '1999-09-12', 'games.csv and teams.csv from nflverse/nfldata. Team names before 2002 are the 2002 names.')
on conflict (code) do nothing;
create temp table src as select source_id from meta.source where code = 'nflverse';

delete from meta.verification where source_id = (select source_id from src);
delete from meta.data_issue where source_id = (select source_id from src);
delete from core.game where source_id = (select source_id from src);
delete from core.external_id where source_id = (select source_id from src);

create temp table nmap (code text primary key, spx_team_id integer not null);
insert into nmap values ('BUF',130),('MIA',131),('NE',132),('NYJ',133),('CIN',134),('CLE',135),('PIT',136),('BAL',137),('TEN',138),
  ('IND',139),('JAX',140),('HOU',141),('DEN',142),('KC',143),('OAK',144),('LV',144),('SD',145),('LAC',145),('DAL',146),('NYG',147),
  ('PHI',148),('WAS',149),('CHI',150),('DET',151),('GB',152),('MIN',153),('ATL',154),('NO',155),('TB',156),('CAR',157),('STL',158),
  ('LA',158),('ARI',159),('SF',160),('SEA',161);
create temp table fr as
select n.code, e.entity_id as franchise_id from nmap n join core.external_id e on e.entity_kind = 'franchise' and e.external_key = 'team:' || n.spx_team_id;

insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'franchise', franchise_id, (select source_id from src), 'team:' || code from fr;

-- Names by season replace SPX's provisional ones.
create temp table nm as
select fr.franchise_id, t.season, t.full_name, t.location, t.nickname, t.team from legacy_nflverse.team t join fr on fr.code = t.team
union all
select fr.franchise_id, y, t.full_name, t.location, t.nickname, t.team
from legacy_nflverse.team t join fr on fr.code = t.team cross join generate_series(1999, 2001) y
where t.season = 2002;
update core.team_season set franchise_identity_id = null where franchise_id in (select franchise_id from fr);
delete from core.franchise_identity where franchise_id in (select franchise_id from fr);
delete from core.franchise_league where franchise_id in (select franchise_id from fr);
insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, abbreviation, country_code, source_id)
select franchise_id, daterange(make_date(first_season, 3, 1), case when next_season is null then null else make_date(next_season, 3, 1) end),
       coalesce(location, full_name), coalesce(nickname, full_name), full_name, team, 'US', (select source_id from src)
from (select franchise_id, full_name, location, nickname, team, min(season) first_season,
             lead(min(season)) over (partition by franchise_id order by min(season)) next_season,
             max(season) last_season
      from (select nm.*, season - row_number() over (partition by franchise_id, full_name order by season) as island from nm) x
      group by franchise_id, full_name, location, nickname, team, island) y;
insert into core.franchise_league (franchise_id, league_code, valid_during, source_id)
select franchise_id, 'nfl', daterange(min(lower(valid_during)), null), (select source_id from src)
from core.franchise_identity where franchise_id in (select franchise_id from fr) group by franchise_id;

create temp table ng as
select g.*, h.franchise_id home_f, a.franchise_id away_f,
       case g.game_type when 'REG' then 'regular' else 'playoffs' end::core.season_phase as phase
from legacy_nflverse.game g join fr h on h.code = g.home_team join fr a on a.code = g.away_team;

insert into core.season (league_code, start_year, end_year, label, games_per_team, source_id)
select 'nfl', season, season + 1, season::text, case when season >= 2021 then 17 else 16 end, (select source_id from src)
from ng group by season on conflict (league_code, start_year) do nothing;

insert into core.team_season (franchise_id, season_id, source_id)
select distinct f, s.season_id, (select source_id from src)
from (select season, home_f f from ng union select season, away_f from ng) x join core.season s on s.league_code = 'nfl' and s.start_year = x.season
on conflict (franchise_id, season_id) do nothing;
update core.team_season ts set franchise_identity_id = (
  select i.franchise_identity_id from core.franchise_identity i join core.season s on s.season_id = ts.season_id
  where i.franchise_id = ts.franchise_id and i.valid_during @> make_date(s.start_year, 10, 1) limit 1)
where ts.franchise_id in (select franchise_id from fr);

-- SPX's games matched to nflverse's: same season, same date, same home and away franchise.
create temp table spx_g as
select g.game_id, g.game_date, g.status, g.home_score, g.away_score, h.franchise_id home_f, a.franchise_id away_f, s.start_year
from core.game g join core.season s using (season_id)
join core.team_season h on h.team_season_id = g.home_team_season_id join core.team_season a on a.team_season_id = g.away_team_season_id
where s.league_code = 'nfl' and g.source_id <> (select source_id from src) and g.status <> 'cancelled';
-- One SPX game per nflverse game (SPX's own duplicates are removed later, by 155): the one with a result, then the nearest date.
create temp table matched as
select distinct on (n.game_id) n.game_id as key, n.home_score r_h, n.away_score r_a, s.game_id, s.status, s.home_score, s.away_score
from ng n join spx_g s on s.start_year = n.season and abs(s.game_date - n.gameday) <= 1 and s.home_f = n.home_f and s.away_f = n.away_f
order by n.game_id, (s.status = 'final') desc, abs(s.game_date - n.gameday), s.game_id;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', (select source_key from core.game where game_id = m.game_id), 'No result in SPX',
       format('Filled from nflverse: %s-%s', m.r_h, m.r_a)
from matched m where m.status <> 'final' and m.r_h is not null;
update core.game g set status = 'final', home_score = m.r_h, away_score = m.r_a, updated_at = now()
from matched m where g.game_id = m.game_id and m.status <> 'final' and m.r_h is not null;
insert into meta.verification (entity_kind, entity_id, field, status, source_id, their_value)
select 'game', m.game_id, 'score', case when m.home_score = m.r_h and m.away_score = m.r_a then 'confirmed' else 'disputed' end::meta.verification_status,
       (select source_id from src), m.r_h || '-' || m.r_a
from matched m where m.status = 'final' and m.r_h is not null;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', (select source_key from core.game where game_id = m.game_id),
       format('SPX has %s-%s, nflverse %s-%s', m.home_score, m.away_score, m.r_h, m.r_a), 'Kept SPX''s; needs a third source'
from matched m where m.status = 'final' and m.r_h is not null and (m.home_score <> m.r_h or m.away_score <> m.r_a);

insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, is_neutral_site, status,
                       home_score, away_score, went_to_overtime, source_id, source_key)
select s.season_id, n.phase, n.gameday, hts.team_season_id, ats.team_season_id, coalesce(n.location = 'Neutral', false),
       case when n.home_score is not null then 'final' else 'scheduled' end::core.game_status, n.home_score, n.away_score, n.overtime,
       (select source_id from src), 'nflverse:' || n.game_id
from ng n join core.season s on s.league_code = 'nfl' and s.start_year = n.season
join core.team_season hts on hts.franchise_id = n.home_f and hts.season_id = s.season_id
join core.team_season ats on ats.franchise_id = n.away_f and ats.season_id = s.season_id
where n.game_id not in (select key from matched);
insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'game', game_id, source_id, substring(source_key from 10) from core.game where source_id = (select source_id from src)
union all select 'game', game_id, (select source_id from src), key from matched;

select 'matched', count(*) from matched
union all select 'filled', count(*) from matched where status <> 'final' and r_h is not null
union all select 'confirmed', count(*) from matched where status = 'final' and home_score = r_h and away_score = r_a
union all select 'disputed', count(*) from matched where status = 'final' and (home_score <> r_h or away_score <> r_a)
union all select 'added', count(*) from core.game where source_id = (select source_id from src);
commit;

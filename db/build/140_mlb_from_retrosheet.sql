-- MLB from Retrosheet: every franchise's names over time, every season from
-- 1871, and every game. Where the SPX database holds a season (2002-2011),
-- SPX stays the base: Retrosheet fills a result SPX never entered, confirms a
-- result that agrees (meta.verification) and flags one that does not. Every
-- other season comes from Retrosheet alone. Runs after 100-130, before 155.
-- Retrosheet's notice: "The information used here was obtained free of charge
-- from and is copyrighted by Retrosheet. Interested parties may contact
-- Retrosheet at www.retrosheet.org."
begin;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, notes)
values ('retrosheet', 'Retrosheet game logs', 'dataset', 'Free for any use, with Retrosheet''s notice shown prominently',
        'The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at "www.retrosheet.org".',
        'https://www.retrosheet.org/gamelogs/', '1871-05-04', 'Major-league game logs, regular season and postseason, and the franchise name history.')
on conflict (code) do nothing;
create temp table src as select source_id from meta.source where code = 'retrosheet';

delete from meta.verification where source_id = (select source_id from src);
delete from meta.data_issue where source_id = (select source_id from src);
delete from core.game where source_id = (select source_id from src);
delete from core.external_id where source_id = (select source_id from src);

-- Retrosheet's 30 franchises -> the SPX team that is the same franchise.
create temp table rmap (retro text primary key, spx_team_id integer not null);
insert into rmap values ('ANA',58),('ARI',59),('ATL',60),('BAL',61),('BOS',62),('CHN',63),('CHA',64),('CIN',65),('CLE',66),
  ('COL',67),('DET',68),('MIA',69),('HOU',70),('KCA',71),('LAN',72),('MIL',73),('MIN',74),('WAS',75),('NYN',76),('NYA',77),
  ('OAK',78),('PHI',79),('PIT',80),('SDN',81),('SFN',82),('SEA',83),('SLN',84),('TBA',85),('TEX',86),('TOR',87);

create temp table fr as  -- retrosheet franchise -> core franchise
select r.retro, e.entity_id as franchise_id
from rmap r join core.external_id e on e.entity_kind = 'franchise' and e.external_key = 'team:' || r.spx_team_id;

-- Teams no current franchise descends from: a franchise each.
create temp table defunct as
select distinct t.team_id from (select home team_id from legacy_retrosheet.game_log union select visitor from legacy_retrosheet.game_log) t
where t.team_id not in (select team_id from legacy_retrosheet.current_name);
delete from core.team_season where franchise_id in (select franchise_id from core.franchise where notes like 'retrosheet team %');
delete from core.franchise where notes like 'retrosheet team %';
insert into core.franchise (sport_code, source_id, notes)
select 'baseball', (select source_id from src), 'retrosheet team ' || team_id from defunct;
insert into fr select substring(f.notes from 'retrosheet team (.*)'), f.franchise_id from core.franchise f where f.notes like 'retrosheet team %';

-- Which franchise each Retrosheet team id was, by date.
create temp table team_era as
select c.team_id, c.first_game, coalesce(c.last_game, '9999-12-31'::date) as last_game, fr.franchise_id
from legacy_retrosheet.current_name c join fr on fr.retro = c.franchise_id
union all
select d.team_id, '1871-01-01', '9999-12-31', fr.franchise_id from defunct d join fr on fr.retro = d.team_id;

insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'franchise', franchise_id, (select source_id from src), 'franchise:' || retro from fr;

-- Names over time replace SPX's provisional names for every MLB franchise.
update core.team_season ts set franchise_identity_id = null where franchise_id in (select franchise_id from fr);
delete from core.franchise_identity where franchise_id in (select franchise_id from fr);
delete from core.franchise_league where franchise_id in (select franchise_id from fr);

insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, abbreviation, country_code, source_id)
select franchise_id, daterange(first_game, next_first), city, nickname, city || ' ' || nickname, team_id,
       case when city in ('Montreal', 'Toronto') then 'CA' else 'US' end, (select source_id from src)
from (
  select fr.franchise_id, c.team_id, c.city, c.nickname, min(c.first_game) as first_game,
         lead(min(c.first_game)) over (partition by fr.franchise_id order by min(c.first_game)) as next_first
  from legacy_retrosheet.current_name c join fr on fr.retro = c.franchise_id
  group by fr.franchise_id, c.team_id, c.city, c.nickname,
           -- consecutive rows with the same name are one identity
           (select count(*) from legacy_retrosheet.current_name c2 where c2.franchise_id = c.franchise_id and c2.first_game <= c.first_game
              and (c2.city, c2.nickname) is distinct from (c.city, c.nickname))
) x;
insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, abbreviation, country_code, source_id)
select distinct on (fr.franchise_id) fr.franchise_id, daterange(make_date(t.first_year, 1, 1), make_date(t.last_year + 1, 1, 1)),
       t.city, t.nickname, t.city || ' ' || t.nickname, t.team_id, 'US', (select source_id from src)
from defunct d join fr on fr.retro = d.team_id join legacy_retrosheet.team t on t.team_id = d.team_id
order by fr.franchise_id, t.first_year;

insert into core.franchise_league (franchise_id, league_code, valid_during, source_id)
select franchise_id, 'mlb', daterange(min(lower(valid_during)), case when bool_or(upper_inf(valid_during)) then null else max(upper(valid_during)) end),
       (select source_id from src)
from core.franchise_identity where franchise_id in (select franchise_id from fr) group by franchise_id;

-- Every Retrosheet game, with its franchises: a team id belongs to one franchise,
-- and the dates only settle a tie (game logs carry BR3 for 1888-89, the names file BR4).
create temp table rg as
select g.*, extract(year from g.game_date)::smallint as yr,
       (select te.franchise_id from team_era te where te.team_id = g.home order by (g.game_date between te.first_game and te.last_game) desc, abs(g.game_date - te.first_game) limit 1) as home_f,
       (select te.franchise_id from team_era te where te.team_id = g.visitor order by (g.game_date between te.first_game and te.last_game) desc, abs(g.game_date - te.first_game) limit 1) as away_f,
       case g.game_type when 'regular' then 'regular' when 'tiebreaker' then 'regular' when 'allstar' then 'all_star' else 'playoffs' end::core.season_phase as phase,
       'retro:' || to_char(g.game_date, 'YYYYMMDD') || ':' || g.home || ':' || g.visitor || ':' || g.game_number || ':' || g.game_type as key
from legacy_retrosheet.game_log g;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', key, 'Team id not matched to a franchise: ' || home || ' / ' || visitor, 'Game left out'
from rg where home_f is null or away_f is null;

insert into core.season (league_code, start_year, end_year, label, games_per_team, notes)
select 'mlb', yr, yr, yr::text, null, 'Season row created from Retrosheet.' from rg group by yr
on conflict (league_code, start_year) do nothing;

insert into core.team_season (franchise_id, season_id, source_id)
select distinct f, s.season_id, (select source_id from src)
from (select yr, home_f f from rg where phase <> 'all_star' union select yr, away_f from rg where phase <> 'all_star') x
join core.season s on s.league_code = 'mlb' and s.start_year = x.yr where f is not null
on conflict (franchise_id, season_id) do nothing;

update core.team_season ts set franchise_identity_id = (
  select i.franchise_identity_id from core.franchise_identity i join core.season s on s.season_id = ts.season_id
  where i.franchise_id = ts.franchise_id and i.valid_during && daterange(make_date(s.start_year, 1, 1), make_date(s.start_year + 1, 1, 1))
  order by upper(i.valid_during) desc nulls first limit 1)
where ts.franchise_id in (select franchise_id from fr);

-- The SPX games of the seasons SPX holds, matched to Retrosheet's: same date,
-- same home and away franchise, doubleheaders in order.
create temp table spx_g as
select g.game_id, g.game_date, g.status, g.home_score, g.away_score, g.phase, h.franchise_id home_f, a.franchise_id away_f,
       row_number() over (partition by g.game_date, h.franchise_id, a.franchise_id order by g.starts_at nulls last, g.game_id) as n
from core.game g join core.season s using (season_id)
join core.team_season h on h.team_season_id = g.home_team_season_id join core.team_season a on a.team_season_id = g.away_team_season_id
where s.league_code = 'mlb' and g.source_id <> (select source_id from src) and g.status <> 'cancelled';
create temp table rg_n as
select rg.*, row_number() over (partition by game_date, home_f, away_f order by game_number) as n from rg where home_f is not null and away_f is not null;
create temp table matched as
select r.key, r.home_score r_h, r.visitor_score r_a, s.game_id, s.status, s.home_score, s.away_score
from rg_n r join spx_g s on s.game_date = r.game_date and s.home_f = r.home_f and s.away_f = r.away_f and s.n = r.n;

-- A result SPX never entered: filled from Retrosheet.
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', (select source_key from core.game where game_id = m.game_id), 'No result in SPX',
       format('Filled from Retrosheet: %s-%s', m.r_h, m.r_a)
from matched m where m.status <> 'final';
update core.game g set status = 'final', home_score = m.r_h, away_score = m.r_a, updated_at = now()
from matched m where g.game_id = m.game_id and m.status <> 'final';

-- A result both hold: a check mark when they agree, a flag when they don't.
insert into meta.verification (entity_kind, entity_id, field, status, source_id, their_value)
select 'game', m.game_id, 'score', case when m.home_score = m.r_h and m.away_score = m.r_a then 'confirmed' else 'disputed' end::meta.verification_status,
       (select source_id from src), m.r_h || '-' || m.r_a
from matched m where m.status = 'final';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', (select source_key from core.game where game_id = m.game_id),
       format('SPX has %s-%s, Retrosheet %s-%s', m.home_score, m.away_score, m.r_h, m.r_a), 'Kept SPX''s; needs a third source'
from matched m where m.status = 'final' and (m.home_score <> m.r_h or m.away_score <> m.r_a);

-- Every Retrosheet game SPX does not hold.
insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, status, home_score, away_score,
                       went_to_overtime, notes, source_id, source_key)
select s.season_id, r.phase, r.game_date, hts.team_season_id, ats.team_season_id,
       case when r.home_score is not null and r.visitor_score is not null then 'final' else 'scheduled' end::core.game_status,
       r.home_score, r.visitor_score, case when r.outs > 54 then true when r.outs is not null then false end,
       nullif(concat_ws('; ', case when r.forfeit is not null then 'Forfeit: ' || r.forfeit end,
                              case when r.completion is not null then 'Completed later: ' || r.completion end), ''),
       (select source_id from src), r.key
from rg_n r
join core.season s on s.league_code = 'mlb' and s.start_year = r.yr
join core.team_season hts on hts.franchise_id = r.home_f and hts.season_id = s.season_id
join core.team_season ats on ats.franchise_id = r.away_f and ats.season_id = s.season_id
where r.phase <> 'all_star' and r.key not in (select key from matched) and r.home_f <> r.away_f;

insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'game', g.game_id, g.source_id, substring(g.source_key from 7) from core.game g where g.source_id = (select source_id from src);
insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'game', m.game_id, (select source_id from src), substring(m.key from 7) from matched m;

select 'matched', count(*) from matched
union all select 'filled', count(*) from matched where status <> 'final'
union all select 'confirmed', count(*) from matched where status = 'final' and home_score = r_h and away_score = r_a
union all select 'disputed', count(*) from matched where status = 'final' and (home_score <> r_h or away_score <> r_a)
union all select 'added', count(*) from core.game where source_id = (select source_id from src)
union all select 'unmatched team', count(*) from rg where home_f is null or away_f is null;
commit;

-- NHL from the NHL's public web API (api-web.nhle.com): every game since
-- 1917-18 (regular season and playoffs), each season's final standings, and
-- every franchise's names by season. Where the SPX database holds a season
-- (2002-2012, plus the 1999-2001 schedules with no results), SPX stays the
-- base: the API fills a result SPX never entered, confirms one that agrees and
-- flags one that does not. Every other season comes from the API alone.
-- The API publishes no licence; scores and standings are facts. Runs after
-- 100-140, before 150 and 155. Safe to rerun as seasons arrive (load them
-- first with scripts/nhlapi/load.py): it rebuilds only what the API supplied.
begin;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, retrieved_on, notes)
values ('nhl_api', 'NHL', 'api', 'No licence published; scores and standings are facts', 'NHL results and standings from the NHL.',
        'https://api-web.nhle.com', '1917-12-19', current_date,
        'club-schedule-season per team and standings on the last regular-season day, from api-web.nhle.com/v1. Team names are the API''s, by season.')
on conflict (code) do update set retrieved_on = current_date;
create temp table src as select source_id from meta.source where code = 'nhl_api';

-- On a rerun, first take back what an earlier run filled into SPX's games, so they are matched afresh
-- (a filled result would otherwise be "confirmed" by the very source it came from).
update core.game g set status = 'scheduled', home_score = null, away_score = null, went_to_overtime = null, decided_by_shootout = null,
       game_date = coalesce(g.original_date, g.game_date), original_date = null, updated_at = now()
from meta.data_issue d
where d.source_id = (select source_id from src) and d.issue = 'No result in SPX' and d.entity_key = g.source_key
  and g.source_id <> (select source_id from src);

delete from core.standing where source_id = (select source_id from src);
delete from meta.verification where source_id = (select source_id from src);
delete from meta.data_issue where source_id = (select source_id from src);
delete from core.external_id where source_id = (select source_id from src) and entity_kind <> 'person';

-- The API's abbreviations -> franchise, by the year a season starts. A relocated
-- team joins its current franchise (spx_team_id: SPX's number for it); a team no
-- current franchise descends from gets a franchise of its own (new_key).
create temp table amap (abbrev text not null, y0 integer not null, y1 integer not null, spx_team_id integer, new_key text);
insert into amap values
  ('MTL',1917,9999,14,null),('TOR',1917,9999,26,null),('TAN',1917,9999,26,null),('TSP',1917,9999,26,null),
  ('BOS',1917,9999,3,null),('NYR',1917,9999,18,null),('CHI',1917,9999,7,null),('DET',1917,9999,10,null),('DCG',1917,9999,10,null),('DFL',1917,9999,10,null),
  ('PHI',1967,9999,20,null),('PIT',1967,9999,22,null),('STL',1967,9999,24,null),('LAK',1967,9999,13,null),
  ('MNS',1967,1992,9,null),('DAL',1993,9999,9,null),
  ('BUF',1970,9999,4,null),('VAN',1970,9999,27,null),('NYI',1972,9999,17,null),
  ('AFM',1972,1979,5,null),('ATF',1972,1979,5,null),('CGY',1980,9999,5,null),
  ('KCS',1974,1975,16,null),('CLR',1976,1981,16,null),('NJD',1982,9999,16,null),
  ('WSH',1974,9999,28,null),('EDM',1979,9999,11,null),
  ('HFD',1979,1996,6,null),('CAR',1997,9999,6,null),
  ('QUE',1979,1994,8,null),('COL',1995,9999,8,null),
  ('WIN',1979,1995,21,null),('PHX',1996,2013,21,null),('ARI',2014,2023,21,null),('UTA',2024,9999,null,'UTA'),
  ('WPG',2011,9999,2,null),('ATL',1999,2010,2,null),
  ('ANA',1993,9999,1,null),('MDA',1993,9999,1,null),('FLA',1993,9999,12,null),('TBL',1992,9999,25,null),('OTT',1992,9999,19,null),
  ('SJS',1991,9999,23,null),('NSH',1998,9999,15,null),('CBJ',2000,9999,88,null),('MIN',2000,9999,89,null),
  ('VGK',2017,9999,null,'VGK'),('SEA',2021,9999,null,'SEA'),
  ('SEN',1917,1934,null,'SEN'),('SLE',1917,1934,null,'SEN'),('MWN',1917,1917,null,'MWN'),
  ('QBD',1919,1919,null,'QBD'),('HAM',1920,1924,null,'QBD'),('NYA',1925,1940,null,'QBD'),('BRK',1941,1941,null,'QBD'),
  ('MMR',1924,1937,null,'MMR'),('PIR',1925,1929,null,'PIR'),('QUA',1930,1930,null,'PIR'),
  ('CAT',1917,1930,null,'CAT'),('EDE',1917,1930,null,'EDE'),('SMT',1917,1930,null,'SMT'),('VIC',1917,1930,null,'VIC'),
  ('VMA',1917,1930,null,'VMA'),('VMI',1917,1930,null,'VMI'),
  ('OAK',1967,1969,null,'OAK'),('CGS',1970,1975,null,'OAK'),('CSE',1967,1975,null,'OAK'),('CLE',1976,1977,null,'OAK'),('CBN',1976,1977,null,'OAK');

-- A franchise per new key, made once and kept across reruns.
insert into core.franchise (sport_code, source_id, source_key)
select 'hockey', (select source_id from src), k from (select distinct new_key k from amap where new_key is not null) x
where not exists (select 1 from core.franchise f where f.source_id = (select source_id from src) and f.source_key = x.k);

create temp table am as
select a.abbrev, a.y0, a.y1,
       coalesce(e.entity_id, f.franchise_id)::integer as franchise_id
from amap a
left join core.external_id e on e.entity_kind = 'franchise' and e.external_key = 'team:' || a.spx_team_id
     and e.source_id = (select source_id from meta.source where code = 'spx_database')
left join core.franchise f on f.source_id = (select source_id from src) and f.source_key = a.new_key;

-- Every API game and standing with its franchises and season year.
create temp table ng as
select g.*, substring(g.season, 1, 4)::integer as yr,
       h.franchise_id as home_f, a.franchise_id as away_f,
       case g.game_type when 2 then 'regular' else 'playoffs' end::core.season_phase as phase
from legacy_nhlapi.game g
left join am h on h.abbrev = g.home_abbrev and substring(g.season, 1, 4)::integer between h.y0 and h.y1
left join am a on a.abbrev = g.away_abbrev and substring(g.season, 1, 4)::integer between a.y0 and a.y1;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', 'nhlapi:' || nhl_game_id,
       format('Team abbreviation not matched to a franchise: %s / %s in %s', away_abbrev, home_abbrev, season), 'Game left out'
from ng where home_f is null or away_f is null;
delete from ng where home_f is null or away_f is null or home_f = away_f;

create temp table nst as
select s.*, substring(s.season, 1, 4)::integer as yr, m.franchise_id
from legacy_nhlapi.standing s
left join am m on m.abbrev = s.team_abbrev and substring(s.season, 1, 4)::integer between m.y0 and m.y1;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'standing', season || ':' || team_abbrev, 'Team abbreviation not matched to a franchise', 'Standing left out'
from nst where franchise_id is null;
delete from nst where franchise_id is null;

-- Which abbreviation is which franchise: one external id per (franchise, abbreviation).
insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'franchise', franchise_id, (select source_id from src), 'team:' || abbrev
from (select abbrev, min(franchise_id) as franchise_id, count(distinct franchise_id) n from am group by abbrev) x where n = 1
union all
select 'franchise', franchise_id, (select source_id from src), 'team:' || abbrev || '/' || y0
from am where abbrev in (select abbrev from am group by abbrev having count(distinct franchise_id) > 1);

-- Seasons the API holds (2004-05 has none).
insert into core.season (league_code, start_year, end_year, label, source_id)
select 'nhl', yr, yr + 1, yr || '-' || right((yr + 1)::text, 2), (select source_id from src)
from (select yr from ng union select yr from nst) x on conflict (league_code, start_year) do nothing;
update core.season s set
  regular_starts_on = coalesce(s.regular_starts_on, d.rs), regular_ends_on = coalesce(s.regular_ends_on, d.re),
  playoffs_end_on = coalesce(s.playoffs_end_on, d.pe)
from (select yr, min(game_date) filter (where phase = 'regular') rs, max(game_date) filter (where phase = 'regular') re,
             max(game_date) filter (where phase = 'playoffs') pe from ng group by yr) d
where s.league_code = 'nhl' and s.start_year = d.yr;
-- Scheduled games per team: what the final standings counted, except where a season was cut short or is still being played.
update core.season s set games_per_team = x.gp
from (select yr, max(gp) gp from nst where yr < (select max(yr) from nst) group by yr) x
where s.league_code = 'nhl' and s.start_year = x.yr and s.games_per_team is null and x.yr not in (2019, 2020);
update core.season set games_per_team = 82 where league_code = 'nhl' and start_year = 2019 and games_per_team is null;
update core.season set games_per_team = 56 where league_code = 'nhl' and start_year = 2020 and games_per_team is null;

-- Names by season, the API's own (a parenthesised year only tells two clubs of one city apart).
create temp table nm0 as
select yr, abbrev, franchise_id, loc, nick, count(*) n from (
  select g.yr, g.home_abbrev abbrev, g.home_f franchise_id, g.row #>> '{homeTeam,placeName,default}' loc, g.row #>> '{homeTeam,commonName,default}' nick from ng g
  union all
  select g.yr, g.away_abbrev, g.away_f, g.row #>> '{awayTeam,placeName,default}', g.row #>> '{awayTeam,commonName,default}' from ng g) x
where loc is not null and nick is not null group by 1, 2, 3, 4, 5;
create temp table nm as
select distinct on (yr, franchise_id) yr, franchise_id, abbrev, loc as location,
       case when nick like loc || ' %' then substr(regexp_replace(nick, '\s*\(\d{4}\)$', ''), length(loc) + 2)
            else regexp_replace(nick, '\s*\(\d{4}\)$', '') end as nickname,
       loc || ' ' || case when nick like loc || ' %' then substr(regexp_replace(nick, '\s*\(\d{4}\)$', ''), length(loc) + 2)
                          else regexp_replace(nick, '\s*\(\d{4}\)$', '') end as full_name
from nm0 order by yr, franchise_id, n desc, abbrev;
create temp table fr as select distinct franchise_id from nm;

-- An identity keeps its franchise_identity_id on a rerun: the id of each one deleted here goes to ingest.row_id_map (a key already there keeps its first id)
-- and ingest.identity_id_for (migration 146) gives it back to the identity with the same franchise and first day. Step 154 folds the Maroons (VMA) into the
-- Millionaires (VMI), so VMA's identities are remembered under VMI's franchise id.
create temp table fr_canon as
select f.franchise_id, coalesce(case when f.source_key = 'VMA' then (select v.franchise_id from core.franchise v where v.source_id = f.source_id and v.source_key = 'VMI') end, f.franchise_id) as canon
from core.franchise f where f.franchise_id in (select franchise_id from fr);
insert into ingest.row_id_map (tbl, natural_key, row_id)
select 'core.franchise_identity', c.canon || '/' || coalesce(lower(i.valid_during)::text, ''), i.franchise_identity_id
from core.franchise_identity i join fr_canon c using (franchise_id)
on conflict (tbl, natural_key) do nothing;
update core.team_season set franchise_identity_id = null where franchise_id in (select franchise_id from fr);
delete from core.franchise_identity where franchise_id in (select franchise_id from fr);
delete from core.franchise_league where league_code = 'nhl' and franchise_id in (select franchise_id from fr);
-- Consecutive seasons under one name are one identity; a team's last identity
-- stays open only while it still plays.
create temp table last_season as select max(yr) y from nm;
insert into core.franchise_identity (franchise_identity_id, franchise_id, valid_during, location, nickname, full_name, abbreviation, country_code, source_id)
overriding system value
select ingest.identity_id_for((select c.canon from fr_canon c where c.franchise_id = y.franchise_id), make_date(first_yr, 7, 1)), franchise_id,
       daterange(make_date(first_yr, 7, 1), case when next_yr is not null then make_date(next_yr, 7, 1)
                                                  when last_yr < (select y from last_season) - 1 then make_date(last_yr + 1, 7, 1) end),
       location, nickname, full_name, abbreviation,
       case when abbreviation in ('MTL','TOR','TAN','TSP','OTT','SEN','SLE','MWN','MMR','QBD','HAM','QUE','WIN','WPG','CGY','EDM','VAN') then 'CA' else 'US' end,
       (select source_id from src)
from (select franchise_id, full_name, location, nickname, abbrev as abbreviation, min(yr) first_yr, max(yr) last_yr,
             lead(min(yr)) over (partition by franchise_id order by min(yr)) next_yr
      from (select nm.*, dense_rank() over (order by yr) - row_number() over (partition by franchise_id, full_name, abbrev order by yr) as island from nm) x
      group by franchise_id, full_name, location, nickname, abbrev, island) y;
insert into core.franchise_league (franchise_id, league_code, valid_during, source_id)
select franchise_id, 'nhl', daterange(min(lower(valid_during)), case when bool_or(upper_inf(valid_during)) then null else max(upper(valid_during)) end), (select source_id from src)
from core.franchise_identity where franchise_id in (select franchise_id from fr)
  -- never NHL members (see the delete below); a rerun after 154 must not insert them, their WCHL/PCHA membership overlaps in time
  and franchise_id not in (select franchise_id from core.franchise where source_id = (select source_id from src) and source_key in ('CAT', 'EDE', 'SMT', 'VIC', 'VMA', 'VMI'))
group by franchise_id;
-- Clubs of the Pacific Coast and Western leagues the NHL's clubs met in Stanley Cup play were never NHL members.
delete from core.franchise_league where league_code = 'nhl' and franchise_id in
  (select franchise_id from core.franchise where source_id = (select source_id from src) and source_key in ('CAT', 'EDE', 'SMT', 'VIC', 'VMA', 'VMI'));
update core.franchise set notes = 'Not an NHL member; met NHL clubs in Stanley Cup play'
where source_id = (select source_id from src) and source_key in ('CAT', 'EDE', 'SMT', 'VIC', 'VMA', 'VMI') and notes is null;
update core.franchise f set founded_on = coalesce(f.founded_on, d.first_game), folded_on = case when f.source_id = (select source_id from src) and d.last_yr < (select y from last_season) - 1 then d.last_game else f.folded_on end
from (select fid, min(game_date) first_game, max(game_date) last_game, max(yr) last_yr
      from (select home_f fid, game_date, yr from ng union all select away_f, game_date, yr from ng) z group by fid) d
where f.franchise_id = d.fid and (f.source_id = (select source_id from src) or f.founded_on is null);
-- The Coyotes' history stays with their own franchise: Utah (2024) is a new NHL franchise, so the Jets-Coyotes one ended with its last home game.
update core.franchise f set folded_on = d.last_game
from (select fid, max(game_date) last_game from (select home_f fid, game_date from ng union all select away_f, game_date from ng) z group by fid) d
where f.franchise_id = d.fid and f.franchise_id = (select franchise_id from am where abbrev = 'ARI') and f.folded_on is distinct from d.last_game;

-- Seasons an earlier build gave the Jets-Coyotes franchise under a Utah name move, with everything that points at them, to Utah's own franchise.
update core.team_season ts set franchise_id = u.franchise_id, franchise_identity_id = null
from am u, am c, core.season s
where u.abbrev = 'UTA' and c.abbrev = 'ARI' and ts.franchise_id = c.franchise_id and s.season_id = ts.season_id and s.league_code = 'nhl' and s.start_year >= u.y0
  and not exists (select 1 from core.team_season x where x.franchise_id = u.franchise_id and x.season_id = ts.season_id);
-- Brand rows (logo, colours, home venue) the Jets-Coyotes franchise got for Utah's years; 175_team_brand.sql adds them again to Utah's franchise.
delete from core.franchise_brand b using am u, am c
where u.abbrev = 'UTA' and c.abbrev = 'ARI' and b.franchise_id = c.franchise_id and lower(b.valid_during) >= make_date(u.y0, 7, 1);
insert into core.team_season (franchise_id, season_id, source_id)
select distinct x.f, s.season_id, (select source_id from src)
from (select yr, home_f f from ng union select yr, away_f from ng union select yr, franchise_id from nst) x
join core.season s on s.league_code = 'nhl' and s.start_year = x.yr
on conflict (franchise_id, season_id) do nothing;
update core.team_season ts set franchise_identity_id = (
  select i.franchise_identity_id from core.franchise_identity i join core.season s on s.season_id = ts.season_id
  where i.franchise_id = ts.franchise_id and i.valid_during @> make_date(s.start_year, 10, 15) limit 1)
where ts.franchise_id in (select franchise_id from fr);

-- SPX's NHL games, to be matched one to one with the API's: first on the same date,
-- then a day either side (SPX dated some games by the next morning).
create temp table spx_g as
select g.game_id, g.game_date, g.status, g.home_score, g.away_score, h.franchise_id home_f, a.franchise_id away_f, s.start_year
from core.game g join core.season s using (season_id)
join core.team_season h on h.team_season_id = g.home_team_season_id join core.team_season a on a.team_season_id = g.away_team_season_id
where s.league_code = 'nhl' and g.source_id <> (select source_id from src) and g.status <> 'cancelled';
create temp table matched (key bigint primary key, game_id bigint unique not null, moved boolean not null default false);
insert into matched
select distinct on (game_id) key, game_id from (
  select distinct on (n.nhl_game_id) n.nhl_game_id key, s.game_id, s.status, n.game_date
  from ng n join spx_g s on s.start_year = n.yr and s.game_date = n.game_date and s.home_f = n.home_f and s.away_f = n.away_f
  order by n.nhl_game_id, (s.status = 'final') desc, s.game_id) a
order by game_id, key;
insert into matched
select distinct on (game_id) key, game_id from (
  select distinct on (n.nhl_game_id) n.nhl_game_id key, s.game_id, s.status, abs(s.game_date - n.game_date) dd
  from ng n join spx_g s on s.start_year = n.yr and abs(s.game_date - n.game_date) <= 1 and s.home_f = n.home_f and s.away_f = n.away_f
  where n.nhl_game_id not in (select key from matched) and s.game_id not in (select game_id from matched)
  order by n.nhl_game_id, (s.status = 'final') desc, abs(s.game_date - n.game_date), s.game_id) a
order by game_id, dd, key;
-- A game SPX still lists on its old date but the API played later (postponed): the same two teams in the
-- same season, with no result in SPX and no other game of the API's to take it.
insert into matched (key, game_id, moved)
select distinct on (game_id) key, game_id, true from (
  select distinct on (n.nhl_game_id) n.nhl_game_id key, s.game_id, abs(s.game_date - n.game_date) dd
  from ng n join spx_g s on s.start_year = n.yr and s.home_f = n.home_f and s.away_f = n.away_f and s.status <> 'final'
  where n.nhl_game_id not in (select key from matched) and s.game_id not in (select game_id from matched)
  order by n.nhl_game_id, abs(s.game_date - n.game_date), s.game_id) a
order by game_id, dd, key;

create temp table mm as
select m.key, m.moved, n.game_date as r_date, n.home_score r_h, n.away_score r_a, s.game_id, s.status, s.home_score, s.away_score,
       (n.last_period_type in ('OT', 'SO')) r_ot, (n.last_period_type = 'SO') r_so,
       (n.home_score is not null and n.away_score is not null and n.game_state in ('FINAL', 'OFF')) as r_final
from matched m join ng n on n.nhl_game_id = m.key join spx_g s on s.game_id = m.game_id;

-- SPX filed some playoff games under the regular season (and the reverse): the NHL knows which.
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', g.source_key, format('SPX has the game as %s, the NHL as %s', g.phase, n.phase), 'Phase taken from the NHL'
from matched m join core.game g using (game_id) join ng n on n.nhl_game_id = m.key
where g.phase in ('regular', 'playoffs') and g.phase <> n.phase;
update core.game g set phase = n.phase, updated_at = now()
from matched m join ng n on n.nhl_game_id = m.key
where g.game_id = m.game_id and g.phase in ('regular', 'playoffs') and g.phase <> n.phase;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', (select source_key from core.game where game_id = m.game_id), 'No result in SPX',
       format('Filled from the NHL: %s-%s', m.r_h, m.r_a)
from mm m where m.status <> 'final' and m.r_final;
update core.game g set status = 'final', home_score = m.r_h, away_score = m.r_a,
       original_date = case when m.moved and abs(g.game_date - m.r_date) > 1 then g.game_date else g.original_date end,
       game_date = case when m.moved and abs(g.game_date - m.r_date) > 1 then m.r_date else g.game_date end,
       went_to_overtime = coalesce(m.r_ot, g.went_to_overtime), decided_by_shootout = coalesce(m.r_so, g.decided_by_shootout), updated_at = now()
from mm m where g.game_id = m.game_id and m.status <> 'final' and m.r_final;
insert into meta.verification (entity_kind, entity_id, field, status, source_id, their_value)
select 'game', m.game_id, 'score', case when m.home_score = m.r_h and m.away_score = m.r_a then 'confirmed' else 'disputed' end::meta.verification_status,
       (select source_id from src), m.r_h || '-' || m.r_a
from mm m where m.status = 'final' and m.r_final;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', (select source_key from core.game where game_id = m.game_id),
       format('SPX has %s-%s, the NHL %s-%s', m.home_score, m.away_score, m.r_h, m.r_a), 'Kept SPX''s; needs a third source'
from mm m where m.status = 'final' and m.r_final and (m.home_score <> m.r_h or m.away_score <> m.r_a);

-- An SPX result in a season the API covers whole, with no game at the NHL to match it.
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', g.source_key, 'SPX game not found at the NHL (date or teams differ)', 'Kept SPX''s; check the date and the teams'
from spx_g s join core.game g using (game_id)
where s.game_id not in (select game_id from matched) and g.phase in ('regular', 'playoffs') and s.status = 'final'
  and s.start_year in (select yr from ng);

-- The API's own games keep their game_id on a rerun (the site's game addresses and the daily job carry it): a game already there is updated in place,
-- one the API no longer lists (or that SPX's game now takes over) is deleted, a new one is added. Child rows (game_league_id, game_venue, ...) stay.
create temp table api_game as
select s.season_id, n.phase, n.game_date, (n.row ->> 'startTimeUTC')::timestamptz as starts_at, hts.team_season_id as home_ts, ats.team_season_id as away_ts,
       coalesce((n.row ->> 'neutralSite')::boolean, false) as is_neutral_site,
       case when n.home_score is not null and n.away_score is not null and n.game_state in ('FINAL', 'OFF') then 'final'
            when n.row ->> 'gameScheduleState' = 'PPD' then 'postponed'
            when n.row ->> 'gameScheduleState' = 'CNCL' then 'cancelled'
            when n.game_state in ('LIVE', 'CRIT') then 'in_progress' else 'scheduled' end::core.game_status as status,
       n.home_score, n.away_score,
       case when n.last_period_type in ('OT', 'SO') then true when n.last_period_type = 'REG' then false end as went_to_overtime,
       case when n.last_period_type = 'SO' then true when n.last_period_type in ('OT', 'REG') then false end as decided_by_shootout,
       'nhlapi:' || n.nhl_game_id as source_key
from ng n join core.season s on s.league_code = 'nhl' and s.start_year = n.yr
join core.team_season hts on hts.franchise_id = n.home_f and hts.season_id = s.season_id
join core.team_season ats on ats.franchise_id = n.away_f and ats.season_id = s.season_id
where n.nhl_game_id not in (select key from matched);
-- A score without a final state (a game still on) is no result.
update api_game set home_score = null, away_score = null where status <> 'final';
delete from core.game g where g.source_id = (select source_id from src) and not exists (select 1 from api_game a where a.source_key = g.source_key);
update core.game g set season_id = a.season_id, phase = a.phase, game_date = a.game_date, starts_at = a.starts_at, home_team_season_id = a.home_ts,
       away_team_season_id = a.away_ts, is_neutral_site = a.is_neutral_site, status = a.status, home_score = a.home_score, away_score = a.away_score,
       went_to_overtime = a.went_to_overtime, decided_by_shootout = a.decided_by_shootout, updated_at = now()
from api_game a
where g.source_id = (select source_id from src) and g.source_key = a.source_key
  and (g.season_id, g.phase, g.game_date, g.starts_at, g.home_team_season_id, g.away_team_season_id, g.is_neutral_site, g.status, g.home_score, g.away_score,
       g.went_to_overtime, g.decided_by_shootout)
  is distinct from (a.season_id, a.phase, a.game_date, a.starts_at, a.home_ts, a.away_ts, a.is_neutral_site, a.status, a.home_score, a.away_score,
       a.went_to_overtime, a.decided_by_shootout);
insert into core.game (season_id, phase, game_date, starts_at, home_team_season_id, away_team_season_id, is_neutral_site, status,
                       home_score, away_score, went_to_overtime, decided_by_shootout, source_id, source_key)
select season_id, phase, game_date, starts_at, home_ts, away_ts, is_neutral_site, status, home_score, away_score, went_to_overtime, decided_by_shootout,
       (select source_id from src), source_key
from api_game a
where not exists (select 1 from core.game g where g.source_id = (select source_id from src) and g.source_key = a.source_key);

insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'game', game_id, source_id, substring(source_key from 8) from core.game where source_id = (select source_id from src)
union all select 'game', game_id, (select source_id from src), key::text from matched;

-- Final standings: the last regular-season day each season.
insert into core.standing (team_season_id, phase, as_of, source_id, games_played, wins, losses, ties, ot_losses, points, points_for, points_against,
                           home_record, road_record, last_ten, streak, division_rank, source_key)
select ts.team_season_id, 'regular', n.as_of, (select source_id from src), n.gp, n.w, n.l, n.ties,
       case when n.yr >= 1999 then n.ot_losses end, n.points, n.goals_for, n.goals_against, n.home_record, n.road_record,
       case when n.yr < 1999 then (n.row ->> 'l10Wins') || '-' || (n.row ->> 'l10Losses') || '-' || coalesce(n.row ->> 'l10Ties', '0')
            when n.yr < 2005 then (n.row ->> 'l10Wins') || '-' || (n.row ->> 'l10Losses') || '-' || coalesce(n.row ->> 'l10Ties', '0') || '-' || coalesce(n.row ->> 'l10OtLosses', '0')
            else (n.row ->> 'l10Wins') || '-' || (n.row ->> 'l10Losses') || '-' || coalesce(n.row ->> 'l10OtLosses', '0') end,
       nullif(coalesce(n.row ->> 'streakCode', '') || coalesce(n.row ->> 'streakCount', ''), ''),
       nullif((n.row ->> 'divisionSequence')::smallint, 0),
       'nhlapi:' || n.season || ':' || n.as_of || ':' || n.team_abbrev
from nst n join core.season s on s.league_code = 'nhl' and s.start_year = n.yr
join core.team_season ts on ts.franchise_id = n.franchise_id and ts.season_id = s.season_id
on conflict do nothing;

select 'matched', count(*) from mm
union all select 'filled', count(*) from mm where status <> 'final' and r_final
union all select 'confirmed', count(*) from mm where status = 'final' and r_final and home_score = r_h and away_score = r_a
union all select 'disputed', count(*) from mm where status = 'final' and r_final and (home_score <> r_h or away_score <> r_a)
union all select 'added', count(*) from core.game where source_id = (select source_id from src)
union all select 'standings', count(*) from core.standing where source_id = (select source_id from src)
union all select 'unmatched team', count(*) from meta.data_issue where source_id = (select source_id from src) and issue like '%abbreviation not matched%';
commit;

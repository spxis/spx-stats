-- The World Cup (soccer): core.soccer_* from legacy_worldcup (migrations 065, 066). Rerunnable, matched by stable keys:
--   teams       soccer_team.team_id = jfjelstul's team id (T-30); teams the 2026 file adds get X-<slug>
--   matches     soccer_match.source_key = jfjelstul's match id (M-1930-01), or of-<year>-<seq> for a year only openfootball has (2026)
--   people      core.external_id (source jfjelstul_worldcup, kind person, key P-xxxxx player / M-xxx manager / R-xxx referee)
-- A player is matched to a person the archive already has only with a confirming fact: the same Wikidata item, or the same birth date
-- and the same name (folded, no accents). Never on the name alone. Everything else becomes a new core.person.
-- Second check: openfootball's own result of each men's match 1930-2022 -> meta.verification (confirmed / disputed / not_found) and
-- meta.data_issue for a disagreement; the jfjelstul value is kept. 2026 comes from openfootball only (no second source yet).
-- Does not touch core.venue, core.game, core.team_season, franchise_brand or any venue table.

-- ---------------------------------------------------------------- sources, sport, competitions

drop table if exists wc_src, wc_team_geo, wc_team_alias, wc_t, wc_stage, wc_stadium, wc_person_src,
  wc_person_map, wc_cand, wc_new, wc_of26, wc_check;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, covers_to, retrieved_on, notes) values
 ('jfjelstul_worldcup', 'The Fjelstul World Cup Database', 'dataset', 'CC BY-SA 4.0',
  'Joshua C. Fjelstul, Ph.D., The Fjelstul World Cup Database, © 2023 Joshua C. Fjelstul, Ph.D., CC BY-SA 4.0. Modified by SPX Stats: rows restructured into the archive''s tables, ids and names matched to existing people only with a confirming fact.',
  'https://github.com/jfjelstul/worldcup', '1930-07-13', '2022-12-18', '2026-10-13',
  'Men''s World Cups 1930-2022 and women''s 1991-2019: tournaments, teams, matches, goals, bookings, substitutions, lineups, squads, managers, referees, awards. Commit 35a8667 (2026-06-11).'),
 ('openfootball_worldcup', 'openfootball/worldcup', 'dataset', 'CC0 1.0',
  'openfootball contributors (public domain)',
  'https://github.com/openfootball/worldcup', '1930-07-13', '2026-07-19', '2026-10-13',
  'Match results in Football.TXT: the second check of every men''s match 1930-2022, and the only source for the 2026 World Cup. Commit 19155966 (2026-08-22).')
on conflict (code) do update set name = excluded.name, kind = excluded.kind, licence = excluded.licence, attribution = excluded.attribution,
  url = excluded.url, covers_from = excluded.covers_from, covers_to = excluded.covers_to, retrieved_on = excluded.retrieved_on, notes = excluded.notes;

insert into ref.sport (sport_code, name) values ('soccer', 'Soccer') on conflict (sport_code) do update set name = excluded.name;
insert into ref.league (league_code, sport_code, founded_on, notes) values
 ('wc', 'soccer', '1930-07-13', 'FIFA World Cup (men''s national teams)'),
 ('wwc', 'soccer', '1991-11-16', 'FIFA Women''s World Cup (women''s national teams)')
on conflict (league_code) do update set sport_code = excluded.sport_code, founded_on = excluded.founded_on, notes = excluded.notes;
insert into ref.league_name (league_code, valid_during, name, short_name) values
 ('wc', '(,)', 'FIFA World Cup', 'World Cup'),
 ('wwc', '(,)', 'FIFA Women''s World Cup', 'Women''s World Cup')
on conflict (league_code, valid_during) do update set name = excluded.name, short_name = excluded.short_name;

create temp table wc_src as select
  (select source_id from meta.source where code = 'jfjelstul_worldcup') as jf,
  (select source_id from meta.source where code = 'openfootball_worldcup') as ofb,
  (select source_id from meta.source where code = 'wikidata') as wd;

-- ---------------------------------------------------------------- teams

-- flag (ISO 3166-1/-2 code Hata draws; null where the state no longer exists and its flag differs) and country (alpha-2) per team
create temp table wc_team_geo (team_id text primary key, flag_code text, country_code text, continues text);
insert into wc_team_geo values
 ('T-01','DZ','DZ',null),('T-02','AO','AO',null),('T-03','AR','AR',null),('T-04','AU','AU',null),('T-05','AT','AT',null),('T-06','BE','BE',null),
 ('T-07','BO','BO',null),('T-08','BA','BA',null),('T-09','BR','BR',null),('T-10','BG','BG',null),('T-11','CM','CM',null),('T-12','CA','CA',null),
 ('T-13','CL','CL',null),('T-14','CN','CN',null),('T-15','TW','TW',null),('T-16','CO','CO',null),('T-17','CR','CR',null),('T-18','HR','HR',null),
 ('T-19','CU','CU',null),('T-20','CZ','CZ','T-21'),('T-21',null,null,null),('T-22','DK','DK',null),('T-23',null,'ID',null),('T-24',null,'DE',null),
 ('T-25','EC','EC',null),('T-26','EG','EG',null),('T-27','SV','SV',null),('T-28','GB-ENG','GB',null),('T-29','GQ','GQ',null),('T-30','FR','FR',null),
 ('T-31','DE','DE','T-86'),('T-32','GH','GH',null),('T-33','GR','GR',null),('T-34','HT','HT',null),('T-35','HN','HN',null),('T-36','HU','HU',null),
 ('T-37','IS','IS',null),('T-38','IR','IR',null),('T-39','IQ','IQ',null),('T-40','IL','IL',null),('T-41','IT','IT',null),('T-42','CI','CI',null),
 ('T-43','JM','JM',null),('T-44','JP','JP',null),('T-45','KW','KW',null),('T-46','MX','MX',null),('T-47','MA','MA',null),('T-48','NL','NL',null),
 ('T-49','NZ','NZ',null),('T-50','NG','NG',null),('T-51','KP','KP',null),('T-52','GB-NIR','GB',null),('T-53','NO','NO',null),('T-54','PA','PA',null),
 ('T-55','PY','PY',null),('T-56','PE','PE',null),('T-57','PL','PL',null),('T-58','PT','PT',null),('T-59','QA','QA',null),('T-60','IE','IE',null),
 ('T-61','RO','RO',null),('T-62','RU','RU','T-72'),('T-63','SA','SA',null),('T-64','GB-SCT','GB',null),('T-65','SN','SN',null),('T-66','RS','RS','T-67'),
 ('T-67',null,null,'T-87'),('T-68','SK','SK',null),('T-69','SI','SI',null),('T-70','ZA','ZA',null),('T-71','KR','KR',null),('T-72',null,null,null),
 ('T-73','ES','ES',null),('T-74','SE','SE',null),('T-75','CH','CH',null),('T-76','TH','TH',null),('T-77','TG','TG',null),('T-78','TT','TT',null),
 ('T-79','TN','TN',null),('T-80','TR','TR',null),('T-81','UA','UA',null),('T-82','AE','AE',null),('T-83','US','US',null),('T-84','UY','UY',null),
 ('T-85','GB-WLS','GB',null),('T-86','DE','DE',null),('T-87',null,null,null),('T-88',null,null,null);

insert into core.soccer_team (team_id, name, slug, fifa_code, flag_code, country_code, federation, region, confederation, continues_team_id,
                              wikidata_men, wikidata_women, has_men, has_women, source_id)
select d.data->>'team_id', d.data->>'team_name', replace(core.fold_text(d.data->>'team_name'), ' ', '-'), d.data->>'team_code',
       g.flag_code, case when exists (select 1 from ref.country c where c.country_code = g.country_code) then g.country_code end,
       d.data->>'federation_name', d.data->>'region_name', d.data->>'confederation_code', g.continues,
       (select qid from legacy_worldcup.wikipedia_item w where w.url = d.data->>'mens_team_wikipedia_link'),
       (select qid from legacy_worldcup.wikipedia_item w where w.url = d.data->>'womens_team_wikipedia_link'),
       d.data->>'mens_team' = '1', d.data->>'womens_team' = '1', (select jf from wc_src)
from legacy_worldcup.csv_row d left join wc_team_geo g on g.team_id = d.data->>'team_id'
where d.dataset = 'teams'
on conflict (team_id) do update set name = excluded.name, slug = excluded.slug, fifa_code = excluded.fifa_code, flag_code = excluded.flag_code,
  country_code = excluded.country_code, federation = excluded.federation, region = excluded.region, confederation = excluded.confederation,
  continues_team_id = excluded.continues_team_id, wikidata_men = excluded.wikidata_men, wikidata_women = excluded.wikidata_women,
  has_men = excluded.has_men, has_women = excluded.has_women, source_id = excluded.source_id;

-- teams only the 2026 file has (openfootball names them; no federation data)
insert into core.soccer_team (team_id, name, slug, fifa_code, flag_code, country_code, region, confederation, continues_team_id, has_men, source_id) values
 ('X-curacao',    'Curaçao',    'curacao',    'CUW', 'CW', null, 'Caribbean', 'CONCACAF', null,   true, (select ofb from wc_src)),
 ('X-cape-verde', 'Cape Verde', 'cape-verde', 'CPV', 'CV', 'CV', 'Africa',    'CAF',      null,   true, (select ofb from wc_src)),
 ('X-jordan',     'Jordan',     'jordan',     'JOR', 'JO', 'JO', 'Middle East', 'AFC',    null,   true, (select ofb from wc_src)),
 ('X-uzbekistan', 'Uzbekistan', 'uzbekistan', 'UZB', 'UZ', 'UZ', 'Central Asia', 'AFC',   null,   true, (select ofb from wc_src)),
 ('X-dr-congo',   'DR Congo',   'dr-congo',   'COD', 'CD', null, 'Africa',    'CAF',      'T-88', true, (select ofb from wc_src))
on conflict (team_id) do update set name = excluded.name, slug = excluded.slug, fifa_code = excluded.fifa_code, flag_code = excluded.flag_code,
  country_code = excluded.country_code, region = excluded.region, confederation = excluded.confederation, continues_team_id = excluded.continues_team_id;
update core.soccer_team set country_code = null where country_code is not null and not exists (select 1 from ref.country c where c.country_code = soccer_team.country_code);

-- openfootball's names for the teams (and the spellings the older files use)
create temp table wc_team_alias (alias text primary key, team_id text not null);
insert into wc_team_alias select core.fold_text(name), team_id from core.soccer_team;
insert into wc_team_alias values
 ('usa', 'T-83'), ('united states of america', 'T-83'), ('bosnia herzegovina', 'T-08'), ('cote d ivoire', 'T-42'), ('cote divoire', 'T-42'), ('ir iran', 'T-38'),
 ('korea republic', 'T-71'), ('republic of korea', 'T-71'), ('korea dpr', 'T-51'), ('china pr', 'T-14'), ('ireland', 'T-60'),
 ('czech republic', 'T-20'), ('czechia', 'T-20'), ('dr congo', 'X-dr-congo'), ('turkiye', 'T-80'), ('curacao', 'X-curacao'),
 ('trinidad tobago', 'T-78'), ('dutch east indies', 'T-23'), ('serbia montenegro', 'T-67'), ('yugoslavia', 'T-87'), ('west germany', 'T-86'),
 ('germany fr', 'T-86'), ('germany dr', 'T-24'), ('zaire', 'T-88'), ('soviet union', 'T-72'), ('united arab emirates', 'T-82')
on conflict (alias) do nothing;

-- ---------------------------------------------------------------- tournaments

create temp table wc_t as
select d.data->>'tournament_id' as jf_id,
       case when d.data->>'tournament_name' like '%Women''s%' then 'wwc' else 'wc' end || (d.data->>'year') as tournament_id,
       case when d.data->>'tournament_name' like '%Women''s%' then 'wwc' else 'wc' end as league_code,
       (d.data->>'year')::smallint as year, d.data->>'tournament_name' as name,
       (d.data->>'start_date')::date as start_date, (d.data->>'end_date')::date as end_date, (d.data->>'count_teams')::smallint as team_count
from legacy_worldcup.csv_row d where d.dataset = 'tournaments';

insert into core.soccer_tournament (tournament_id, league_code, year, name, host_names, host_team_ids, start_date, end_date, team_count, source_id)
select t.tournament_id, t.league_code, t.year, t.name,
       coalesce((select array_agg(h.data->>'team_name' order by h.data->>'team_name') from legacy_worldcup.csv_row h
                  where h.dataset = 'host_countries' and h.data->>'tournament_id' = t.jf_id), '{}'),
       coalesce((select array_agg(h.data->>'team_id' order by h.data->>'team_name') from legacy_worldcup.csv_row h
                  where h.dataset = 'host_countries' and h.data->>'tournament_id' = t.jf_id), '{}'),
       t.start_date, t.end_date, t.team_count, (select jf from wc_src)
from wc_t t
on conflict (tournament_id) do update set name = excluded.name, host_names = excluded.host_names, host_team_ids = excluded.host_team_ids,
  start_date = excluded.start_date, end_date = excluded.end_date, team_count = excluded.team_count, source_id = excluded.source_id;

update core.soccer_tournament t set
  winner_team_id    = (select s.data->>'team_id' from legacy_worldcup.csv_row s, wc_t x where s.dataset = 'tournament_standings' and x.tournament_id = t.tournament_id and s.data->>'tournament_id' = x.jf_id and s.data->>'position' = '1'),
  runner_up_team_id = (select s.data->>'team_id' from legacy_worldcup.csv_row s, wc_t x where s.dataset = 'tournament_standings' and x.tournament_id = t.tournament_id and s.data->>'tournament_id' = x.jf_id and s.data->>'position' = '2'),
  third_team_id     = (select s.data->>'team_id' from legacy_worldcup.csv_row s, wc_t x where s.dataset = 'tournament_standings' and x.tournament_id = t.tournament_id and s.data->>'tournament_id' = x.jf_id and s.data->>'position' = '3'),
  fourth_team_id    = (select s.data->>'team_id' from legacy_worldcup.csv_row s, wc_t x where s.dataset = 'tournament_standings' and x.tournament_id = t.tournament_id and s.data->>'tournament_id' = x.jf_id and s.data->>'position' = '4')
where t.source_id = (select jf from wc_src);

-- the 2026 tournament: openfootball only
insert into core.soccer_tournament (tournament_id, league_code, year, name, host_names, host_team_ids, start_date, end_date, team_count, source_id)
select 'wc2026', 'wc', 2026, '2026 FIFA Men''s World Cup', array['Canada', 'Mexico', 'United States'], array['T-12', 'T-46', 'T-83'],
       (select min(match_date) from legacy_worldcup.of_match where year = 2026), (select max(match_date) from legacy_worldcup.of_match where year = 2026), 48,
       (select ofb from wc_src)
where exists (select 1 from legacy_worldcup.of_match where year = 2026)
on conflict (tournament_id) do update set host_names = excluded.host_names, host_team_ids = excluded.host_team_ids, start_date = excluded.start_date,
  end_date = excluded.end_date, team_count = excluded.team_count;

-- ---------------------------------------------------------------- stages

create temp table wc_stage (raw text primary key, stage_key text not null, stage_order smallint not null);
insert into wc_stage values
 ('group stage', 'group', 1), ('first group stage', 'group', 1), ('first round', 'first_round', 1), ('second group stage', 'second_group', 2),
 ('final round', 'final_round', 3), ('round of 32', 'round_of_32', 4), ('round of 16', 'round_of_16', 5),
 ('quarter-finals', 'quarter', 6), ('quarter-final', 'quarter', 6), ('semi-finals', 'semi', 7), ('semi-final', 'semi', 7),
 ('third-place match', 'third_place', 8), ('final', 'final', 9);

-- ---------------------------------------------------------------- the tournaments' teams and group tables (jfjelstul)

insert into core.soccer_tournament_team (tournament_id, team_id, performance, is_host)
select t.tournament_id, q.data->>'team_id', q.data->>'performance',
       exists (select 1 from legacy_worldcup.csv_row h where h.dataset = 'host_countries' and h.data->>'tournament_id' = t.jf_id and h.data->>'team_id' = q.data->>'team_id')
from legacy_worldcup.csv_row q join wc_t t on t.jf_id = q.data->>'tournament_id'
where q.dataset = 'qualified_teams'
on conflict (tournament_id, team_id) do update set performance = excluded.performance, is_host = excluded.is_host;

update core.soccer_tournament_team tt set final_position = (s.data->>'position')::smallint
from legacy_worldcup.csv_row s join wc_t t on t.jf_id = s.data->>'tournament_id'
where s.dataset = 'tournament_standings' and tt.tournament_id = t.tournament_id and tt.team_id = s.data->>'team_id';

delete from core.soccer_group_standing where tournament_id in (select tournament_id from wc_t);
insert into core.soccer_group_standing (tournament_id, stage_number, stage_key, group_name, position, team_id, played, wins, draws, losses,
                                        goals_for, goals_against, goal_difference, points, advanced)
select t.tournament_id, (g.data->>'stage_number')::smallint, st.stage_key, g.data->>'group_name', (g.data->>'position')::smallint, g.data->>'team_id',
       (g.data->>'played')::smallint, (g.data->>'wins')::smallint, (g.data->>'draws')::smallint, (g.data->>'losses')::smallint,
       (g.data->>'goals_for')::smallint, (g.data->>'goals_against')::smallint, (g.data->>'goal_difference')::smallint, (g.data->>'points')::smallint,
       g.data->>'advanced' = '1'
from legacy_worldcup.csv_row g join wc_t t on t.jf_id = g.data->>'tournament_id'
join wc_stage st on st.raw = g.data->>'stage_name'
where g.dataset = 'group_standings';

-- ---------------------------------------------------------------- venues as the source gives them (names only)

create temp table wc_stadium as
select s.data->>'stadium_id' as stadium_id,
       (select w.qid from legacy_worldcup.wikipedia_item w where w.url = s.data->>'stadium_wikipedia_link') as qid
from legacy_worldcup.csv_row s where s.dataset = 'stadiums';

-- ---------------------------------------------------------------- matches (jfjelstul)

insert into core.soccer_match (source_key, tournament_id, stage_key, stage_order, group_name, match_number, match_date, kickoff_local,
                               home_team_id, away_team_id, home_goals, away_goals, extra_time, shootout, home_penalties, away_penalties,
                               winner_team_id, is_replay, venue_name, venue_city, venue_country, venue_wikidata_id, source_id)
select m.data->>'match_id', t.tournament_id, st.stage_key, st.stage_order, nullif(m.data->>'group_name', 'not applicable'),
       nullif(regexp_replace(m.data->>'match_id', '^.*-', ''), '')::smallint,
       (m.data->>'match_date')::date, case when m.data->>'match_time' ~ '^\d\d:\d\d$' then (m.data->>'match_time')::time end,
       m.data->>'home_team_id', m.data->>'away_team_id', (m.data->>'home_team_score')::smallint, (m.data->>'away_team_score')::smallint,
       m.data->>'extra_time' = '1', m.data->>'penalty_shootout' = '1',
       case when m.data->>'penalty_shootout' = '1' then (m.data->>'home_team_score_penalties')::smallint end,
       case when m.data->>'penalty_shootout' = '1' then (m.data->>'away_team_score_penalties')::smallint end,
       case m.data->>'result' when 'home team win' then m.data->>'home_team_id' when 'away team win' then m.data->>'away_team_id' end,
       m.data->>'replay' = '1', m.data->>'stadium_name', m.data->>'city_name', m.data->>'country_name',
       (select s.qid from wc_stadium s where s.stadium_id = m.data->>'stadium_id'), (select jf from wc_src)
from legacy_worldcup.csv_row m join wc_t t on t.jf_id = m.data->>'tournament_id'
join wc_stage st on st.raw = m.data->>'stage_name'
where m.dataset = 'matches'
on conflict (source_key) do update set tournament_id = excluded.tournament_id, stage_key = excluded.stage_key, stage_order = excluded.stage_order,
  group_name = excluded.group_name, match_number = excluded.match_number, match_date = excluded.match_date, kickoff_local = excluded.kickoff_local,
  home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id, home_goals = excluded.home_goals, away_goals = excluded.away_goals,
  extra_time = excluded.extra_time, shootout = excluded.shootout, home_penalties = excluded.home_penalties, away_penalties = excluded.away_penalties,
  winner_team_id = excluded.winner_team_id, is_replay = excluded.is_replay, venue_name = excluded.venue_name, venue_city = excluded.venue_city,
  venue_country = excluded.venue_country, venue_wikidata_id = excluded.venue_wikidata_id, source_id = excluded.source_id;

-- ---------------------------------------------------------------- people

create temp table wc_person_src as
select d.data->>'player_id' as jf_key, 'player' as kind,
       nullif(d.data->>'given_name', 'not applicable') as given, d.data->>'family_name' as family,
       case when d.data->>'birth_date' ~ '^\d{4}-\d\d-\d\d$' then (d.data->>'birth_date')::date end as birth_date,
       (select w.qid from legacy_worldcup.wikipedia_item w where w.url = d.data->>'player_wikipedia_link') as qid
from legacy_worldcup.csv_row d where d.dataset = 'players'
union all
select d.data->>'manager_id', 'coach', nullif(d.data->>'given_name', 'not applicable'), d.data->>'family_name', null,
       (select w.qid from legacy_worldcup.wikipedia_item w where w.url = d.data->>'manager_wikipedia_link')
from legacy_worldcup.csv_row d where d.dataset = 'managers'
union all
select d.data->>'referee_id', 'official', nullif(d.data->>'given_name', 'not applicable'), d.data->>'family_name', null,
       (select w.qid from legacy_worldcup.wikipedia_item w where w.url = d.data->>'referee_wikipedia_link')
from legacy_worldcup.csv_row d where d.dataset = 'referees';
alter table wc_person_src add column full_name text;
update wc_person_src set full_name = btrim(coalesce(given || ' ', '') || family);

create temp table wc_person_map (jf_key text primary key, person_id bigint not null, how text not null);
-- already linked by an earlier run
insert into wc_person_map select e.external_key, e.entity_id, 'linked'
from core.external_id e join core.person p on p.person_id = e.entity_id
where e.source_id = (select jf from wc_src) and e.entity_kind = 'person';

-- confirming fact 1: the same Wikidata item
create temp table wc_cand as
select s.jf_key, e.entity_id as person_id, 'wikidata' as how
from wc_person_src s join core.external_id e on e.source_id = (select wd from wc_src) and e.entity_kind = 'person' and e.external_key = s.qid
where s.qid is not null and s.jf_key not in (select jf_key from wc_person_map)
  and e.entity_id not in (select person_id from wc_person_map);
-- confirming fact 2: the same birth date and the same name (players only; a person with that date and name who is not already ours)
insert into wc_cand
select s.jf_key, p.person_id, 'birth date and name'
from wc_person_src s join core.person p on p.birth_date = s.birth_date and core.fold_text(p.full_name) = core.fold_text(s.full_name)
where s.kind = 'player' and s.birth_date is not null and s.jf_key not in (select jf_key from wc_person_map)
  and p.source_id is distinct from (select jf from wc_src)
  and p.person_id not in (select person_id from wc_person_map)
  and not exists (select 1 from wc_cand c where c.jf_key = s.jf_key);
-- only unambiguous matches: one candidate for the player and one player for the candidate
insert into wc_person_map select c.jf_key, c.person_id, c.how from wc_cand c
where (select count(*) from wc_cand x where x.jf_key = c.jf_key) = 1 and (select count(*) from wc_cand x where x.person_id = c.person_id) = 1;

-- everyone else is a new person
create temp table wc_new as
select s.jf_key, s.kind, s.given, s.family, s.full_name, s.birth_date,
       nextval(pg_get_serial_sequence('core.person', 'person_id')) as person_id
from wc_person_src s where s.jf_key not in (select jf_key from wc_person_map);
insert into core.person (person_id, full_name, given_name, family_name, birth_date, kind, source_id)
overriding system value
select person_id, full_name, given, family, birth_date, kind, (select jf from wc_src) from wc_new;
insert into wc_person_map select jf_key, person_id, 'new' from wc_new;

-- the jfjelstul id of everyone, and the Wikidata item where the Wikipedia link gave one
insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'person', person_id, (select jf from wc_src), jf_key from wc_person_map
on conflict (source_id, entity_kind, external_key) do nothing;
insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'person', m.person_id, (select wd from wc_src), s.qid
from wc_person_src s join wc_person_map m using (jf_key)
where s.qid is not null
on conflict (source_id, entity_kind, external_key) do nothing;
-- a person this source created keeps following the source (a corrected name or birth date); anyone it only matched is left as it was
update core.person p set full_name = s.full_name, given_name = s.given, family_name = s.family, birth_date = s.birth_date, updated_at = now()
from wc_person_src s join wc_person_map m using (jf_key)
where p.person_id = m.person_id and p.source_id = (select jf from wc_src) and m.how <> 'new'
  and (p.full_name, p.given_name, p.family_name, p.birth_date) is distinct from (s.full_name, s.given, s.family, s.birth_date);

-- ---------------------------------------------------------------- lineups, goals, cards, substitutions, shootouts (jfjelstul)

delete from core.soccer_appearance a using core.soccer_match m where a.match_id = m.match_id and m.source_id = (select jf from wc_src);
insert into core.soccer_appearance (match_id, person_id, team_id, shirt_number, position_name, position_code, starter, substitute)
select m.match_id, pm.person_id, d.data->>'team_id', nullif(d.data->>'shirt_number', '')::smallint, d.data->>'position_name', d.data->>'position_code',
       d.data->>'starter' = '1', d.data->>'substitute' = '1'
from legacy_worldcup.csv_row d
join core.soccer_match m on m.source_key = d.data->>'match_id'
join wc_person_map pm on pm.jf_key = d.data->>'player_id'
where d.dataset = 'player_appearances';

delete from core.soccer_goal g using core.soccer_match m where g.match_id = m.match_id and m.source_id = (select jf from wc_src);
insert into core.soccer_goal (goal_id, match_id, team_id, person_id, scorer_name, shirt_number, minute_label, minute, stoppage, period, own_goal, penalty)
select d.data->>'goal_id', m.match_id, d.data->>'team_id', pm.person_id, btrim(coalesce(nullif(d.data->>'given_name', 'not applicable') || ' ', '') || (d.data->>'family_name')),
       nullif(d.data->>'shirt_number', '')::smallint, d.data->>'minute_label', (d.data->>'minute_regulation')::smallint, (d.data->>'minute_stoppage')::smallint,
       d.data->>'match_period', d.data->>'own_goal' = '1', d.data->>'penalty' = '1'
from legacy_worldcup.csv_row d
join core.soccer_match m on m.source_key = d.data->>'match_id'
join wc_person_map pm on pm.jf_key = d.data->>'player_id'
where d.dataset = 'goals';

delete from core.soccer_booking b using core.soccer_match m where b.match_id = m.match_id;
insert into core.soccer_booking (booking_id, match_id, team_id, person_id, shirt_number, minute_label, minute, stoppage, period, yellow_card, red_card, second_yellow, sending_off)
select d.data->>'booking_id', m.match_id, d.data->>'team_id', pm.person_id, nullif(d.data->>'shirt_number', '')::smallint, d.data->>'minute_label',
       (d.data->>'minute_regulation')::smallint, (d.data->>'minute_stoppage')::smallint, d.data->>'match_period',
       d.data->>'yellow_card' = '1', d.data->>'red_card' = '1', d.data->>'second_yellow_card' = '1', d.data->>'sending_off' = '1'
from legacy_worldcup.csv_row d
join core.soccer_match m on m.source_key = d.data->>'match_id'
join wc_person_map pm on pm.jf_key = d.data->>'player_id'
where d.dataset = 'bookings';

delete from core.soccer_substitution s using core.soccer_match m where s.match_id = m.match_id;
insert into core.soccer_substitution (substitution_id, match_id, team_id, person_id, shirt_number, minute_label, minute, stoppage, period, going_off, coming_on)
select d.data->>'substitution_id', m.match_id, d.data->>'team_id', pm.person_id, nullif(d.data->>'shirt_number', '')::smallint, d.data->>'minute_label',
       (d.data->>'minute_regulation')::smallint, (d.data->>'minute_stoppage')::smallint, d.data->>'match_period',
       d.data->>'going_off' = '1', d.data->>'coming_on' = '1'
from legacy_worldcup.csv_row d
join core.soccer_match m on m.source_key = d.data->>'match_id'
join wc_person_map pm on pm.jf_key = d.data->>'player_id'
where d.dataset = 'substitutions';

delete from core.soccer_penalty_kick k using core.soccer_match m where k.match_id = m.match_id;
insert into core.soccer_penalty_kick (kick_id, match_id, team_id, person_id, shirt_number, converted)
select d.data->>'penalty_kick_id', m.match_id, d.data->>'team_id', pm.person_id, nullif(d.data->>'shirt_number', '')::smallint, d.data->>'converted' = '1'
from legacy_worldcup.csv_row d
join core.soccer_match m on m.source_key = d.data->>'match_id'
join wc_person_map pm on pm.jf_key = d.data->>'player_id'
where d.dataset = 'penalty_kicks';

-- the score after 90 minutes for a match that went to extra time, from the goals' periods (only where every goal is on record)
update core.soccer_match m set
  home_goals_90 = (select count(*) from core.soccer_goal g where g.match_id = m.match_id and g.team_id = m.home_team_id and g.period not like 'extra time%'),
  away_goals_90 = (select count(*) from core.soccer_goal g where g.match_id = m.match_id and g.team_id = m.away_team_id and g.period not like 'extra time%')
where m.extra_time and m.source_id = (select jf from wc_src)
  and (select count(*) from core.soccer_goal g where g.match_id = m.match_id) = m.home_goals + m.away_goals;

-- ---------------------------------------------------------------- squads, managers, referees, awards

delete from core.soccer_squad where tournament_id in (select tournament_id from wc_t);
insert into core.soccer_squad (tournament_id, team_id, person_id, shirt_number, position_name, position_code)
select t.tournament_id, d.data->>'team_id', pm.person_id, nullif(d.data->>'shirt_number', '')::smallint, d.data->>'position_name', d.data->>'position_code'
from legacy_worldcup.csv_row d join wc_t t on t.jf_id = d.data->>'tournament_id'
join wc_person_map pm on pm.jf_key = d.data->>'player_id'
where d.dataset = 'squads'
on conflict do nothing;

delete from core.soccer_manager where tournament_id in (select tournament_id from wc_t);
insert into core.soccer_manager (tournament_id, team_id, person_id)
select t.tournament_id, d.data->>'team_id', pm.person_id
from legacy_worldcup.csv_row d join wc_t t on t.jf_id = d.data->>'tournament_id'
join wc_person_map pm on pm.jf_key = d.data->>'manager_id'
where d.dataset = 'manager_appointments'
on conflict do nothing;

delete from core.soccer_match_manager x using core.soccer_match m where x.match_id = m.match_id and m.source_id = (select jf from wc_src);
insert into core.soccer_match_manager (match_id, team_id, person_id, country_name)
select m.match_id, d.data->>'team_id', pm.person_id, d.data->>'country_name'
from legacy_worldcup.csv_row d join core.soccer_match m on m.source_key = d.data->>'match_id'
join wc_person_map pm on pm.jf_key = d.data->>'manager_id'
where d.dataset = 'manager_appearances'
on conflict do nothing;

delete from core.soccer_match_referee x using core.soccer_match m where x.match_id = m.match_id and m.source_id = (select jf from wc_src);
insert into core.soccer_match_referee (match_id, person_id, country_name)
select m.match_id, pm.person_id, d.data->>'country_name'
from legacy_worldcup.csv_row d join core.soccer_match m on m.source_key = d.data->>'match_id'
join wc_person_map pm on pm.jf_key = d.data->>'referee_id'
where d.dataset = 'referee_appearances'
on conflict do nothing;

delete from core.soccer_award where tournament_id in (select tournament_id from wc_t);
insert into core.soccer_award (tournament_id, award, award_order, person_id, team_id, shared)
select t.tournament_id, d.data->>'award_name', substring(d.data->>'award_id' from '\d+$')::smallint, pm.person_id, d.data->>'team_id', d.data->>'shared' = '1'
from legacy_worldcup.csv_row d join wc_t t on t.jf_id = d.data->>'tournament_id'
join wc_person_map pm on pm.jf_key = d.data->>'player_id'
where d.dataset = 'award_winners'
on conflict do nothing;

-- ---------------------------------------------------------------- 2026 (openfootball only)

create temp table wc_of26 as
select m.seq, 'of-2026-' || lpad(m.seq::text, 3, '0') as source_key,
       (select team_id from wc_team_alias where alias = core.fold_text(m.team1)) as t1, (select team_id from wc_team_alias where alias = core.fold_text(m.team2)) as t2,
       st.stage_key, st.stage_order, m.group_name, m.match_number, m.match_date, m.kickoff, m.utc_offset,
       m.score1, m.score2, m.aet, m.pens1, m.pens2,
       case when m.aet and m.halftime like '%,%' then split_part(split_part(m.halftime, ',', 1), '-', 1)::smallint end as s90_1,
       case when m.aet and m.halftime like '%,%' then split_part(split_part(m.halftime, ',', 1), '-', 2)::smallint end as s90_2,
       m.venue
from legacy_worldcup.of_match m
join wc_stage st on st.raw = case
  when lower(m.stage) like 'group%' then 'group stage' when lower(m.stage) like '%round of 32%' then 'round of 32'
  when lower(m.stage) like '%round of 16%' then 'round of 16' when lower(m.stage) like 'quarter%' then 'quarter-finals'
  when lower(m.stage) like 'semi%' then 'semi-finals' when lower(m.stage) like '%third%' then 'third-place match' when lower(m.stage) = 'final' then 'final' end
where m.year = 2026;

insert into core.soccer_match (source_key, tournament_id, stage_key, stage_order, group_name, match_number, match_date, kickoff_local, utc_offset,
                               home_team_id, away_team_id, home_goals, away_goals, home_goals_90, away_goals_90, extra_time, shootout,
                               home_penalties, away_penalties, winner_team_id, venue_name, venue_city, venue_country, venue_wikidata_id, source_id)
select o.source_key, 'wc2026', o.stage_key, o.stage_order, o.group_name, o.match_number, o.match_date, o.kickoff, o.utc_offset,
       o.t1, o.t2, o.score1, o.score2, o.s90_1, o.s90_2, o.aet, o.pens1 is not null, o.pens1, o.pens2,
       case when o.score1 > o.score2 then o.t1 when o.score1 < o.score2 then o.t2 when o.pens1 > o.pens2 then o.t1 when o.pens1 < o.pens2 then o.t2 end,
       sd.name, sd.city, case sd.cc when 'ca' then 'Canada' when 'us' then 'United States' when 'mx' then 'Mexico' end, sd.wikidata, (select ofb from wc_src)
from wc_of26 o
left join legacy_worldcup.of_stadium sd on sd.year = 2026 and sd.city = o.venue
where o.t1 is not null and o.t2 is not null
on conflict (source_key) do update set stage_key = excluded.stage_key, stage_order = excluded.stage_order, group_name = excluded.group_name,
  match_number = excluded.match_number, match_date = excluded.match_date, kickoff_local = excluded.kickoff_local, utc_offset = excluded.utc_offset,
  home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id, home_goals = excluded.home_goals, away_goals = excluded.away_goals,
  home_goals_90 = excluded.home_goals_90, away_goals_90 = excluded.away_goals_90, extra_time = excluded.extra_time, shootout = excluded.shootout,
  home_penalties = excluded.home_penalties, away_penalties = excluded.away_penalties, winner_team_id = excluded.winner_team_id,
  venue_name = excluded.venue_name, venue_city = excluded.venue_city, venue_country = excluded.venue_country, venue_wikidata_id = excluded.venue_wikidata_id;

-- 2026 goals: scorers by name (the file has no player ids), the side credited
delete from core.soccer_goal g using core.soccer_match m where g.match_id = m.match_id and m.source_id = (select ofb from wc_src);
insert into core.soccer_goal (goal_id, match_id, team_id, person_id, scorer_name, minute_label, minute, stoppage, period, own_goal, penalty)
select m.source_key || '-' || g.n, m.match_id, case g.side when 'home' then m.home_team_id else m.away_team_id end, null, g.scorer,
       g.minute || '''', split_part(g.minute, '+', 1)::smallint, coalesce(nullif(split_part(g.minute, '+', 2), '')::smallint, 0),
       case when split_part(g.minute, '+', 1)::int > 90 then 'extra time' when split_part(g.minute, '+', 1)::int > 45 then 'second half' else 'first half' end,
       g.kind = 'og', g.kind = 'pen'
from legacy_worldcup.of_goal g
join core.soccer_match m on m.source_key = 'of-2026-' || lpad(g.seq::text, 3, '0')
where g.year = 2026 and g.scorer is not null;

-- 2026 tournament result and the teams' path (the furthest stage each reached), and the group tables
update core.soccer_tournament t set
  winner_team_id    = (select winner_team_id from core.soccer_match where tournament_id = 'wc2026' and stage_key = 'final'),
  runner_up_team_id = (select case when winner_team_id = home_team_id then away_team_id else home_team_id end from core.soccer_match where tournament_id = 'wc2026' and stage_key = 'final'),
  third_team_id     = (select winner_team_id from core.soccer_match where tournament_id = 'wc2026' and stage_key = 'third_place'),
  fourth_team_id    = (select case when winner_team_id = home_team_id then away_team_id else home_team_id end from core.soccer_match where tournament_id = 'wc2026' and stage_key = 'third_place')
where t.tournament_id = 'wc2026';

insert into core.soccer_tournament_team (tournament_id, team_id, performance, is_host, final_position)
select 'wc2026', p.team_id,
       case p.top when 9 then 'final' when 8 then 'third-place match' when 7 then 'semi-finals' when 6 then 'quarter-finals' when 5 then 'round of 16'
            when 4 then 'round of 32' else 'group stage' end,
       p.team_id in ('T-12', 'T-46', 'T-83'),
       case p.team_id when t.winner_team_id then 1 when t.runner_up_team_id then 2 when t.third_team_id then 3 when t.fourth_team_id then 4 end
from (select team_id, max(stage_order) as top from (
        select home_team_id as team_id, stage_order from core.soccer_match where tournament_id = 'wc2026'
        union all select away_team_id, stage_order from core.soccer_match where tournament_id = 'wc2026') x group by team_id) p,
     core.soccer_tournament t
where t.tournament_id = 'wc2026'
on conflict (tournament_id, team_id) do update set performance = excluded.performance, is_host = excluded.is_host, final_position = excluded.final_position;
-- a team that played the semi-final but neither won the final nor the third place game cannot exist; the third-place players are 'semi-finals' by stage 8 -> 'third-place match'

delete from core.soccer_group_standing where tournament_id = 'wc2026';
insert into core.soccer_group_standing (tournament_id, stage_number, stage_key, group_name, position, team_id, played, wins, draws, losses,
                                        goals_for, goals_against, goal_difference, points, advanced)
select 'wc2026', 1, 'group', r.group_name, row_number() over (partition by r.group_name order by r.points desc, r.gd desc, r.gf desc, r.team_id),
       r.team_id, r.played, r.w, r.d, r.l, r.gf, r.ga, r.gd, r.points,
       exists (select 1 from core.soccer_match k where k.tournament_id = 'wc2026' and k.stage_order > 1 and r.team_id in (k.home_team_id, k.away_team_id))
from (select s.group_name, s.team_id, count(*)::smallint as played,
             count(*) filter (where s.gf > s.ga)::smallint as w, count(*) filter (where s.gf = s.ga)::smallint as d, count(*) filter (where s.gf < s.ga)::smallint as l,
             sum(s.gf)::smallint as gf, sum(s.ga)::smallint as ga, (sum(s.gf) - sum(s.ga))::smallint as gd,
             (3 * count(*) filter (where s.gf > s.ga) + count(*) filter (where s.gf = s.ga))::smallint as points
      from (select m.group_name, m.home_team_id as team_id, m.home_goals as gf, m.away_goals as ga from core.soccer_match m where m.tournament_id = 'wc2026' and m.stage_key = 'group'
            union all select m.group_name, m.away_team_id, m.away_goals, m.home_goals from core.soccer_match m where m.tournament_id = 'wc2026' and m.stage_key = 'group') s
      group by s.group_name, s.team_id) r;

-- ---------------------------------------------------------------- nationality of the people the source created

update core.person p set nationality_code = x.cc
from (select distinct on (q.person_id) q.person_id, t.country_code as cc
      from core.soccer_squad q join core.soccer_team t using (team_id)
      where t.country_code is not null
      group by q.person_id, t.country_code order by q.person_id, count(*) desc, t.country_code) x
where p.person_id = x.person_id and p.source_id = (select jf from wc_src) and p.nationality_code is null;

-- ---------------------------------------------------------------- second check: openfootball against jfjelstul, men's 1930-2022

create temp table wc_check as
select m.match_id, m.source_key, t.year, m.match_date, m.home_goals, m.away_goals, m.extra_time, m.shootout, m.home_penalties, m.away_penalties,
       m.home_team_id, m.away_team_id,
       o.seq, o.match_date as o_date, o.aet as o_aet,
       case when o.t1 = m.home_team_id then o.score1 else o.score2 end as o_home, case when o.t1 = m.home_team_id then o.score2 else o.score1 end as o_away,
       case when o.t1 = m.home_team_id then o.pens1 else o.pens2 end as o_pens_home, case when o.t1 = m.home_team_id then o.pens2 else o.pens1 end as o_pens_away
from core.soccer_match m join core.soccer_tournament t using (tournament_id)
left join lateral (
  select om.seq, om.match_date, om.aet, om.score1, om.score2, om.pens1, om.pens2,
         (select team_id from wc_team_alias where alias = core.fold_text(om.team1)) as t1, (select team_id from wc_team_alias where alias = core.fold_text(om.team2)) as t2
  from legacy_worldcup.of_match om where om.year = t.year) o
  on ((o.t1 = m.home_team_id and o.t2 = m.away_team_id) or (o.t1 = m.away_team_id and o.t2 = m.home_team_id))
where t.league_code = 'wc' and t.year < 2026 and m.source_id = (select jf from wc_src);
-- when a pair met twice in a tournament take the closest date
delete from wc_check c where c.seq is not null and exists (
  select 1 from wc_check d where d.match_id = c.match_id and d.seq is not null and d.seq <> c.seq
    and (abs(d.o_date - d.match_date), d.seq) < (abs(c.o_date - c.match_date), c.seq));

delete from meta.verification where entity_kind = 'soccer_match' and source_id = (select ofb from wc_src);
insert into meta.verification (entity_kind, entity_id, field, status, source_id, evidence_url, their_value)
select 'soccer_match', c.match_id, '*',
       case when c.seq is null then 'not_found'::meta.verification_status
            when c.o_date = c.match_date and c.o_home = c.home_goals and c.o_away = c.away_goals
                 and coalesce(c.o_pens_home, -1) = coalesce(c.home_penalties, -1) and coalesce(c.o_pens_away, -1) = coalesce(c.away_penalties, -1) then 'confirmed'
            else 'disputed' end,
       (select ofb from wc_src), 'https://github.com/openfootball/worldcup',
       case when c.seq is not null then c.o_date || ' ' || c.o_home || '-' || c.o_away || case when c.o_aet then ' a.e.t.' else '' end
              || case when c.o_pens_home is not null then ' ' || c.o_pens_home || '-' || c.o_pens_away || ' pens' else '' end end
from wc_check c;

delete from meta.data_issue where entity_kind = 'soccer_match' and source_id = (select ofb from wc_src);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select ofb from wc_src), 'soccer_match', c.source_key,
       'openfootball has ' || c.o_date || ' ' || c.o_home || '-' || c.o_away || case when c.o_pens_home is not null then ' (pens ' || c.o_pens_home || '-' || c.o_pens_away || ')' else '' end
       || ' for ' || c.year || ' match ' || c.source_key || '; jfjelstul has ' || c.match_date || ' ' || c.home_goals || '-' || c.away_goals
       || case when c.home_penalties is not null then ' (pens ' || c.home_penalties || '-' || c.away_penalties || ')' else '' end,
       'kept the jfjelstul value'
from wc_check c
where c.seq is not null and not (c.o_date = c.match_date and c.o_home = c.home_goals and c.o_away = c.away_goals
      and coalesce(c.o_pens_home, -1) = coalesce(c.home_penalties, -1) and coalesce(c.o_pens_away, -1) = coalesce(c.away_penalties, -1));

-- ---------------------------------------------------------------- report (the build prints these lines)

select 'soccer_team' as what, count(*) from core.soccer_team
union all select 'soccer_tournament', count(*) from core.soccer_tournament
union all select 'soccer_match', count(*) from core.soccer_match
union all select 'soccer_appearance', count(*) from core.soccer_appearance
union all select 'soccer_goal', count(*) from core.soccer_goal
union all select 'soccer_booking', count(*) from core.soccer_booking
union all select 'soccer_substitution', count(*) from core.soccer_substitution
union all select 'soccer_squad', count(*) from core.soccer_squad
union all select 'persons new', count(*) from wc_person_map where how = 'new'
union all select 'persons matched to an existing person', count(*) from wc_person_map where how in ('wikidata', 'birth date and name')
union all select 'second check ' || status::text, count(*) from meta.verification where entity_kind = 'soccer_match' group by status;

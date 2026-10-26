-- European club soccer from openfootball (legacy_openfootball, made by scripts/openfootball_eu/load.py; migration 139 and step 220 first). CC0.
-- Run from the repo root (it reads db/seed/soccer_club_eu.csv and db/seed/soccer_league_eu.csv). Runs after 220 and before the last step. Rerunnable, ids kept:
--   clubs     core.soccer_team: a club is one row per (country pyramid, club) of soccer_club_eu.csv, whatever the file spells (Arsenal / Arsenal FC). The row is
--             found again by source_key 'eu:<system>:<club>'; a club SPX already gave a row (step 220, source_key spx:team:N) keeps that row and its id, and
--             takes the seed's name; otherwise team_id = 'C-' + slug of the name.
--   seasons   core.soccer_tournament.tournament_id = league code + start year (premier_league2005), as step 220 does
--   members   core.soccer_tournament_team: the clubs with a regular-season match in the file, in EVERY division the seed lists, so promotion and relegation
--             (api.soccer_club_moves) can be read across the pyramid
--   matches   core.soccer_match.source_key = eu-<yyyymmdd>-<home team_id>-<away team_id>, only for the divisions whose `matches` flag is 1 in
--             soccer_league_eu.csv (production is on the 500 MB plan: a match row is about 0.7 KB with its indexes, so lower divisions stay raw in
--             legacy_openfootball until there is room; flip the flag to 1 and rerun to build one)
-- SPX wins where it holds a value (step 220): a fixture SPX already has (same season, home club and away club, regular season) is not added again whatever
-- its date; openfootball writes meta.verification (confirmed / disputed / not_found) for it, a disagreement is a meta.data_issue, and the SPX row stays.
-- A season is complete (core.soccer_tournament.complete) when its regular-season matches number clubs * (clubs - 1). Promotion play-offs are stage_key
-- playoff / semi / final, attached to the division whose file lists them, and never make a club a member of that division.
-- Does not touch core.game, core.team_season, core.franchise or any venue table. A name with no row in the club seed stops the step with the names listed.
begin;

drop table if exists ofb_src, ofb_alias_raw, ofb_alias, ofb_lgrow, ofb_lg, ofb_unmapped, ofb_m0, ofb_club, ofb_season, ofb_member, ofb_m, ofb_spx, ofb_ins, ofb_cnt;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, covers_to, retrieved_on, notes) values
 ('openfootball_europe', 'openfootball: English, German, Spanish, Italian and French club leagues', 'dataset', 'CC0 1.0',
  'openfootball contributors (public domain)',
  'https://github.com/openfootball', '1992-08-15', '2027-05-31', '2026-10-25',
  'Football.TXT files of the england (Premier League from 1992-93, the lower divisions from 1998-99), deutschland (2010-11 on), espana (2012-13 on), italy (2013-14 on) and europe/france (2014-15 on) repositories: date, score, half-time, extra time and shootout of every match. No venue, no table, no lineups. The commit ids are in the raw folder''s MANIFEST.json and legacy_openfootball.eu_file.')
on conflict (code) do update set name = excluded.name, kind = excluded.kind, licence = excluded.licence, attribution = excluded.attribution,
  url = excluded.url, covers_from = excluded.covers_from, covers_to = excluded.covers_to, retrieved_on = excluded.retrieved_on, notes = excluded.notes;

insert into ref.sport (sport_code, name) values ('soccer', 'Soccer') on conflict (sport_code) do nothing;

create temp table ofb_src as select (select source_id from meta.source where code = 'openfootball_europe') as ofb,
                                    (select source_id from meta.source where code = 'spx_database') as spx;

-- ---------------------------------------------------------------- the seeds

create temp table ofb_alias_raw (system_key text, alias text, club text, source text);
\copy ofb_alias_raw from 'db/seed/soccer_club_eu.csv' with (format csv, header true)
create temp table ofb_alias as select distinct system_key, alias, club from ofb_alias_raw;
create temp table ofb_lgrow (league_code text, system_key text, country_code text, tier smallint, from_year int, to_year int, name text, short_name text, matches smallint);
\copy ofb_lgrow from 'db/seed/soccer_league_eu.csv' with (format csv, header true)
-- one row per division: its current name, the country
create temp table ofb_lg as
select distinct on (system_key, tier) league_code, system_key, country_code, tier, name, short_name, matches = 1 as matches_built
from ofb_lgrow order by system_key, tier, to_year desc;

do $$
begin
  if exists (select 1 from ofb_alias group by system_key, alias having count(*) > 1) then
    raise exception 'soccer_club_eu.csv gives one name two clubs: %',
      (select string_agg(system_key || ':' || alias, '; ') from (select system_key, alias from ofb_alias group by 1, 2 having count(*) > 1) x);
  end if;
end $$;

-- every played match with its two clubs; a name with no seed row stops the step
create temp table ofb_unmapped as
select distinct n.system_key, n.name
from (select system_key, team1 as name from legacy_openfootball.eu_match union select system_key, team2 from legacy_openfootball.eu_match) n
where not exists (select 1 from ofb_alias a where a.system_key = n.system_key and a.alias = n.name);
do $$
begin
  if exists (select 1 from ofb_unmapped) then
    raise exception 'openfootball names with no row in db/seed/soccer_club_eu.csv: %', (select string_agg(system_key || ': ' || name, '; ' order by system_key, name) from ofb_unmapped);
  end if;
  if exists (select 1 from legacy_openfootball.eu_file f where not exists (select 1 from ofb_lg g where g.system_key = f.system_key and g.tier = f.tier)) then
    raise exception 'openfootball files of a division with no row in db/seed/soccer_league_eu.csv';
  end if;
end $$;

create temp table ofb_m0 as
select m.system_key, m.tier, m.season, m.seq, m.stage, m.match_date, m.kickoff, g.league_code, g.matches_built, g.league_code || m.season as tid,
       ha.club as hclub, aa.club as aclub, m.score1, m.score2, m.aet, m.pens1, m.pens2, m.s90_1, m.s90_2, m.tag,
       case when m.stage ~ '^(Matchday|Regular|[0-9]+\. Round|Spieltag)' then 'regular'
            when m.stage ~* 'semi' then 'semi'
            when m.stage ~* 'final' then 'final'
            else 'playoff' end as stage_key
from legacy_openfootball.eu_match m
join ofb_lg g on g.system_key = m.system_key and g.tier = m.tier
join ofb_alias ha on ha.system_key = m.system_key and ha.alias = m.team1
join ofb_alias aa on aa.system_key = m.system_key and aa.alias = m.team2
where m.score1 is not null and m.score2 is not null;

-- ---------------------------------------------------------------- leagues

insert into ref.league (league_code, sport_code, country_code, notes)
select g.league_code, 'soccer', g.country_code, 'Tier ' || g.tier || ' of the ' || g.system_key || ' pyramid'
from ofb_lg g where exists (select 1 from legacy_openfootball.eu_file f where f.system_key = g.system_key and f.tier = g.tier)
on conflict (league_code) do update set sport_code = excluded.sport_code, country_code = excluded.country_code, notes = excluded.notes;

insert into ref.league_name (league_code, valid_during, name, short_name)
select g.league_code, '(,)', g.name, g.short_name
from ofb_lg g where exists (select 1 from legacy_openfootball.eu_file f where f.system_key = g.system_key and f.tier = g.tier)
on conflict (league_code, valid_during) do update set name = excluded.name, short_name = excluded.short_name;

insert into ref.soccer_league_system (league_code, system_key, country_code, tier)
select g.league_code, g.system_key, g.country_code, g.tier
from ofb_lg g where exists (select 1 from legacy_openfootball.eu_file f where f.system_key = g.system_key and f.tier = g.tier)
on conflict (league_code) do update set system_key = excluded.system_key, country_code = excluded.country_code, tier = excluded.tier;

-- ---------------------------------------------------------------- clubs

create temp table ofb_club as
with u as (
  select distinct system_key, hclub as club from ofb_m0 union select distinct system_key, aclub from ofb_m0
), c as (
  select u.system_key, u.club, 'eu:' || u.system_key || ':' || replace(core.fold_text(u.club), ' ', '-') as skey,
         (select min(g.country_code) from ofb_lg g where g.system_key = u.system_key) as cc,
         replace(core.fold_text(u.club), ' ', '-') as base
  from u
), h as (
  select c.*,
         coalesce((select min(t.team_id) from core.soccer_team t where t.source_key = c.skey),
                  (select min(t.team_id) from core.soccer_team t
                    where t.source_id = (select spx from ofb_src) and t.kind = 'club'
                      and (t.name = c.club or t.name in (select a.alias from ofb_alias_raw a where a.system_key = c.system_key and a.club = c.club and a.source = 'spx')))) as have_id
  from c
), d as (
  select h.*, count(*) over (partition by base) as dup,
         exists (select 1 from core.soccer_team x where x.slug = h.base and x.team_id is distinct from h.have_id) as taken
  from h
)
select system_key, club, skey, cc, have_id,
       coalesce(have_id, 'C-' || case when dup > 1 or taken then base || '-' || lower(cc) else base end) as team_id,
       coalesce((select x.slug from core.soccer_team x where x.team_id = d.have_id), case when dup > 1 or taken then base || '-' || lower(cc) else base end) as slug
from d;
do $$
begin
  if exists (select 1 from ofb_club group by team_id having count(*) > 1) then
    raise exception 'two clubs of the seed resolve to one core.soccer_team row: %', (select string_agg(team_id, ', ') from (select team_id from ofb_club group by 1 having count(*) > 1) x);
  end if;
end $$;

insert into core.soccer_team (team_id, name, slug, country_code, kind, has_men, has_women, source_id, source_key)
select c.team_id, c.club, c.slug, c.cc, 'club', true, false, (select ofb from ofb_src), c.skey
from ofb_club c where c.have_id is null
on conflict (team_id) do update set name = excluded.name, country_code = excluded.country_code, kind = excluded.kind, source_key = excluded.source_key
  where core.soccer_team.source_id = excluded.source_id;
-- a club SPX already had: its row stays (id, slug, source), it takes the seed's name and country
update core.soccer_team t set name = c.club, country_code = coalesce(t.country_code, c.cc)
from ofb_club c
where t.team_id = c.have_id and t.source_id = (select spx from ofb_src) and (t.name is distinct from c.club or t.country_code is null);

-- ---------------------------------------------------------------- seasons and the clubs in them

create temp table ofb_cnt as
select m.tid, count(*) filter (where m.stage_key = 'regular') as reg,
       min(m.match_date) filter (where m.stage_key = 'regular') as first_day, max(m.match_date) filter (where m.stage_key = 'regular') as last_day
from ofb_m0 m group by m.tid;
create temp table ofb_member as
select distinct m.tid, m.league_code, m.season, m.system_key, c.team_id, c.club
from (select tid, league_code, season, system_key, hclub as club from ofb_m0 where stage_key = 'regular'
      union select tid, league_code, season, system_key, aclub from ofb_m0 where stage_key = 'regular') m
join ofb_club c on c.system_key = m.system_key and c.club = m.club;

create temp table ofb_season as
select f.system_key, f.tier, f.season, g.league_code, g.matches_built, g.league_code || f.season as tid,
       coalesce((select e.name from ofb_lgrow e where e.league_code = g.league_code and f.season between e.from_year and e.to_year limit 1), g.name) as era_name,
       (select count(*) from ofb_member x where x.tid = g.league_code || f.season) as clubs,
       coalesce((select c.reg from ofb_cnt c where c.tid = g.league_code || f.season), 0) as reg,
       (select c.first_day from ofb_cnt c where c.tid = g.league_code || f.season) as first_day,
       (select c.last_day from ofb_cnt c where c.tid = g.league_code || f.season) as last_day
from (select distinct system_key, tier, season from legacy_openfootball.eu_file where n_matches > 0) f
join ofb_lg g on g.system_key = f.system_key and g.tier = f.tier;

insert into core.soccer_tournament (tournament_id, league_code, year, name, host_names, host_team_ids, start_date, end_date, team_count, source_id, complete, note)
select s.tid, s.league_code, s.season, s.season || '-' || right((s.season + 1)::text, 2) || ' ' || s.era_name, '{}', '{}',
       case when s.matches_built then s.first_day end, case when s.matches_built then s.last_day end, s.clubs, (select ofb from ofb_src), false,
       case when s.matches_built then null
            else 'Only the clubs of this division are listed (so that promotion and relegation show); its matches are not built yet.' end
from ofb_season s
on conflict (tournament_id) do update set name = excluded.name, start_date = excluded.start_date, end_date = excluded.end_date, team_count = excluded.team_count,
  complete = excluded.complete, note = excluded.note
  where core.soccer_tournament.source_id = excluded.source_id;

insert into core.soccer_tournament_team (tournament_id, team_id, team_name)
select m.tid, m.team_id, m.club from ofb_member m
on conflict (tournament_id, team_id) do update set team_name = excluded.team_name;

-- ---------------------------------------------------------------- matches

create temp table ofb_m as
select distinct on (k) m.*, h.team_id as hid, a.team_id as aid,
       'eu-' || to_char(m.match_date, 'YYYYMMDD') || '-' || h.team_id || '-' || a.team_id as k
from ofb_m0 m
join ofb_club h on h.system_key = m.system_key and h.club = m.hclub
join ofb_club a on a.system_key = m.system_key and a.club = m.aclub
order by k, m.tier, m.seq;

-- the fixtures SPX already holds (step 220): same season, same home and away club, regular season
create temp table ofb_spx as
select o.k as ofb_key, x.match_id, x.source_key as spx_key, x.match_date as spx_date, x.home_goals as spx_hg, x.away_goals as spx_ag,
       o.match_date as ofb_date, o.score1 as ofb_hg, o.score2 as ofb_ag, o.system_key, o.tid
from ofb_m o
join core.soccer_match x on x.tournament_id = o.tid and x.home_team_id = o.hid and x.away_team_id = o.aid
where o.stage_key = 'regular' and x.source_id = (select spx from ofb_src);

create temp table ofb_ins as
select o.* from ofb_m o
where o.matches_built and not exists (select 1 from ofb_spx s where s.ofb_key = o.k);

insert into core.soccer_match (source_key, tournament_id, stage_key, stage_order, match_date, kickoff_local, home_team_id, away_team_id, home_goals, away_goals,
                               home_goals_90, away_goals_90, extra_time, shootout, home_penalties, away_penalties, winner_team_id, source_id)
select o.k, o.tid, o.stage_key, case o.stage_key when 'regular' then 1 when 'playoff' then 2 when 'semi' then 3 else 4 end, o.match_date, o.kickoff, o.hid, o.aid,
       o.score1, o.score2, o.s90_1, o.s90_2, o.aet, o.pens1 is not null, o.pens1, o.pens2,
       case when o.score1 > o.score2 then o.hid when o.score1 < o.score2 then o.aid when o.pens1 > o.pens2 then o.hid when o.pens1 < o.pens2 then o.aid end,
       (select ofb from ofb_src)
from ofb_ins o
on conflict (source_key) do update set tournament_id = excluded.tournament_id, stage_key = excluded.stage_key, stage_order = excluded.stage_order,
  match_date = excluded.match_date, kickoff_local = excluded.kickoff_local, home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id,
  home_goals = excluded.home_goals, away_goals = excluded.away_goals, home_goals_90 = excluded.home_goals_90, away_goals_90 = excluded.away_goals_90,
  extra_time = excluded.extra_time, shootout = excluded.shootout, home_penalties = excluded.home_penalties, away_penalties = excluded.away_penalties,
  winner_team_id = excluded.winner_team_id
  where core.soccer_match.source_id = excluded.source_id;

-- matches this step wrote earlier that the files no longer give (no goals, lineups or cards hang off these matches)
delete from core.soccer_match m
where m.source_id = (select ofb from ofb_src) and m.source_key like 'eu-%'
  and exists (select 1 from core.soccer_tournament t where t.tournament_id = m.tournament_id and t.league_code in (select league_code from ofb_lg))
  and not exists (select 1 from ofb_ins o where o.k = m.source_key);

-- a season is complete when its regular-season matches are every pairing home and away
update core.soccer_tournament t set
  complete = (x.have = x.clubs * (x.clubs - 1)),
  note = case when x.have = x.clubs * (x.clubs - 1) then null
              else format('The sources list %s of the %s matches of a full season of %s clubs%s.', x.have, x.clubs * (x.clubs - 1), x.clubs,
                          case when x.canc > 0 then format('; %s fixtures are marked cancelled, postponed or abandoned in the source', x.canc)
                               else '; the season is still being played or matches are missing' end) end
from (select s.tid, s.clubs, (select count(*) from core.soccer_match m where m.tournament_id = s.tid and m.stage_key = 'regular') as have,
             (select count(*) from legacy_openfootball.eu_cancelled c where c.system_key = s.system_key and c.tier = s.tier and c.season = s.season) as canc
        from ofb_season s where s.matches_built) x
where t.tournament_id = x.tid and t.source_id in ((select ofb from ofb_src), (select spx from ofb_src));

-- rows this step wrote earlier that the files no longer give
delete from core.soccer_tournament_team tt
using core.soccer_tournament t
where t.tournament_id = tt.tournament_id and t.source_id = (select ofb from ofb_src) and t.league_code in (select league_code from ofb_lg)
  and not exists (select 1 from ofb_member x where x.tid = tt.tournament_id and x.team_id = tt.team_id);
delete from core.soccer_tournament t
where t.source_id = (select ofb from ofb_src) and t.league_code in (select league_code from ofb_lg)
  and not exists (select 1 from ofb_season s where s.tid = t.tournament_id)
  and not exists (select 1 from core.soccer_match m where m.tournament_id = t.tournament_id);
delete from core.soccer_team t
where t.source_id = (select ofb from ofb_src) and t.source_key like 'eu:%'
  and not exists (select 1 from core.soccer_tournament_team x where x.team_id = t.team_id)
  and not exists (select 1 from core.soccer_match m where t.team_id in (m.home_team_id, m.away_team_id));

-- ---------------------------------------------------------------- the check against SPX, and what the sources say about themselves

delete from meta.verification where source_id = (select ofb from ofb_src);
insert into meta.verification (entity_kind, entity_id, field, status, source_id, evidence_url, their_value)
select 'soccer_match', s.match_id, 'score',
       case when s.spx_hg = s.ofb_hg and s.spx_ag = s.ofb_ag then 'confirmed' else 'disputed' end::meta.verification_status, (select ofb from ofb_src),
       'https://github.com/openfootball/' || case s.system_key when 'england' then 'england' when 'germany' then 'deutschland' when 'spain' then 'espana'
                                                                when 'italy' then 'italy' else 'europe' end,
       s.ofb_hg || '-' || s.ofb_ag
from ofb_spx s;
-- an SPX match in a season openfootball covers, with no counterpart there
insert into meta.verification (entity_kind, entity_id, field, status, source_id, evidence_url, their_value)
select 'soccer_match', m.match_id, 'score', 'not_found'::meta.verification_status, (select ofb from ofb_src), null, null
from core.soccer_match m
join ofb_season s on s.tid = m.tournament_id and s.matches_built
where m.source_id = (select spx from ofb_src) and m.stage_key = 'regular'
  and not exists (select 1 from ofb_spx x where x.match_id = m.match_id);

delete from meta.data_issue where source_id = (select ofb from ofb_src);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select ofb from ofb_src), 'soccer_match', s.spx_key,
       'SPX has ' || s.spx_hg || '-' || s.spx_ag || ' (' || s.spx_date || ') but openfootball has ' || s.ofb_hg || '-' || s.ofb_ag || ' (' || s.ofb_date || ')',
       'kept the SPX result'
from ofb_spx s where s.spx_hg <> s.ofb_hg or s.spx_ag <> s.ofb_ag;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select ofb from ofb_src), 'soccer_match', s.spx_key, 'SPX dates the match ' || s.spx_date || ' where openfootball says ' || s.ofb_date, 'kept the SPX date'
from ofb_spx s where s.spx_date <> s.ofb_date;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select ofb from ofb_src), 'soccer_match', o.k, 'the source marks the result as awarded (' || o.score1 || '-' || o.score2 || '), not played', 'listed with the awarded score'
from ofb_ins o where o.tag = 'awarded';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select ofb from ofb_src), 'soccer_season', g.league_code || c.season, c.n || ' fixtures are marked cancelled, postponed or abandoned and have no result', 'not listed'
from (select system_key, tier, season, count(*) as n from legacy_openfootball.eu_cancelled group by 1, 2, 3) c
join ofb_lg g on g.system_key = c.system_key and g.tier = c.tier;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select ofb from ofb_src), 'soccer_season', g.league_code || m.season, count(*) || ' matches have no final score in the source (a shootout score without the score before it)', 'not listed'
from legacy_openfootball.eu_match m join ofb_lg g on g.system_key = m.system_key and g.tier = m.tier
where m.score1 is null group by g.league_code, m.season;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select ofb from ofb_src), 'soccer_season', s.tid, 'a club of this season plays the same fixture twice, or the file names a club under two spellings: ' || count(*) || ' repeated fixtures',
       'one row kept'
from (select tid, hclub, aclub, stage_key, count(*) from ofb_m0 where stage_key = 'regular' group by 1, 2, 3, 4 having count(*) > 1) d
join ofb_season s on s.tid = d.tid group by s.tid;

commit;

select 'soccer europe openfootball', format('%s clubs (%s new), %s seasons, %s members, %s matches built, %s SPX matches checked (%s disputed)',
  (select count(*) from ofb_club), (select count(*) from ofb_club where have_id is null),
  (select count(*) from ofb_season), (select count(*) from ofb_member), (select count(*) from ofb_ins), (select count(*) from ofb_spx),
  (select count(*) from ofb_spx where spx_hg <> ofb_hg or spx_ag <> ofb_ag));

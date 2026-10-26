-- European top divisions from English Wikipedia season articles (legacy_wikipedia_europe, made by scripts/wikipedia_eu/load.py; migration 139 and steps 220 and 227
-- first). CC BY-SA 4.0. Run from the repo root (it reads db/seed/soccer_club_eu.csv and soccer_league_eu.csv). Runs after 227 and before the last step.
-- Rerunnable, ids kept:
--   league tables  core.soccer_group_standing (stage_key league, group_name League table): position, played, won, drawn, lost, goals, points and the article's own
--                  words about the place (qualification / relegation). Points are the table's, so a deduction shows.
--   champions      core.soccer_tournament.winner_team_id from the (C) mark; runner_up, third and fourth from positions 2 to 4 of the same table. A season whose
--                  table has no (C) (a title taken away, a season still being played) gets none.
--   seasons        a season openfootball (step 227) or SPX (220) already lists keeps its row; a season only Wikipedia gives (every year before openfootball's
--                  files) is added as a tournament with its clubs and no matches (complete = false, with a note).
--   clubs          the same rows as step 227: found by source_key eu:<system>:<club>, else the SPX club of that name, else added (source wikipedia_europe).
--                  The club of a Wikipedia article title is db/seed/soccer_club_eu.csv (source wikipedia); a title with no row stops the step.
--   Wikidata       core.soccer_team.wikidata_id from the club article's page properties, where empty.
-- Where a season has its matches, Wikipedia's table is checked against them (played, won, drawn, lost, goals): a difference is a meta.data_issue and both stay.
-- Does not touch core.game, core.team_season, core.franchise or any venue table.
begin;

drop table if exists wp_src, wp_alias_raw, wp_alias, wp_lgrow, wp_lg, wp_st, wp_club, wp_season, wp_cnt, wp_champ;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, covers_to, retrieved_on, notes) values
 ('wikipedia_europe', 'English Wikipedia: season articles of the European top divisions', 'website', 'CC BY-SA 4.0',
  'English Wikipedia contributors, the season articles of the Premier League, La Liga, Bundesliga, Serie A and Ligue 1 (authors in each article''s history), CC BY-SA 4.0. Modified by SPX Stats: the final table read into the archive and its clubs matched by article.',
  'https://en.wikipedia.org/wiki/Premier_League', '1929-01-01', '2027-12-31', '2026-10-25',
  'Final league tables of the Premier League from 1992-93, La Liga and Serie A from 1929-30, the Bundesliga from 1963-64 and Ligue 1 from 1932-33 (the years of the two world wars have no season). Wikidata item ids (CC0) come from the club articles'' page properties.')
on conflict (code) do update set name = excluded.name, kind = excluded.kind, licence = excluded.licence, attribution = excluded.attribution,
  url = excluded.url, covers_from = excluded.covers_from, covers_to = excluded.covers_to, retrieved_on = excluded.retrieved_on, notes = excluded.notes;

create temp table wp_src as select (select source_id from meta.source where code = 'wikipedia_europe') as wp,
                                   (select source_id from meta.source where code = 'spx_database') as spx;

create temp table wp_alias_raw (system_key text, alias text, club text, source text);
\copy wp_alias_raw from 'db/seed/soccer_club_eu.csv' with (format csv, header true)
create temp table wp_alias as select distinct system_key, alias, club from wp_alias_raw;
create temp table wp_lgrow (league_code text, system_key text, country_code text, tier smallint, from_year int, to_year int, name text, short_name text, matches smallint);
\copy wp_lgrow from 'db/seed/soccer_league_eu.csv' with (format csv, header true)

-- league tables with their club
create temp table wp_st as
select s.league_code, s.season, s.league_code || s.season as tid, l.system_key, a.club, s.pos, s.team_title, s.team_qid, s.marks, s.played, s.wins, s.draws, s.losses,
       s.gf, s.ga, coalesce(s.gd, s.gf - s.ga) as gd, s.points, s.qualification
from legacy_wikipedia_europe.standing s
join ref.soccer_league_system l on l.league_code = s.league_code
left join wp_alias a on a.system_key = l.system_key and a.alias = s.team_title;
do $$
begin
  if exists (select 1 from wp_st where club is null) then
    raise exception 'Wikipedia club articles with no row in db/seed/soccer_club_eu.csv: %', (select string_agg(distinct system_key || ': ' || coalesce(team_title, '(no link)'), '; ') from wp_st where club is null);
  end if;
end $$;
-- a table in which one club appears twice cannot be stored
delete from wp_st t where exists (select 1 from wp_st x where x.tid = t.tid and x.club = t.club and x.pos < t.pos);

-- ---------------------------------------------------------------- clubs

create temp table wp_club as
with u as (select distinct system_key, club from wp_st),
c as (
  select u.system_key, u.club, 'eu:' || u.system_key || ':' || replace(core.fold_text(u.club), ' ', '-') as skey,
         (select min(g.country_code) from wp_lgrow g where g.system_key = u.system_key) as cc, replace(core.fold_text(u.club), ' ', '-') as base
  from u
), h as (
  select c.*,
         coalesce((select min(t.team_id) from core.soccer_team t where t.source_key = c.skey),
                  (select min(t.team_id) from core.soccer_team t
                    where t.source_id = (select spx from wp_src) and t.kind = 'club'
                      and (t.name = c.club or t.name in (select a.alias from wp_alias_raw a where a.system_key = c.system_key and a.club = c.club and a.source = 'spx')))) as have_id
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
  if exists (select 1 from wp_club group by team_id having count(*) > 1) then
    raise exception 'two clubs of the seed resolve to one core.soccer_team row: %', (select string_agg(team_id, ', ') from (select team_id from wp_club group by 1 having count(*) > 1) x);
  end if;
end $$;

insert into core.soccer_team (team_id, name, slug, country_code, kind, has_men, has_women, source_id, source_key)
select c.team_id, c.club, c.slug, c.cc, 'club', true, false, (select wp from wp_src), c.skey
from wp_club c where c.have_id is null
on conflict (team_id) do update set name = excluded.name, country_code = excluded.country_code, kind = excluded.kind, source_key = excluded.source_key
  where core.soccer_team.source_id = excluded.source_id;
update core.soccer_team t set name = c.club, country_code = coalesce(t.country_code, c.cc)
from wp_club c
where t.team_id = c.have_id and t.source_id = (select spx from wp_src) and (t.name is distinct from c.club or t.country_code is null);

update core.soccer_team t set wikidata_id = q.qid
from (select c.team_id, (array_agg(s.team_qid order by s.season desc))[1] as qid
        from wp_st s join wp_club c on c.system_key = s.system_key and c.club = s.club where s.team_qid is not null group by c.team_id) q
where t.team_id = q.team_id and t.wikidata_id is null;

-- ---------------------------------------------------------------- seasons

create temp table wp_season as
select s.tid, s.league_code, s.season, count(*) as clubs,
       coalesce((select e.name from wp_lgrow e where e.league_code = s.league_code and s.season between e.from_year and e.to_year limit 1),
                (select e.name from wp_lgrow e where e.league_code = s.league_code order by e.to_year desc limit 1)) as era_name
from wp_st s group by s.tid, s.league_code, s.season;

insert into core.soccer_tournament (tournament_id, league_code, year, name, host_names, host_team_ids, team_count, source_id, complete, note)
select s.tid, s.league_code, s.season, s.season || '-' || right((s.season + 1)::text, 2) || ' ' || s.era_name, '{}', '{}', s.clubs, (select wp from wp_src), false,
       'Only the final league table of this season is held; its matches are not loaded.'
from wp_season s
on conflict (tournament_id) do update set name = excluded.name, team_count = excluded.team_count
  where core.soccer_tournament.source_id = excluded.source_id;

insert into core.soccer_tournament_team (tournament_id, team_id, team_name)
select distinct s.tid, c.team_id, c.club
from wp_st s join wp_club c on c.system_key = s.system_key and c.club = s.club
where exists (select 1 from core.soccer_tournament t where t.tournament_id = s.tid and t.source_id = (select wp from wp_src))
on conflict (tournament_id, team_id) do update set team_name = excluded.team_name;
-- a member of a season Wikipedia lists and the other sources do not
insert into core.soccer_tournament_team (tournament_id, team_id, team_name)
select distinct s.tid, c.team_id, c.club
from wp_st s join wp_club c on c.system_key = s.system_key and c.club = s.club
where exists (select 1 from core.soccer_tournament t where t.tournament_id = s.tid and t.source_id <> (select wp from wp_src))
  and not exists (select 1 from core.soccer_match m where m.tournament_id = s.tid)
on conflict (tournament_id, team_id) do nothing;

-- ---------------------------------------------------------------- league tables and champions

delete from core.soccer_group_standing g where g.stage_key = 'league' and g.tournament_id in (select tid from wp_season);
insert into core.soccer_group_standing (tournament_id, stage_number, stage_key, group_name, position, team_id, played, wins, draws, losses, goals_for, goals_against,
                                        goal_difference, points, qualification)
select s.tid, 1, 'league', 'League table', s.pos, c.team_id, s.played, s.wins, s.draws, s.losses, s.gf, s.ga, s.gd, s.points, s.qualification
from wp_st s join wp_club c on c.system_key = s.system_key and c.club = s.club
where s.pos is not null;

create temp table wp_champ as
select s.tid, max(c.team_id) filter (where s.pos = 1) as t1, max(c.team_id) filter (where s.pos = 2) as t2, max(c.team_id) filter (where s.pos = 3) as t3, max(c.team_id) filter (where s.pos = 4) as t4
from wp_st s join wp_club c on c.system_key = s.system_key and c.club = s.club
where s.tid in (select tid from wp_st where marks ~ '(^|,)C($|,)' group by tid having count(*) = 1)
group by s.tid;
update core.soccer_tournament t set winner_team_id = null, runner_up_team_id = null, third_team_id = null, fourth_team_id = null
where t.tournament_id in (select tid from wp_season) and t.league_code in (select league_code from wp_season)
  and t.tournament_id not in (select tid from wp_champ);
update core.soccer_tournament t set winner_team_id = c.t1, runner_up_team_id = c.t2, third_team_id = c.t3, fourth_team_id = c.t4
from wp_champ c where t.tournament_id = c.tid;

-- ---------------------------------------------------------------- the check against the matches, and what the table says about itself

delete from meta.data_issue where source_id = (select wp from wp_src);
create temp table wp_cnt as
select r.tournament_id as tid, r.t as team_id, count(*) as played, sum((r.gf > r.ga)::int) as wins, sum((r.gf = r.ga)::int) as draws, sum((r.gf < r.ga)::int) as losses,
       sum(r.gf) as gf, sum(r.ga) as ga
from (select m.tournament_id, m.home_team_id as t, m.home_goals as gf, m.away_goals as ga from core.soccer_match m where m.stage_key = 'regular'
      union all select m.tournament_id, m.away_team_id, m.away_goals, m.home_goals from core.soccer_match m where m.stage_key = 'regular') r
where r.tournament_id in (select tid from wp_season)
group by r.tournament_id, r.t;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select wp from wp_src), 'soccer_season', s.tid || ':' || tm.slug,
       format('Wikipedia''s table has %s played, %s-%s-%s, goals %s-%s; the matches in the archive give %s played, %s-%s-%s, goals %s-%s',
              s.played, s.wins, s.draws, s.losses, s.gf, s.ga, k.played, k.wins, k.draws, k.losses, k.gf, k.ga),
       'both kept; the table is shown as Wikipedia has it'
from wp_st s join wp_club c on c.system_key = s.system_key and c.club = s.club
join core.soccer_team tm on tm.team_id = c.team_id
join wp_cnt k on k.tid = s.tid and k.team_id = c.team_id
join core.soccer_tournament t on t.tournament_id = s.tid and t.complete
where (s.played, s.wins, s.draws, s.losses, s.gf, s.ga) is distinct from (k.played, k.wins, k.draws, k.losses, k.gf, k.ga);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select wp from wp_src), 'soccer_season', s.tid || ':' || tm.slug,
       format('Wikipedia''s table gives %s points for %s wins and %s draws (%s expected): a deduction, an award or a rule of the time', s.points, s.wins, s.draws,
              s.wins * (case when s.season >= case s.system_key when 'england' then 1981 when 'italy' then 1994 when 'france' then 1994 else 1995 end then 3 else 2 end) + s.draws),
       'the table''s points are shown'
from wp_st s join wp_club c on c.system_key = s.system_key and c.club = s.club
join core.soccer_team tm on tm.team_id = c.team_id
where s.points is not null and s.wins is not null and s.draws is not null
  and s.points <> s.wins * (case when s.season >= case s.system_key when 'england' then 1981 when 'italy' then 1994 when 'france' then 1994 else 1995 end then 3 else 2 end) + s.draws;

-- ---------------------------------------------------------------- rows this step wrote earlier that the articles no longer give

delete from core.soccer_tournament_team tt
using core.soccer_tournament t
where t.tournament_id = tt.tournament_id and t.source_id = (select wp from wp_src) and t.league_code in (select league_code from wp_season)
  and not exists (select 1 from wp_st x join wp_club c on c.system_key = x.system_key and c.club = x.club where x.tid = tt.tournament_id and c.team_id = tt.team_id);
delete from core.soccer_tournament t
where t.source_id = (select wp from wp_src) and t.league_code in (select league_code from wp_season)
  and not exists (select 1 from wp_season s where s.tid = t.tournament_id) and not exists (select 1 from core.soccer_match m where m.tournament_id = t.tournament_id);
delete from core.soccer_team t
where t.source_id = (select wp from wp_src) and t.source_key like 'eu:%'
  and not exists (select 1 from core.soccer_tournament_team x where x.team_id = t.team_id)
  and not exists (select 1 from core.soccer_group_standing g where g.team_id = t.team_id)
  and not exists (select 1 from core.soccer_match m where t.team_id in (m.home_team_id, m.away_team_id));

commit;

select 'soccer europe wikipedia', format('%s league tables, %s standing rows, %s clubs (%s new), %s champions, %s differences from the matches',
  (select count(*) from wp_season), (select count(*) from wp_st), (select count(*) from wp_club), (select count(*) from wp_club where have_id is null),
  (select count(*) from wp_champ), (select count(*) from meta.data_issue where source_id = (select wp from wp_src)));

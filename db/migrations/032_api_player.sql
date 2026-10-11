-- The public API for a player's page, read-only views over core.player_season_stat, core.roster_stint and
-- core.person_career. A page for one person asks each view with person_id=eq.N.
--   api.person_season_teams  one row per team-season the person is known to have been on (stats or roster), with whether
--                            they played in the regular season and the playoffs there, and whether the club won the title
--   api.person_stats         the stats of each of those, per phase and stat group (skater, goalie, batting, pitching ...)
--   api.person_career_totals the same, summed over the career per league, phase and group
--   api.person_resume        education, clubs outside the five leagues, and the draft
-- Stats hold counting numbers only; rates are worked out where shown.
create index if not exists award_winner_team_season_idx on core.award_winner (team_season_id);

create or replace view api.person_season_teams as
with pairs as (
  select person_id, team_season_id from core.player_season_stat
  union
  select person_id, team_season_id from core.roster_stint where role = 'player')
select p.person_id, ts.team_season_id, s.league_code as league, s.start_year as year, s.label as season_label, ts.franchise_id,
       api.team_name(ts.team_season_id) as team,
       exists (select 1 from core.player_season_stat x where x.person_id = p.person_id and x.team_season_id = ts.team_season_id and x.phase = 'regular') as played_regular,
       exists (select 1 from core.player_season_stat x where x.person_id = p.person_id and x.team_season_id = ts.team_season_id and x.phase = 'playoffs') as played_playoffs,
       (exists (select 1 from core.game g where g.phase = 'playoffs' and ts.team_season_id in (g.home_team_season_id, g.away_team_season_id))) as team_made_playoffs,
       exists (select 1 from core.award_winner w join core.award a using (award_id)
                where a.kind = 'championship' and w.team_season_id = ts.team_season_id) as team_champion
from pairs p join core.team_season ts using (team_season_id) join core.season s using (season_id);

create or replace view api.person_stats as
select x.person_id, s.league_code as league, s.start_year as year, ts.team_season_id, ts.franchise_id,
       api.team_name(ts.team_season_id) as team, x.phase::text as phase, x.stat_group, x.games_played, x.games_started, x.stats
from core.player_season_stat x join core.team_season ts using (team_season_id) join core.season s using (season_id)
where x.is_total is not true;

create or replace view api.person_career_totals as
with rows as (
  select x.person_id, s.league_code as league, x.phase::text as phase, x.stat_group, s.season_id, ts.team_season_id, x.games_played, x.stats
  from core.player_season_stat x join core.team_season ts using (team_season_id) join core.season s using (season_id)
  where x.is_total is not true),
sums as (
  select r.person_id, r.league, r.phase, r.stat_group, e.key, sum(e.value::numeric) as v
  from rows r cross join lateral jsonb_each_text(r.stats) e
  where e.value ~ '^-?[0-9]+(\.[0-9]+)?$'
  group by 1, 2, 3, 4, 5),
agg as (
  select person_id, league, phase, stat_group, jsonb_object_agg(key, v) as stats from sums group by 1, 2, 3, 4),
meta as (
  select person_id, league, phase, stat_group, count(distinct season_id)::int as seasons, count(distinct team_season_id)::int as team_seasons,
         sum(games_played)::int as games_played
  from rows group by 1, 2, 3, 4)
select m.person_id, m.league, m.phase, m.stat_group, m.seasons, m.team_seasons, m.games_played, a.stats
from meta m join agg a using (person_id, league, phase, stat_group);

create or replace view api.person_resume as
select c.person_id, c.kind, c.name, c.level, c.league, c.start_year, c.end_year, c.detail, c.club_qid, src.code as source
from core.person_career c join meta.source src using (source_id);

-- api.people counts a person's seasons from the rosters and the stats both (026 used rosters alone); same columns, same order.
create or replace view api.people as
select p.person_id, p.full_name as name, p.kind, p.birth_date, p.death_date, p.birth_place, p.birth_country_code, p.birth_lat, p.birth_lon,
       p.nationality_code, p.height_cm, p.primary_position as position, p.hall_of_fame_year, p.debut_on as debut, p.final_game_on as final,
       (select count(*)::int from core.award_winner w join core.award a using (award_id)
         where w.person_id = p.person_id and a.kind = 'person_award') as award_count,
       (select count(distinct (c.season_id, c.team_season_id))::int
          from (select team_season_id from core.roster_stint where person_id = p.person_id and role = 'player'
                union select team_season_id from core.player_season_stat where person_id = p.person_id) t
          join core.award_winner c on c.team_season_id = t.team_season_id
          join core.award a on a.award_id = c.award_id and a.kind = 'championship') as championship_count,
       sp.seasons_played, sp.first_season, sp.last_season,
       (select array_agg(distinct l order by l) from (
          select s.league_code as l from core.team_season ts join core.season s using (season_id)
           where ts.team_season_id in (select team_season_id from core.roster_stint where person_id = p.person_id
                                       union select team_season_id from core.player_season_stat where person_id = p.person_id)
          union select s.league_code from core.award_winner w join core.season s using (season_id) where w.person_id = p.person_id) x) as leagues
from core.person p
left join lateral (
  select count(distinct s.season_id)::int as seasons_played, min(s.start_year) as first_season, max(s.start_year) as last_season
  from (select team_season_id from core.roster_stint where person_id = p.person_id and role = 'player'
        union select team_season_id from core.player_season_stat where person_id = p.person_id) t
  join core.team_season ts using (team_season_id) join core.season s using (season_id)) sp on true;

grant select on api.people, api.person_season_teams, api.person_stats, api.person_career_totals, api.person_resume to anon, authenticated;

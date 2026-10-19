-- The 2023 FIFA Women's World Cup (Australia and New Zealand, 32 teams, 64 matches) into core.soccer_*, from legacy_worldcup.of_match / of_goal /
-- of_stadium rows of year 2023, which scripts/worldcup/wwc2023.py wrote from English Wikipedia's group, knockout and final articles (CC BY-SA 4.0).
-- Run after 200_worldcup.sql (the teams, the stage keys), from the repo root. Rerunnable: matches are keyed 'wwc-2023-NNN'.
--  * Teams are the national teams core.soccer_team already holds, by name; Zambia, Vietnam and the Philippines are new (team_id X-..., source wikipedia);
--    Ireland, Morocco, Panama, Portugal and Haiti, which had only a men's team row, now carry a women's team.
--  * The 90-minute score of an extra-time match comes from the goals (minute 90 or less); the boxes carry no halftime score.
--  * Goals are by scorer name (no player ids, as for 2026): core.soccer_goal.person_id is null. No lineups, cards or squads.
--  * Venues: the stadium as the article names it, with its Wikidata item (of_stadium.wikidata); step 207 fills venue_id once the stadium is in core.venue.
-- Does not touch core.venue, core.game, core.team_season or any venue table.
begin;

create temp table src on commit drop as select source_id from meta.source where code = 'wikipedia';

insert into core.soccer_team (team_id, name, slug, fifa_code, flag_code, country_code, region, confederation, has_women, source_id) values
 ('X-zambia',      'Zambia',      'zambia',      'ZAM', 'ZM', 'ZM', 'Africa',       'CAF', true, (select source_id from src)),
 ('X-vietnam',     'Vietnam',     'vietnam',     'VIE', 'VN', 'VN', 'Southeast Asia', 'AFC', true, (select source_id from src)),
 ('X-philippines', 'Philippines', 'philippines', 'PHI', 'PH', 'PH', 'Southeast Asia', 'AFC', true, (select source_id from src))
on conflict (team_id) do update set has_women = true;
update core.soccer_team set has_women = true where kind = 'national' and name in ('Republic of Ireland', 'Morocco', 'Panama', 'Portugal', 'Haiti') and not has_women;
update core.soccer_team set country_code = null where country_code is not null and not exists (select 1 from ref.country c where c.country_code = soccer_team.country_code);

create temp table team on commit drop as select team_id, name from core.soccer_team where kind = 'national';

insert into core.soccer_tournament (tournament_id, league_code, year, name, host_names, host_team_ids, start_date, end_date, team_count, source_id)
select 'wwc2023', 'wwc', 2023, '2023 FIFA Women''s World Cup', array['Australia', 'New Zealand'],
       array[(select team_id from team where name = 'Australia'), (select team_id from team where name = 'New Zealand')],
       (select min(match_date) from legacy_worldcup.of_match where year = 2023), (select max(match_date) from legacy_worldcup.of_match where year = 2023), 32, (select source_id from src)
where exists (select 1 from legacy_worldcup.of_match where year = 2023)
on conflict (tournament_id) do update set host_names = excluded.host_names, host_team_ids = excluded.host_team_ids, start_date = excluded.start_date,
  end_date = excluded.end_date, team_count = excluded.team_count, source_id = excluded.source_id;

create temp table stage on commit drop as
select * from (values ('Group stage', 'group', 1), ('Round of 16', 'round_of_16', 5), ('Quarter-finals', 'quarter', 6), ('Semi-finals', 'semi', 7),
                      ('Third place', 'third_place', 8), ('Final', 'final', 9)) v(raw, stage_key, stage_order);

create temp table m on commit drop as
select o.seq, 'wwc-2023-' || lpad(o.seq::text, 3, '0') as source_key, t1.team_id as t1, t2.team_id as t2, st.stage_key, st.stage_order, o.group_name, o.match_date, o.kickoff, o.utc_offset,
       o.score1, o.score2, o.aet, o.pens1, o.pens2,
       case when o.aet then (select count(*) from legacy_worldcup.of_goal g where g.year = 2023 and g.seq = o.seq and g.side = 'home' and split_part(g.minute, '+', 1)::int <= 90)::smallint end as s90_1,
       case when o.aet then (select count(*) from legacy_worldcup.of_goal g where g.year = 2023 and g.seq = o.seq and g.side = 'away' and split_part(g.minute, '+', 1)::int <= 90)::smallint end as s90_2,
       o.venue
from legacy_worldcup.of_match o
join stage st on st.raw = o.stage
left join team t1 on t1.name = o.team1 left join team t2 on t2.name = o.team2
where o.year = 2023;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'soccer_match', 'wwc-2023-' || lpad(seq::text, 3, '0'), 'WWC 2023: a team name matches no national team in core.soccer_team', 'Match left out'
from m where t1 is null or t2 is null
on conflict do nothing;

insert into core.soccer_match (source_key, tournament_id, stage_key, stage_order, group_name, match_number, match_date, kickoff_local, utc_offset,
                               home_team_id, away_team_id, home_goals, away_goals, home_goals_90, away_goals_90, extra_time, shootout,
                               home_penalties, away_penalties, winner_team_id, venue_name, venue_city, venue_country, venue_wikidata_id, source_id)
select x.source_key, 'wwc2023', x.stage_key, x.stage_order, x.group_name, null, x.match_date, x.kickoff, x.utc_offset,
       x.t1, x.t2, x.score1, x.score2, x.s90_1, x.s90_2, x.aet, x.pens1 is not null, x.pens1, x.pens2,
       case when x.score1 > x.score2 then x.t1 when x.score1 < x.score2 then x.t2 when x.pens1 > x.pens2 then x.t1 when x.pens1 < x.pens2 then x.t2 end,
       sd.name, sd.city, case sd.cc when 'au' then 'Australia' when 'nz' then 'New Zealand' end, sd.wikidata, (select source_id from src)
from m x
left join legacy_worldcup.of_stadium sd on sd.year = 2023 and sd.name = x.venue
where x.t1 is not null and x.t2 is not null
on conflict (source_key) do update set stage_key = excluded.stage_key, stage_order = excluded.stage_order, group_name = excluded.group_name,
  match_date = excluded.match_date, kickoff_local = excluded.kickoff_local, utc_offset = excluded.utc_offset,
  home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id, home_goals = excluded.home_goals, away_goals = excluded.away_goals,
  home_goals_90 = excluded.home_goals_90, away_goals_90 = excluded.away_goals_90, extra_time = excluded.extra_time, shootout = excluded.shootout,
  home_penalties = excluded.home_penalties, away_penalties = excluded.away_penalties, winner_team_id = excluded.winner_team_id,
  venue_name = excluded.venue_name, venue_city = excluded.venue_city, venue_country = excluded.venue_country, venue_wikidata_id = excluded.venue_wikidata_id;

-- goals: scorers by name, the side credited (an own goal under the side it counted for)
delete from core.soccer_goal g using core.soccer_match sm where g.match_id = sm.match_id and sm.tournament_id = 'wwc2023';
insert into core.soccer_goal (goal_id, match_id, team_id, person_id, scorer_name, minute_label, minute, stoppage, period, own_goal, penalty)
select sm.source_key || '-' || g.n, sm.match_id, case g.side when 'home' then sm.home_team_id else sm.away_team_id end, null, g.scorer,
       g.minute || '''', split_part(g.minute, '+', 1)::smallint, coalesce(nullif(split_part(g.minute, '+', 2), '')::smallint, 0),
       case when split_part(g.minute, '+', 1)::int > 90 then 'extra time' when split_part(g.minute, '+', 1)::int > 45 then 'second half' else 'first half' end,
       g.kind = 'og', g.kind = 'pen'
from legacy_worldcup.of_goal g
join core.soccer_match sm on sm.source_key = 'wwc-2023-' || lpad(g.seq::text, 3, '0')
where g.year = 2023 and g.scorer is not null;

-- the result and the teams' path
update core.soccer_tournament t set
  winner_team_id    = (select winner_team_id from core.soccer_match where tournament_id = 'wwc2023' and stage_key = 'final'),
  runner_up_team_id = (select case when winner_team_id = home_team_id then away_team_id else home_team_id end from core.soccer_match where tournament_id = 'wwc2023' and stage_key = 'final'),
  third_team_id     = (select winner_team_id from core.soccer_match where tournament_id = 'wwc2023' and stage_key = 'third_place'),
  fourth_team_id    = (select case when winner_team_id = home_team_id then away_team_id else home_team_id end from core.soccer_match where tournament_id = 'wwc2023' and stage_key = 'third_place')
where t.tournament_id = 'wwc2023';

insert into core.soccer_tournament_team (tournament_id, team_id, performance, is_host, final_position)
select 'wwc2023', p.team_id,
       case p.top when 9 then 'final' when 8 then 'third-place match' when 7 then 'semi-finals' when 6 then 'quarter-finals' when 5 then 'round of 16' else 'group stage' end,
       p.team_id in (select unnest(host_team_ids) from core.soccer_tournament where tournament_id = 'wwc2023'),
       case p.team_id when t.winner_team_id then 1 when t.runner_up_team_id then 2 when t.third_team_id then 3 when t.fourth_team_id then 4 end
from (select team_id, max(stage_order) as top from (
        select home_team_id as team_id, stage_order from core.soccer_match where tournament_id = 'wwc2023'
        union all select away_team_id, stage_order from core.soccer_match where tournament_id = 'wwc2023') x group by team_id) p,
     core.soccer_tournament t
where t.tournament_id = 'wwc2023'
on conflict (tournament_id, team_id) do update set performance = excluded.performance, is_host = excluded.is_host, final_position = excluded.final_position;

-- group tables worked out from the results (points, goal difference, goals scored; FIFA's fair-play and drawing-of-lots tie-breaks are not applied)
delete from core.soccer_group_standing where tournament_id = 'wwc2023';
insert into core.soccer_group_standing (tournament_id, stage_number, stage_key, group_name, position, team_id, played, wins, draws, losses,
                                        goals_for, goals_against, goal_difference, points, advanced)
select 'wwc2023', 1, 'group', r.group_name, row_number() over (partition by r.group_name order by r.points desc, r.gd desc, r.gf desc, r.team_id),
       r.team_id, r.played, r.w, r.d, r.l, r.gf, r.ga, r.gd, r.points,
       exists (select 1 from core.soccer_match k where k.tournament_id = 'wwc2023' and k.stage_order > 1 and r.team_id in (k.home_team_id, k.away_team_id))
from (select s.group_name, s.team_id, count(*)::smallint as played,
             count(*) filter (where s.gf > s.ga)::smallint as w, count(*) filter (where s.gf = s.ga)::smallint as d, count(*) filter (where s.gf < s.ga)::smallint as l,
             sum(s.gf)::smallint as gf, sum(s.ga)::smallint as ga, (sum(s.gf) - sum(s.ga))::smallint as gd,
             (3 * count(*) filter (where s.gf > s.ga) + count(*) filter (where s.gf = s.ga))::smallint as points
      from (select mm.group_name, mm.home_team_id as team_id, mm.home_goals as gf, mm.away_goals as ga from core.soccer_match mm where mm.tournament_id = 'wwc2023' and mm.stage_key = 'group'
            union all select mm.group_name, mm.away_team_id, mm.away_goals, mm.home_goals from core.soccer_match mm where mm.tournament_id = 'wwc2023' and mm.stage_key = 'group') s
      group by s.group_name, s.team_id) r;

select (select count(*) from core.soccer_match where tournament_id = 'wwc2023') as matches, (select count(*) from core.soccer_goal g join core.soccer_match sm using (match_id) where sm.tournament_id = 'wwc2023') as goals,
       (select count(*) from core.soccer_tournament_team where tournament_id = 'wwc2023') as teams,
       (select name from core.soccer_team where team_id = (select winner_team_id from core.soccer_tournament where tournament_id = 'wwc2023')) as champion;
commit;

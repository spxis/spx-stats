-- Major League Soccer (1996-): club soccer in the core.soccer_* tables that migration 066 made for the World Cup. Add-only: new columns, one
-- new table, new views, and two views replaced with the same columns plus new ones at the end (api.soccer_teams now lists national teams
-- only, so the World Cup team list does not gain clubs).
-- Design (docs/mls.md): an MLS season is a core.soccer_tournament (tournament_id mls1996, league_code mls); a club is a core.soccer_team of
-- kind 'club' (team_id C-<slug>, the club's Wikipedia article is its identity, so a renamed club is one row); the name the club carried in a
-- season is core.soccer_tournament_team.team_name (names by period are read from it); regular-season and playoff matches are
-- core.soccer_match rows (stage_key regular / knockout / round_one / conference_semi / conference_final / final); the conference tables
-- and the overall table are core.soccer_group_standing rows. Nothing here touches core.game, core.team_season, core.franchise or any venue
-- table: a match keeps the stadium as its source names it (venue_name, venue_city, venue_wikidata_id) and venue_id stays empty for the
-- world stadium dataset to fill by Wikidata id. No people are created: season leaders are names (core.soccer_season_leader).
-- Rebuilt by db/build/204_mls.sql from legacy_mls (made by scripts/mls/load.py, DS1 only) and published by a data release.
begin;

-- ---------------------------------------------------------------- clubs

alter table core.soccer_team add column if not exists kind text not null default 'national';
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'core.soccer_team'::regclass and conname = 'soccer_team_kind_check') then
    alter table core.soccer_team add constraint soccer_team_kind_check check (kind in ('national', 'club'));
  end if;
end $$;
alter table core.soccer_team add column if not exists wikidata_id text;     -- a club's Wikidata item (national teams keep wikidata_men / wikidata_women)
comment on column core.soccer_team.kind is 'national (a country''s team, the World Cup) or club (a club of a league such as MLS).';

-- ---------------------------------------------------------------- a season's extras

alter table core.soccer_tournament add column if not exists shield_team_id text references core.soccer_team;   -- Supporters' Shield: best regular-season record
alter table core.soccer_tournament add column if not exists complete boolean not null default true;            -- false for a season still being played

alter table core.soccer_tournament_team add column if not exists team_name text;           -- the name the club carried that season
alter table core.soccer_tournament_team add column if not exists conference text;          -- Eastern Conference / Western Conference
alter table core.soccer_tournament_team add column if not exists venue_name text;          -- the club's home stadium that season (the one most home matches were played in)
alter table core.soccer_tournament_team add column if not exists venue_city text;
alter table core.soccer_tournament_team add column if not exists venue_wikidata_id text;

alter table core.soccer_group_standing add column if not exists shootout_wins smallint;    -- 1996-1999: a shootout win was worth one point and is not in wins
alter table core.soccer_group_standing add column if not exists qualification text;        -- what the table says the place earned

alter table core.soccer_match add column if not exists attendance integer;
alter table core.soccer_match add column if not exists shootout_style text;                -- 'mls': 1996-1999 regular-season shootout (a winner, no penalty score); null otherwise
comment on column core.soccer_match.shootout_style is 'mls: the 1996-1999 regular-season shootout, where winner_team_id is set on a level score and there is no penalty-kick score.';

create table if not exists core.soccer_season_leader (
  tournament_id  text not null references core.soccer_tournament on delete cascade,
  category       text not null check (category in ('goals', 'assists', 'shutouts', 'award')),
  label          text not null default '',           -- for an award, its name (Most Valuable Player); empty for a statistic
  rank           smallint not null,                  -- 1 for the leader; tied players share a rank
  player_name    text not null,
  team_id        text references core.soccer_team,
  value          smallint,                           -- the statistic; null for an award
  wikidata_id    text,                               -- the player's Wikidata item, when the Wikipedia link gave one
  primary key (tournament_id, category, label, rank, player_name)
);
comment on table core.soccer_season_leader is 'A season''s statistical leaders and individual award winners as the season article lists them (name only; no person row).';

-- ---------------------------------------------------------------- the API

-- national teams only: the World Cup team list and team pages must not gain clubs (same columns as 066)
create or replace view api.soccer_teams as
select t.team_id, t.name, t.slug, t.fifa_code, t.flag_code, t.country_code, t.federation, t.region, t.confederation, t.continues_team_id,
       t.has_men, t.has_women, t.wikidata_men, t.wikidata_women,
       (select count(*)::int from core.soccer_tournament_team tt where tt.team_id = t.team_id) as tournaments
from core.soccer_team t
where t.kind = 'national';

-- 066's columns, then the attendance and the shootout style. A club is named as it was called that season (core.soccer_tournament_team.team_name:
-- MetroStars in 1999, New York Red Bulls in 2010); national teams have no such name and keep theirs.
create or replace view api.soccer_matches as
select m.match_id, m.source_key, t.league_code as league, t.year, m.tournament_id, m.stage_key, m.stage_order, m.group_name, m.match_number, m.match_date,
       m.kickoff_local, m.utc_offset,
       m.home_team_id, coalesce(htt.team_name, h.name) as home, h.slug as home_slug, h.flag_code as home_flag, m.home_goals,
       m.away_team_id, coalesce(att.team_name, a.name) as away, a.slug as away_slug, a.flag_code as away_flag, m.away_goals,
       m.home_goals_90, m.away_goals_90, m.extra_time, m.shootout, m.home_penalties, m.away_penalties,
       m.winner_team_id, m.is_replay, m.venue_name, m.venue_city, m.venue_country, m.venue_wikidata_id, m.venue_id,
       (select count(*)::int from core.soccer_appearance x where x.match_id = m.match_id) as lineup_players,
       (select count(*)::int from core.soccer_goal x where x.match_id = m.match_id) as goal_rows,
       (select code from meta.source where source_id = m.source_id) as source,
       (select max(case v.status when 'confirmed' then 1 when 'disputed' then -1 end) from meta.verification v
         where v.entity_kind = 'soccer_match' and v.entity_id = m.match_id) as checked,
       m.attendance, m.shootout_style
from core.soccer_match m
join core.soccer_tournament t using (tournament_id)
join core.soccer_team h on h.team_id = m.home_team_id
join core.soccer_team a on a.team_id = m.away_team_id
left join core.soccer_tournament_team htt on htt.tournament_id = m.tournament_id and htt.team_id = m.home_team_id
left join core.soccer_tournament_team att on att.tournament_id = m.tournament_id and att.team_id = m.away_team_id;

-- 066's view with the opponent named as it was called that season
create or replace view api.soccer_team_matches as
select m.match_id, t.league_code as league, t.year, m.tournament_id, m.stage_key, m.stage_order, m.group_name, m.match_date,
       s.team_id, s.opponent_id, coalesce(oppt.team_name, opp.name) as opponent, opp.slug as opponent_slug, opp.flag_code as opponent_flag,
       s.is_home, s.gf, s.ga,
       case when s.gf > s.ga then 'w' when s.gf < s.ga then 'l' else 'd' end as result,
       m.extra_time, m.shootout, s.pens_for, s.pens_against,
       (m.winner_team_id = s.team_id) as won_match,
       m.venue_name, m.venue_city, m.venue_country
from core.soccer_match m
join core.soccer_tournament t using (tournament_id)
cross join lateral (values
  (m.home_team_id, m.away_team_id, true,  m.home_goals, m.away_goals, m.home_penalties, m.away_penalties),
  (m.away_team_id, m.home_team_id, false, m.away_goals, m.home_goals, m.away_penalties, m.home_penalties)
) s(team_id, opponent_id, is_home, gf, ga, pens_for, pens_against)
join core.soccer_team opp on opp.team_id = s.opponent_id
left join core.soccer_tournament_team oppt on oppt.tournament_id = m.tournament_id and oppt.team_id = s.opponent_id;

-- 066's columns, then the club's name that season, the shootout wins and what the place earned
create or replace view api.soccer_standings as
select gs.tournament_id, t.league_code as league, t.year, gs.stage_number, gs.stage_key, gs.group_name, gs.position, gs.team_id,
       tm.name as team, tm.slug as team_slug, tm.flag_code,
       gs.played, gs.wins, gs.draws, gs.losses, gs.goals_for, gs.goals_against, gs.goal_difference, gs.points, gs.advanced,
       tt.team_name, gs.shootout_wins, gs.qualification
from core.soccer_group_standing gs
join core.soccer_tournament t using (tournament_id)
join core.soccer_team tm using (team_id)
left join core.soccer_tournament_team tt on tt.tournament_id = gs.tournament_id and tt.team_id = gs.team_id;

-- one row per MLS season
create or replace view api.mls_seasons as
select t.tournament_id, t.year, t.name, t.start_date, t.end_date, t.team_count, t.complete,
       t.winner_team_id as champion_id, cw.team_name as champion, cwt.slug as champion_slug,
       t.runner_up_team_id as runner_up_id, cr.team_name as runner_up, crt.slug as runner_up_slug,
       t.shield_team_id as shield_id, cs.team_name as shield, cst.slug as shield_slug,
       f.match_id as final_match_id, f.match_date as final_date, f.home_goals as final_home_goals, f.away_goals as final_away_goals,
       f.home_team_id as final_home_id, f.extra_time as final_extra_time, f.shootout as final_shootout,
       f.home_penalties as final_home_penalties, f.away_penalties as final_away_penalties,
       f.venue_name as final_venue, f.venue_city as final_city, f.attendance as final_attendance,
       (select count(*)::int from core.soccer_match m where m.tournament_id = t.tournament_id and m.stage_key = 'regular') as regular_matches,
       (select count(*)::int from core.soccer_match m where m.tournament_id = t.tournament_id and m.stage_key <> 'regular') as playoff_matches,
       (select coalesce(sum(m.home_goals + m.away_goals), 0)::int from core.soccer_match m where m.tournament_id = t.tournament_id and m.stage_key = 'regular') as regular_goals,
       (select (avg(m.attendance))::int from core.soccer_match m where m.tournament_id = t.tournament_id and m.stage_key = 'regular' and m.attendance > 0) as avg_attendance,
       -- the regular-season matches the season's own overall table says were played (half the sum of the clubs' games played)
       (select (sum(g.played) / 2)::int from core.soccer_group_standing g where g.tournament_id = t.tournament_id and g.stage_key = 'overall') as expected_regular,
       (select code from meta.source where source_id = t.source_id) as source
from core.soccer_tournament t
left join core.soccer_tournament_team cw on cw.tournament_id = t.tournament_id and cw.team_id = t.winner_team_id
left join core.soccer_team cwt on cwt.team_id = t.winner_team_id
left join core.soccer_tournament_team cr on cr.tournament_id = t.tournament_id and cr.team_id = t.runner_up_team_id
left join core.soccer_team crt on crt.team_id = t.runner_up_team_id
left join core.soccer_tournament_team cs on cs.tournament_id = t.tournament_id and cs.team_id = t.shield_team_id
left join core.soccer_team cst on cst.team_id = t.shield_team_id
left join lateral (select m.* from core.soccer_match m where m.tournament_id = t.tournament_id and m.stage_key = 'final'
                    order by m.match_date desc, m.match_id desc limit 1) f on true
where t.league_code = 'mls';

-- one row per club per season: the name, the conference, the home stadium, the regular-season record (the overall table) and the playoff result
create or replace view api.mls_season_teams as
select tt.tournament_id, t.year, tt.team_id, c.slug as team_slug, tt.team_name, tt.conference, tt.venue_name, tt.venue_city, tt.venue_wikidata_id,
       tt.performance, tt.final_position,
       o.position as overall_position, o.played, o.wins, o.shootout_wins, o.draws, o.losses, o.goals_for, o.goals_against, o.goal_difference, o.points,
       coalesce(t.shield_team_id = tt.team_id, false) as shield, coalesce(t.winner_team_id = tt.team_id, false) as champion
from core.soccer_tournament_team tt
join core.soccer_tournament t using (tournament_id)
join core.soccer_team c on c.team_id = tt.team_id
left join core.soccer_group_standing o on o.tournament_id = tt.tournament_id and o.team_id = tt.team_id and o.stage_key = 'overall'
where t.league_code = 'mls';

-- the names a club carried, one row per run of seasons under the same name
create or replace view api.mls_club_names as
select y.team_id, y.team_name as name, min(y.year)::int as from_year, max(y.year)::int as to_year
from (select x.*, sum(x.changed) over (partition by x.team_id order by x.year) as run
        from (select tt.team_id, tt.team_name, t.year,
                     case when tt.team_name is distinct from lag(tt.team_name) over (partition by tt.team_id order by t.year) then 1 else 0 end as changed
                from core.soccer_tournament_team tt join core.soccer_tournament t using (tournament_id)
               where t.league_code = 'mls') x) y
group by y.team_id, y.team_name, y.run;

-- one row per MLS club
create or replace view api.mls_clubs as
select c.team_id, c.slug, c.name, c.country_code, c.wikidata_id,
       min(t.year)::int as first_year, max(t.year)::int as last_year, count(*)::int as seasons,
       count(*) filter (where t.winner_team_id = c.team_id)::int as cups,
       count(*) filter (where t.shield_team_id = c.team_id)::int as shields,
       count(*) filter (where t.runner_up_team_id = c.team_id)::int as finals_lost,
       (select tt2.team_name from core.soccer_tournament_team tt2 join core.soccer_tournament t2 using (tournament_id)
         where tt2.team_id = c.team_id and t2.league_code = 'mls' order by t2.year desc limit 1) as latest_name
from core.soccer_team c
join core.soccer_tournament_team tt on tt.team_id = c.team_id
join core.soccer_tournament t on t.tournament_id = tt.tournament_id and t.league_code = 'mls'
where c.kind = 'club'
group by c.team_id, c.slug, c.name, c.country_code, c.wikidata_id;

-- the all-time regular-season table: results from the matches, points as the seasons' own tables give them
create or replace view api.mls_alltime as
select r.team_id, r.seasons, r.played, r.won, r.drawn, r.lost, r.goals_for, r.goals_against, p.points
from (select m.team_id, count(distinct m.tournament_id)::int as seasons, count(*)::int as played,
             count(*) filter (where m.result = 'w')::int as won, count(*) filter (where m.result = 'd')::int as drawn,
             count(*) filter (where m.result = 'l')::int as lost, sum(m.gf)::int as goals_for, sum(m.ga)::int as goals_against
        from api.soccer_team_matches m
       where m.league = 'mls' and m.stage_key = 'regular'
       group by m.team_id) r
left join (select gs.team_id, sum(gs.points)::int as points
             from core.soccer_group_standing gs join core.soccer_tournament t using (tournament_id)
            where t.league_code = 'mls' and gs.stage_key = 'overall' group by gs.team_id) p using (team_id);

create or replace view api.mls_leaders as
select l.tournament_id, t.year, l.category, l.label, l.rank, l.player_name, l.team_id, tt.team_name, c.slug as team_slug, l.value, l.wikidata_id
from core.soccer_season_leader l
join core.soccer_tournament t using (tournament_id)
left join core.soccer_team c on c.team_id = l.team_id
left join core.soccer_tournament_team tt on tt.tournament_id = l.tournament_id and tt.team_id = l.team_id
where t.league_code = 'mls';

grant select on api.soccer_teams, api.soccer_matches, api.soccer_team_matches, api.soccer_standings, api.mls_seasons, api.mls_season_teams, api.mls_club_names,
  api.mls_clubs, api.mls_alltime, api.mls_leaders to anon, authenticated;

commit;

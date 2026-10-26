-- The pages of the European club leagues (docs/soccer-europe.md): two lean views over the tables of migrations 139 and 066/078, add-only.
--   api.soccer_league_seasons  one row per season of a division in ref.soccer_league_system: its name, tier, clubs, regular-season and play-off matches, goals, whether
--                              the season is complete, the champion and runner-up when a source gave them, and whether a league table is held.
--   api.soccer_clubs           one row per club that played in a division of that system: country, years, seasons, titles (the clubs' step between seasons is
--                              api.soccer_club_moves, migration 139).
-- Nothing here touches core.game, core.team_season, core.franchise or any venue table. api.soccer_tournaments (066) is not used: it reads every match and the
-- top scorers of each tournament, which is too much for a list of 300 league seasons.
begin;

create or replace view api.soccer_league_seasons as
select t.tournament_id, t.league_code as league, ln.name as league_name, ln.short_name as league_short, s.system_key, s.tier, s.country_code, t.year, t.name,
       t.team_count, t.complete, t.note, t.start_date, t.end_date,
       (select count(*)::int from core.soccer_match m where m.tournament_id = t.tournament_id and m.stage_key = 'regular') as matches,
       (select count(*)::int from core.soccer_match m where m.tournament_id = t.tournament_id and m.stage_key <> 'regular') as playoff_matches,
       (select coalesce(sum(m.home_goals + m.away_goals), 0)::int from core.soccer_match m where m.tournament_id = t.tournament_id and m.stage_key = 'regular') as goals,
       t.winner_team_id as champion_id, coalesce(cw.team_name, w.name) as champion, w.slug as champion_slug,
       t.runner_up_team_id as runner_up_id, coalesce(cr.team_name, r.name) as runner_up, r.slug as runner_up_slug,
       exists (select 1 from core.soccer_group_standing g where g.tournament_id = t.tournament_id) as has_table,
       (select code from meta.source where source_id = t.source_id) as source
from core.soccer_tournament t
join ref.soccer_league_system s on s.league_code = t.league_code
join lateral (select n.name, n.short_name from ref.league_name n where n.league_code = t.league_code order by upper(n.valid_during) desc nulls first limit 1) ln on true
left join core.soccer_team w on w.team_id = t.winner_team_id
left join core.soccer_tournament_team cw on cw.tournament_id = t.tournament_id and cw.team_id = t.winner_team_id
left join core.soccer_team r on r.team_id = t.runner_up_team_id
left join core.soccer_tournament_team cr on cr.tournament_id = t.tournament_id and cr.team_id = t.runner_up_team_id;

create or replace view api.soccer_clubs as
select c.team_id, c.slug, c.name, c.country_code, c.wikidata_id,
       min(t.year)::int as first_year, max(t.year)::int as last_year, count(*)::int as seasons,
       count(*) filter (where t.winner_team_id = c.team_id and s.tier = 1)::int as titles,
       min(s.tier)::int as best_tier,
       (select tt2.team_name from core.soccer_tournament_team tt2 join core.soccer_tournament t2 using (tournament_id)
          join ref.soccer_league_system s2 on s2.league_code = t2.league_code
         where tt2.team_id = c.team_id order by t2.year desc limit 1) as latest_name,
       min(s.system_key) as system_key
from core.soccer_team c
join core.soccer_tournament_team tt on tt.team_id = c.team_id
join core.soccer_tournament t on t.tournament_id = tt.tournament_id
join ref.soccer_league_system s on s.league_code = t.league_code
where c.kind = 'club'
group by c.team_id, c.slug, c.name, c.country_code, c.wikidata_id;

grant select on api.soccer_league_seasons, api.soccer_clubs to anon, authenticated;

commit;

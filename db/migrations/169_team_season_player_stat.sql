-- Cold reads, part 2 (ticket SPX-810). Add-only: one new view. Apply to DS1 first, then production. The site reads it and, while it is missing (a 404),
-- falls back on the three reads it made before, so the site works before and after. No existing object changes.
--   api.team_season_player_stat   a club season's player statistics with each player's name, positions, countries and championship count
-- It replaces three requests in a row on every club-season page with statistics. The statement finishes in well under a second.

-- api.team_season_player_stat: the roster table of a club season. The site read api.person_stats by team season, then api.player_index and api.people
-- by the person ids that came back (three requests in a row on every club-season page with statistics). A person with statistics but no row in
-- api.player_index is left out, as the page left him out before. The people row is looked up for each row that is read, so a read by team season
-- works out about fifty of them, as the third request did.
create or replace view api.team_season_player_stat as
select ps.team_season_id, ps.person_id, ps.phase, ps.stat_group, ps.games_played, ps.games_started, ps.stats,
       pi.name, pi.position, pi.positions,
       b.nationality_code, b.birth_country_code, b.championship_count
from api.person_stats ps
join api.player_index pi on pi.person_id = ps.person_id
left join lateral (select p.nationality_code, p.birth_country_code, p.championship_count from api.people p where p.person_id = ps.person_id) b on true;
comment on view api.team_season_player_stat is
  'api.person_stats (read by team_season_id) with the player''s name, position and positions from api.player_index and his countries and championship count from api.people: a club season''s roster table in one request (migration 169).';
grant select on api.team_season_player_stat to anon, authenticated;


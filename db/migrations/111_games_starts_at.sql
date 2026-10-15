-- The scheduled start of a game, when a source recorded one. core.game.starts_at has been there since migration 001
-- (timestamptz, UTC). api.games did not expose it, so the scoreboard could show only the date.
-- Add-only: the view keeps every column it had and gains starts_at at the end.
--   starts_at   the scheduled start, UTC. Null when no source recorded a time. Never inferred from the date.
-- On production: apply this file. No data release: it reads a column that is already there.

create or replace view api.games as
select s.league_code as league, s.start_year as year, g.game_id, g.game_date, g.phase::text as phase, g.status::text as status,
       g.away_team_season_id as away_id, api.team_name(g.away_team_season_id) as away, g.away_score,
       g.home_team_season_id as home_id, api.team_name(g.home_team_season_id) as home, g.home_score,
       g.went_to_overtime as overtime, src.code as source,
       (select max(case v.status when 'confirmed' then 1 when 'disputed' then -1 end) from meta.verification v
         where v.entity_kind = 'game' and v.entity_id = g.game_id) as checked,
       (select franchise_id from core.team_season where team_season_id = g.away_team_season_id) as away_f,
       (select franchise_id from core.team_season where team_season_id = g.home_team_season_id) as home_f,
       g.starts_at
from core.game g join core.season s using (season_id) join meta.source src on src.source_id = g.source_id
where g.status <> 'cancelled';

comment on view api.games is 'One row per game that was not cancelled. starts_at is the scheduled start in UTC when a source recorded one, and null when none did. It is never inferred from game_date.';
grant select on api.games to anon, authenticated;

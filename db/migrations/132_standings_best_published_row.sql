-- api.standings: pick the right published row for a team season, and stop showing a stale one. Replaces one live view
-- (create or replace, same columns and types, nothing stored). Rerunnable. Works as anon (the view reads core as its owner).
-- Apply to DS1, then production (item 4), then `refresh materialized view concurrently api.standing_index` (or api.refresh()):
-- api.standing_index is `select ... from api.standings` (036), so it needs no new definition, only a refresh.
--
-- The fault (ticket cmvdqrnqw0006l5068m0oyhko, audited 2026-10-18): the view took, for each team season, the published regular-season
-- row with the LATEST as_of (DISTINCT ON ... ORDER BY as_of DESC). SPX's tables hold several snapshots per team season, and some are
-- dated after the season's own final line:
--   * NHL 1999-2000: every club had an SPX row dated 2004-12-21 (a reload; 57 to 62 games played, a mid-season snapshot) that beat the
--     NHL API's 82-game final line (2000-04-09). All 28 clubs showed 57-62 games, 26 of them with w+l+t+otl not adding up to gp.
--   * NHL 2001-02: SPX's season table went on after the regular season and filed the playoff run (5 to 23 games, as_of 2002-05-01
--     and later) under the same regular-season key; those beat the 82-game final line. 15 of 30 clubs showed 5-23 games.
--   * NHL 2026-27 (season in progress): the published row is the NHL API's standing of 2026-10-09 (3-6 games); the daily job has since
--     loaded 5-8 final games per club into core.game. The standings stayed on the old snapshot. (The 84 games per club in the 2026-27
--     schedule are real: game ids 2026020001 to 2026021344 are all NHL game type 02, regular season; there is no preseason game
--     labelled regular. Preseason is never stored as regular in the NHL build: 145 maps every game_type other than 2 to playoffs, and
--     the daily job drops preseason claims.)
-- Proved on production 2026-10-18 (select only): nhl 1999 28 of 28 clubs and nhl 2001 15 of 30 change, nhl 2026 32 of 32 move to the
-- scores; no other league and season changes row source, except cfl 2003 (2 clubs: a later row with fewer games than the earlier one).
--
-- The rule now:
--   1. among a team season's published regular-season rows take the one with the most games played, then the latest as_of (a later
--      snapshot never beats a longer record; a playoff run or a mid-season reload has fewer games than the final line);
--   2. that row is dropped in favour of the team season's own final scores only when the scores are clearly newer: they hold more final
--      regular-season games than the row, the latest of them is dated after the row's as_of, and they do not exceed the season's
--      scheduled games per team (a season with no games_per_team set is not capped). This is the season in progress, whose published
--      snapshot stops growing. Where the games table holds extra or duplicated games (NBA play-in, a game filed twice) the count is above
--      games_per_team or not newer than the standing, so the published row stands.
-- The old rules stay: final regular-season games only, the NHL's overtime and shootout losses apart from 1999-2000 on, and a team
-- season with neither a usable published row nor a final regular-season game is not listed. Idea of the lateral term: 085.

create or replace view api.standings as
 WITH pub AS (
         SELECT DISTINCT ON (standing.team_season_id) standing.team_season_id,
            standing.phase, standing.as_of, standing.source_id, standing.games_played, standing.wins, standing.losses, standing.ties,
            standing.ot_losses, standing.points, standing.points_for, standing.points_against, standing.home_record, standing.road_record,
            standing.last_ten, standing.streak, standing.division_rank, standing.games_behind, standing.source_key
           FROM core.standing
          WHERE standing.phase = 'regular'::core.season_phase
          ORDER BY standing.team_season_id, standing.games_played DESC NULLS LAST, standing.as_of DESC
        )
 SELECT s.league_code AS league,
    s.start_year AS year,
    ts.team_season_id AS team_id,
    ts.franchise_id,
    api.team_name(ts.team_season_id) AS team,
    COALESCE(p.games_played::bigint, c.games_played) AS gp,
    COALESCE(p.wins::bigint, c.wins) AS w,
    COALESCE(p.losses::bigint, c.losses) AS l,
    COALESCE(p.ties::bigint, NULLIF(c.ties, 0)) AS t,
    COALESCE(p.ot_losses::bigint, NULLIF(c.ot_losses, 0)) AS otl,
    COALESCE(p.points::bigint, c.points) AS pts,
    COALESCE(p.points_for::bigint, c.points_for) AS pf,
    COALESCE(p.points_against::bigint, c.points_against) AS pa,
    COALESCE(p.home_record, c.home_record) AS home,
    COALESCE(p.road_record, c.road_record) AS road,
    round(COALESCE(p.wins::bigint, c.wins)::numeric / NULLIF(COALESCE(p.wins::bigint, c.wins) + COALESCE(p.losses::bigint, c.losses) + COALESCE(p.ot_losses::bigint, NULLIF(c.ot_losses, 0), 0::bigint), 0)::numeric, 3) AS pct,
        CASE
            WHEN p.team_season_id IS NOT NULL THEN 'published'::text
            ELSE 'scores'::text
        END AS basis,
    ( SELECT source.code
           FROM meta.source
          WHERE source.source_id = p.source_id) AS source,
    cf.name AS conference,
    cf.short_name AS conference_short,
    dv.name AS division,
    dv.short_name AS division_short
   FROM core.team_season ts
     JOIN core.season s USING (season_id)
     LEFT JOIN LATERAL (
        SELECT count(*) AS games_played,
               max(x.game_date) AS last_game,
               count(*) FILTER (WHERE x.pf > x.pa) AS wins,
               count(*) FILTER (WHERE x.pf < x.pa AND NOT (s.league_code = 'nhl' AND s.start_year >= 1999
                                                          AND COALESCE(x.went_to_overtime OR x.decided_by_shootout, false))) AS losses,
               count(*) FILTER (WHERE x.pf = x.pa) AS ties,
               count(*) FILTER (WHERE x.pf < x.pa AND s.league_code = 'nhl' AND s.start_year >= 1999
                                      AND COALESCE(x.went_to_overtime OR x.decided_by_shootout, false)) AS ot_losses,
               CASE WHEN s.league_code = 'nhl' THEN
                 2 * count(*) FILTER (WHERE x.pf > x.pa) + count(*) FILTER (WHERE x.pf = x.pa)
                 + count(*) FILTER (WHERE x.pf < x.pa AND s.start_year >= 1999 AND COALESCE(x.went_to_overtime OR x.decided_by_shootout, false))
               END AS points,
               sum(x.pf) AS points_for, sum(x.pa) AS points_against,
               count(*) FILTER (WHERE x.at_home AND x.pf > x.pa) || '-' || count(*) FILTER (WHERE x.at_home AND x.pf < x.pa) AS home_record,
               count(*) FILTER (WHERE NOT x.at_home AND x.pf > x.pa) || '-' || count(*) FILTER (WHERE NOT x.at_home AND x.pf < x.pa) AS road_record
          FROM (SELECT g.home_score AS pf, g.away_score AS pa, g.went_to_overtime, g.decided_by_shootout, true AS at_home, g.game_date
                  FROM core.game g
                 WHERE g.home_team_season_id = ts.team_season_id AND g.status = 'final' AND g.phase = 'regular'::core.season_phase
                UNION ALL
                SELECT g.away_score, g.home_score, g.went_to_overtime, g.decided_by_shootout, false, g.game_date
                  FROM core.game g
                 WHERE g.away_team_season_id = ts.team_season_id AND g.status = 'final' AND g.phase = 'regular'::core.season_phase) x
        HAVING count(*) > 0
     ) c ON true
     LEFT JOIN pub ON pub.team_season_id = ts.team_season_id
     LEFT JOIN LATERAL (
        SELECT pub.team_season_id, pub.source_id, pub.games_played, pub.wins, pub.losses, pub.ties, pub.ot_losses, pub.points,
               pub.points_for, pub.points_against, pub.home_record, pub.road_record
         WHERE pub.team_season_id IS NOT NULL
           AND NOT COALESCE(c.games_played > pub.games_played
                            AND c.last_game > pub.as_of
                            AND (s.games_per_team IS NULL OR c.games_played <= s.games_per_team), false)
     ) p ON true
     LEFT JOIN core.conference cf ON cf.conference_id = ts.conference_id
     LEFT JOIN core.division dv ON dv.division_id = ts.division_id
  WHERE p.team_season_id IS NOT NULL OR c.games_played IS NOT NULL;

grant select on api.standings to anon, authenticated;

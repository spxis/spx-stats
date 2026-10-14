-- View rewrite of api.standings and api.team_seasons (same columns, types and rows). Production needs John's go (it replaces two
-- live views; nothing is stored, no table or index is added). Needs 028_api_alignment.sql. Rerunnable.
--
-- Both views joined core.standing_from_games, which adds up every final game side (738,550 on 2026-10-14) before the join, so a read
-- of one team or one season still aggregated all of them: about 1 s a call in production (pg_stat_statements 2026-10-14: about
-- 9,000 calls, 6 s under load). The filter on league, year or franchise never reached the aggregation. Here each team season adds
-- up its own games from core.game_home_idx and core.game_away_idx (a lateral subquery), so a filtered read touches only the games
-- of the team seasons it returns: league+year 6.4 s to 60 ms, one franchise (109 seasons) 0.8 s to 36 ms, planner cost about 20 to
-- 100 times lower. The price is a read of the whole view with no filter: about 2.4 s instead of about 0.8 s (a league with 3,000
-- team seasons is about even). The materialized api.standing_index and api.team_season_index keep the query they were created
-- from, so their refresh in api.refresh() is not slowed.
-- The lateral term keeps the old rules: final games, regular season, the NHL's overtime and shootout losses counted apart from
-- 1999-2000 on, and a team season with no final regular-season game has no record (the old left join gave NULLs; api.standings
-- still lists it only when it has a published standing). The league and year come from the team season's own season; check
-- 010_game_orphans keeps every game in the season of its two team seasons, so they equal the game's season as before.
-- Proved equal on production 2026-10-14: both full views, old minus new and new minus old, 0 rows (8,871 standings, 8,913 team seasons).
-- The site reads the precomputed api.standing_index and api.team_season_index (036), so this mainly speeds the direct reads of
-- the live views (the fallback while those are missing, and anyone calling the public API).
--
-- api.person_career_totals (032) is not rewritten: the site stopped reading it when the player page moved to api.person_stats
-- (e98f4fa), nothing else in the repository uses it.

create or replace view api.standings as
 WITH pub AS (
         SELECT DISTINCT ON (standing.team_season_id) standing.team_season_id,
            standing.phase, standing.as_of, standing.source_id, standing.games_played, standing.wins, standing.losses, standing.ties,
            standing.ot_losses, standing.points, standing.points_for, standing.points_against, standing.home_record, standing.road_record,
            standing.last_ten, standing.streak, standing.division_rank, standing.games_behind, standing.source_key
           FROM core.standing
          WHERE standing.phase = 'regular'::core.season_phase
          ORDER BY standing.team_season_id, standing.as_of DESC
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
     LEFT JOIN pub p USING (team_season_id)
     LEFT JOIN LATERAL (
        SELECT count(*) AS games_played,
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
          FROM (SELECT g.home_score AS pf, g.away_score AS pa, g.went_to_overtime, g.decided_by_shootout, true AS at_home
                  FROM core.game g
                 WHERE g.home_team_season_id = ts.team_season_id AND g.status = 'final' AND g.phase = 'regular'::core.season_phase
                UNION ALL
                SELECT g.away_score, g.home_score, g.went_to_overtime, g.decided_by_shootout, false
                  FROM core.game g
                 WHERE g.away_team_season_id = ts.team_season_id AND g.status = 'final' AND g.phase = 'regular'::core.season_phase) x
        HAVING count(*) > 0
     ) c ON true
     LEFT JOIN core.conference cf ON cf.conference_id = ts.conference_id
     LEFT JOIN core.division dv ON dv.division_id = ts.division_id
  WHERE p.team_season_id IS NOT NULL OR c.games_played IS NOT NULL;

create or replace view api.team_seasons as
 SELECT s.league_code AS league,
    s.start_year AS year,
    ts.franchise_id,
    api.team_name(ts.team_season_id) AS team,
    c.wins AS w,
    c.losses AS l,
    c.ties AS t,
    c.ot_losses AS otl,
    (EXISTS ( SELECT 1
           FROM core.award_winner w
             JOIN core.award a USING (award_id)
          WHERE a.kind = 'championship'::core.award_kind AND w.team_season_id = ts.team_season_id)) AS champion,
    cf.name AS conference,
    cf.short_name AS conference_short,
    dv.name AS division,
    dv.short_name AS division_short
   FROM core.team_season ts
     JOIN core.season s USING (season_id)
     LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE x.pf > x.pa) AS wins,
               count(*) FILTER (WHERE x.pf < x.pa AND NOT (s.league_code = 'nhl' AND s.start_year >= 1999
                                                          AND COALESCE(x.went_to_overtime OR x.decided_by_shootout, false))) AS losses,
               count(*) FILTER (WHERE x.pf = x.pa) AS ties,
               count(*) FILTER (WHERE x.pf < x.pa AND s.league_code = 'nhl' AND s.start_year >= 1999
                                      AND COALESCE(x.went_to_overtime OR x.decided_by_shootout, false)) AS ot_losses
          FROM (SELECT g.home_score AS pf, g.away_score AS pa, g.went_to_overtime, g.decided_by_shootout
                  FROM core.game g
                 WHERE g.home_team_season_id = ts.team_season_id AND g.status = 'final' AND g.phase = 'regular'::core.season_phase
                UNION ALL
                SELECT g.away_score, g.home_score, g.went_to_overtime, g.decided_by_shootout
                  FROM core.game g
                 WHERE g.away_team_season_id = ts.team_season_id AND g.status = 'final' AND g.phase = 'regular'::core.season_phase) x
        HAVING count(*) > 0
     ) c ON true
     LEFT JOIN core.conference cf ON cf.conference_id = ts.conference_id
     LEFT JOIN core.division dv ON dv.division_id = ts.division_id;

grant select on api.standings, api.team_seasons to anon, authenticated;

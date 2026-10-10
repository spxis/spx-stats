-- The public API for league alignment: conferences, divisions and how they changed. Filled by
-- db/build/pending/178_alignment.sql. Columns are only ever appended to the two views that already existed.
--   api.standings / api.team_seasons   + conference, conference_short, division, division_short
--   api.alignment                      one row per club per season: where it sat
--   api.alignment_changes              one row per club per season in which that place differs from its previous season
--                                      (a first season in a league that already had an alignment has no "from")
--   api.standings_as_of(league, year, date)
--                                      the regular-season table as it stood after the games of a date, worked out from
--                                      the final scores in core.game; same columns as api.standings, plus the alignment
-- "conference" is the league in MLB (American / National League), the conference in the NFL, NBA and NHL, and East / West
-- in the CFL. "division" is empty in seasons without divisions.

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
     LEFT JOIN core.standing_from_games c ON c.team_season_id = ts.team_season_id AND c.phase = 'regular'::core.season_phase
     LEFT JOIN core.conference cf ON cf.conference_id = ts.conference_id
     LEFT JOIN core.division dv ON dv.division_id = ts.division_id
  WHERE p.team_season_id IS NOT NULL OR c.team_season_id IS NOT NULL;

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
     LEFT JOIN core.standing_from_games c ON c.team_season_id = ts.team_season_id AND c.phase = 'regular'::core.season_phase
     LEFT JOIN core.conference cf ON cf.conference_id = ts.conference_id
     LEFT JOIN core.division dv ON dv.division_id = ts.division_id;

create or replace view api.alignment as
select s.league_code as league, s.start_year as year, cf.name as conference, dv.name as division,
       ts.franchise_id, api.team_name(ts.team_season_id) as team,
       cf.short_name as conference_short, dv.short_name as division_short, ts.team_season_id as team_id
from core.team_season ts join core.season s using (season_id)
left join core.conference cf on cf.conference_id = ts.conference_id
left join core.division dv on dv.division_id = ts.division_id
where ts.conference_id is not null or ts.division_id is not null;

create or replace view api.alignment_changes as
with a as (
  select s.league_code, s.start_year, ts.franchise_id, ts.team_season_id, ts.conference_id, ts.division_id,
         lag(s.start_year) over w as prev_year, lag(ts.conference_id) over w as prev_conference_id, lag(ts.division_id) over w as prev_division_id,
         lag(ts.team_season_id) over w as prev_team_season_id
  from core.team_season ts join core.season s using (season_id)
  window w as (partition by ts.franchise_id order by s.start_year))
select a.league_code as league, a.start_year as year, a.franchise_id, api.team_name(a.team_season_id) as team,
       pc.name as from_conference, pd.name as from_division, cf.name as to_conference, dv.name as to_division,
       a.prev_year as from_year, pc.short_name as from_conference_short, pd.short_name as from_division_short,
       cf.short_name as to_conference_short, dv.short_name as to_division_short
from a
left join core.conference cf on cf.conference_id = a.conference_id
left join core.division dv on dv.division_id = a.division_id
left join core.conference pc on pc.conference_id = a.prev_conference_id
left join core.division pd on pd.division_id = a.prev_division_id
where (a.conference_id is not null or a.division_id is not null)
  and ( (a.prev_year is not null and (a.conference_id is distinct from a.prev_conference_id or a.division_id is distinct from a.prev_division_id)
         and (a.prev_conference_id is not null or a.prev_division_id is not null))
     or (a.prev_year is null or (a.prev_conference_id is null and a.prev_division_id is null))
        and exists (select 1 from core.team_season t2 join core.season s2 using (season_id)
                    where s2.league_code = a.league_code and s2.start_year < a.start_year
                      and s2.start_year = (select max(s3.start_year) from core.season s3 where s3.league_code = a.league_code and s3.start_year < a.start_year)
                      and (t2.conference_id is not null or t2.division_id is not null)) );

grant select on api.alignment, api.alignment_changes to anon, authenticated;
grant select on api.standings, api.team_seasons to anon, authenticated;

-- The table after the games of a date. Counts only final regular-season games of that season played on or before the date
-- (the same rules as core.standing_from_games), so the last date of a season equals the table built from scores.
create or replace function api.standings_as_of(p_league text, p_year integer, p_date date)
returns table (league text, year smallint, team_id integer, franchise_id integer, team text, gp bigint, w bigint, l bigint, t bigint, otl bigint,
               pts bigint, pf bigint, pa bigint, home text, road text, pct numeric, basis text, source text,
               conference text, conference_short text, division text, division_short text)
language sql stable security definer set search_path = pg_catalog
as $$
  with se as (select season_id, league_code, start_year from core.season where league_code = p_league and start_year = p_year),
  side as (
    select g.home_team_season_id as ts, g.home_score as pf, g.away_score as pa, g.went_to_overtime as ot, g.decided_by_shootout as so, true as at_home
    from core.game g join se on se.season_id = g.season_id where g.status = 'final' and g.phase = 'regular' and g.game_date <= p_date
    union all
    select g.away_team_season_id, g.away_score, g.home_score, g.went_to_overtime, g.decided_by_shootout, false
    from core.game g join se on se.season_id = g.season_id where g.status = 'final' and g.phase = 'regular' and g.game_date <= p_date),
  agg as (
    select ts, count(*) gp, count(*) filter (where pf > pa) w,
           count(*) filter (where pf < pa and not (p_league = 'nhl' and p_year >= 1999 and coalesce(ot or so, false))) l,
           count(*) filter (where pf = pa) t,
           count(*) filter (where pf < pa and p_league = 'nhl' and p_year >= 1999 and coalesce(ot or so, false)) otl,
           sum(pf) pf, sum(pa) pa,
           (count(*) filter (where at_home and pf > pa) || '-') || count(*) filter (where at_home and pf < pa) home,
           (count(*) filter (where not at_home and pf > pa) || '-') || count(*) filter (where not at_home and pf < pa) road
    from side group by ts)
  select se.league_code, se.start_year, t.team_season_id, t.franchise_id, api.team_name(t.team_season_id),
         a.gp, a.w, a.l, nullif(a.t, 0)::bigint, nullif(a.otl, 0)::bigint,
         case when p_league = 'nhl' then 2 * a.w + a.t + a.otl end::bigint, a.pf::bigint, a.pa::bigint, a.home, a.road,
         round(a.w::numeric / nullif(a.w + a.l + a.otl, 0)::numeric, 3), 'as_of'::text, 'games'::text,
         cf.name, cf.short_name, dv.name, dv.short_name
  from agg a join core.team_season t on t.team_season_id = a.ts join se on se.season_id = t.season_id
  left join core.conference cf on cf.conference_id = t.conference_id
  left join core.division dv on dv.division_id = t.division_id
$$;
revoke all on function api.standings_as_of(text, integer, date) from public;
grant execute on function api.standings_as_of(text, integer, date) to anon, authenticated;

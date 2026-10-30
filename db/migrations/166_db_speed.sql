-- DB speed (ticket SPX-800), found by the weight crawl of 2026-10-30. Add-only: three new views, one new materialized view, and one view
-- (api.alignment_changes) that keeps its name and columns but is now a precomputed table. Apply to DS1 first, then production. The site reads
-- every new object and falls back to what it read before while the object is missing (a 404), so the site works before and after.
--   api.alignment_changes          view -> materialized view, same columns, unique on (league, year, franchise_id). api.refresh() rebuilds it.
--   api.franchise_season_games     new view: a club's regular-season and playoff games, one row for each season (one read for a whole franchise)
--   api.venue_city                 new view: the city page of each venue point (262 rows; the full api.team_season_city is ~12,000)
--   api.team_season_name_run       new materialized view: a club's name over its seasons as unbroken runs (1,459 rows; api.team_season_index is 17,882)
--   api.venue_soccer_span          new view: the matches each stadium staged, one row for each stadium and competition (api.soccer_matches is ~10,000)
-- Each statement finishes in well under a second on a scratch copy at full volume.

-- (1) api.alignment_changes becomes a precomputed table.
create materialized view api.alignment_changes_new as
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
create unique index alignment_changes_new_key on api.alignment_changes_new (league, year, franchise_id);
analyze api.alignment_changes_new;

drop view api.alignment_changes;
alter materialized view api.alignment_changes_new rename to alignment_changes;
alter index api.alignment_changes_new_key rename to alignment_changes_key;
comment on materialized view api.alignment_changes is
  'One row per club per season in which its conference or division differs from its previous season (a first season in a league that already had an alignment has no "from"). Precomputed (migration 166): api.refresh() rebuilds it after the places in core.team_season change.';
grant select on api.alignment_changes to anon, authenticated;

-- (2) api.franchise_season_games: a club's games, one row for each season, in one read.
create or replace view api.franchise_season_games as
select s.league_code as league, ts.franchise_id, s.start_year as year,
       api.team_name(ts.team_season_id) as own,
       coalesce(x.games, '[]'::jsonb) as games
from core.team_season ts
join core.season s on s.season_id = ts.season_id
cross join lateral (
  select jsonb_agg(jsonb_build_array(g.game_id, g.game_date, g.status, g.phase, g.at_home, g.mine, g.theirs, g.ot, coalesce((select i.full_name from core.team_season t join core.franchise_identity i on i.franchise_identity_id = t.franchise_identity_id where t.team_season_id = g.opp_id),
                                                                                                                                api.team_name(g.opp_id)))
                   order by g.game_date, g.game_id) as games
  from (
    select h.game_id, h.game_date, h.status::text as status, h.phase::text as phase, 1 as at_home, h.home_score as mine, h.away_score as theirs,
           case when h.went_to_overtime then 1 else 0 end as ot, h.away_team_season_id as opp_id
    from core.game h
    where h.home_team_season_id = ts.team_season_id and h.status <> 'cancelled' and h.phase in ('regular', 'playoffs')
    union all
    select a.game_id, a.game_date, a.status::text, a.phase::text, 0, a.away_score, a.home_score,
           case when a.went_to_overtime then 1 else 0 end, a.home_team_season_id
    from core.game a
    where a.away_team_season_id = ts.team_season_id and a.status <> 'cancelled' and a.phase in ('regular', 'playoffs')
  ) g) x;
comment on view api.franchise_season_games is
  'For each club season: the club''s name that season and its games as arrays [game id, date, status, phase, 1 if at home, its score, the other score, 1 if it went to overtime, the other club''s name], in play order. Cancelled games, preseason and exhibition games are left out; a season with none has an empty list. Read with league and franchise_id: one request holds a whole franchise (migration 166).';
grant select on api.franchise_season_games to anon, authenticated;


-- (3a) api.venue_city: the city page of each venue, by the venue's coordinates.
create or replace view api.venue_city as
select distinct venue_latitude as latitude, venue_longitude as longitude, venue_city_slug
from core.team_season_city
where venue_latitude is not null and venue_longitude is not null and venue_city_slug is not null;
comment on view api.venue_city is
  'One row for each venue point (latitude, longitude) that club seasons were placed at, with the city page of that point (migration 166). api.team_season_city, whole, holds the same fact in ~12,000 rows.';
grant select on api.venue_city to anon, authenticated;

-- (3b) api.team_season_name_run: each club's name over its seasons, as unbroken runs.
create materialized view api.team_season_name_run as
with t as (
  select league, year, franchise_id, team,
         case when lag(year) over w = year - 1 and lag(team) over w is not distinct from team then 0 else 1 end as brk
  from api.team_season_index
  window w as (partition by league, franchise_id order by year)),
g as (
  select *, sum(brk) over (partition by league, franchise_id order by year) as run from t)
select league, franchise_id, team, min(year) as from_year, max(year) as to_year
from g
group by league, franchise_id, run, team;
create unique index team_season_name_run_key on api.team_season_name_run (league, franchise_id, from_year);
comment on materialized view api.team_season_name_run is
  'Each club''s name over its seasons as unbroken runs (consecutive seasons under one name; a missing year ends a run). Holds the same facts as api.team_season_index in ~1/10 of the rows, for the address table. Refreshed by api.refresh() after api.team_season_index (migration 166).';
analyze api.team_season_name_run;
grant select on api.team_season_name_run to anon, authenticated;
-- (3c) api.venue_soccer_span: the matches each stadium staged, by competition. Made only where the soccer views exist.
do $$
begin
  if to_regclass('api.soccer_matches') is not null then
    execute $v$
      create or replace view api.venue_soccer_span as
      select venue_id, league, min(year) as first_year, max(year) as last_year, count(*) as matches
      from api.soccer_matches
      where venue_id is not null
      group by venue_id, league $v$;
    execute $v$ comment on view api.venue_soccer_span is 'For each stadium and competition: the first and last year and the number of matches staged there (migration 166). Read by the venue pages instead of every match of api.soccer_matches.' $v$;
    execute 'grant select on api.venue_soccer_span to anon, authenticated';
  end if;
end $$;

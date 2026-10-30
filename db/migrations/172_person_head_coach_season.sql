-- Cold reads, part 2 (ticket SPX-810). Add-only: one new view. Apply to DS1 first, then production. The site reads it and, while it is missing (a 404), falls
-- back on api.team_season_staff, so the site works before and after. No existing object changes.
--   api.person_head_coach_season   view: a person's head-coach seasons, without the window api.team_season_staff numbers rows with
-- The missing index the ticket suspected is not missing: core.roster_stint has one on person_id. The window is what stops it being used.
-- The statement finishes in well under a second.

-- api.team_season_staff numbers each club season's staff with row_number() over (partition by team_season_id ...). A condition on person_id cannot go
-- below a window, so `person_id = N` first numbered every head coach and captain of every season (about 15,000 rows) and then kept the person's: 75 to 125 ms
-- for two bytes when the person coached nothing, on every player page. core.roster_stint has the index (person_id); this view has no window, so it is used.
-- The columns are api.team_season_staff's for head coaches, without `ord`.
create or replace view api.person_head_coach_season as
select r.team_season_id,
       s.league_code as league,
       s.start_year as year,
       ts.franchise_id,
       'head_coach'::text as role,
       r.person_id,
       p.full_name as name,
       p.kind,
       lower(r.valid_during) as first_on,
       upper(r.valid_during) - 1 as last_on,
       src.code as source
from core.roster_stint r
join core.team_season ts using (team_season_id)
join core.season s using (season_id)
join core.person p using (person_id)
left join meta.source src on src.source_id = r.source_id
where r.role = 'head_coach';
comment on view api.person_head_coach_season is
  'The head-coach rows of api.team_season_staff (managers in baseball) without the row number, so a read by person_id uses the index of core.roster_stint (migration 172).';
grant select on api.person_head_coach_season to anon, authenticated;

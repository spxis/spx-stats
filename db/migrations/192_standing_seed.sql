-- Playoff seeds, as the sources state them. Add-only: one new plain view, api.standing_seed (no stored rows, so no space on production).
-- core.standing.seed (NFL standings from Wikipedia, build 151) and core.team_season.playoff_seed already hold seeds where a source printed one; no api
-- view exposed either, so a bracket could not show seed tags (C1, WC2, 1st ...). One row for each team season that has a seed: the seed of its latest
-- final regular-season standing that states one, else the team season's own playoff_seed. Nothing is derived: a team season without a stated seed has no row.
-- The site reads it for bracket seed tags and, while it is missing (a 404), draws the brackets without tags, so the site works before and after.
-- Apply to DS1 first, then production. Works as anon (the view reads core as its owner).

create or replace view api.standing_seed as
select s.league_code as league, s.start_year as year, ts.team_season_id as team_id, ts.franchise_id,
       coalesce(st.seed, ts.playoff_seed)::int as seed,
       (select src.code from meta.source src where src.source_id = coalesce(st.source_id, ts.source_id)) as source
from core.team_season ts
join core.season s using (season_id)
left join lateral (
  select x.seed, x.source_id
  from core.standing x
  where x.team_season_id = ts.team_season_id and x.phase = 'regular' and x.seed is not null
  order by x.is_final desc, x.as_of desc
  limit 1) st on true
where coalesce(st.seed, ts.playoff_seed) is not null;

comment on view api.standing_seed is 'The playoff seed of a team season where a source states one (core.standing.seed, else core.team_season.playoff_seed); no row where none is stated. Never derived.';
grant select on api.standing_seed to anon, authenticated;

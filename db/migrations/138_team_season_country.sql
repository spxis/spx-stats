-- The country of a team season that has no city (migration 062 holds the cities): core.team_season_country, read by api.team_season_country.
-- A club always has a country; its city may be unknown (a name that is a state or a region, a merged club, a season the archive names no club for).
-- basis: 'identity' (the country on the club's identity that season, core.franchise_identity.country_code) or 'league_season' (the identity names
-- none, and every other club of that league season with a known country is in the same one). Filled by db/build/197_city.sql, only for seasons
-- core.team_season_city does not hold. No city is guessed.
-- On production: apply this file, then a data release of core.team_season_country with ref.city, ref.city_alias, ref.metro and core.team_season_city (AGENTS.md section 8, item 5).
-- Rerunnable.

create table if not exists core.team_season_country (
  team_season_id  integer primary key references core.team_season on delete cascade,
  country_code    text not null check (country_code ~ '^[A-Z]{2}$'),
  basis           text not null check (basis in ('identity', 'league_season'))
);
comment on table core.team_season_country is 'The country of each team season that has no city in core.team_season_city. Built by db/build/197_city.sql.';

create or replace view api.team_season_country as
select s.league_code as league,
       s.start_year as year,
       ts.franchise_id,
       c.country_code,
       c.basis
from core.team_season_country c
join core.team_season ts using (team_season_id)
join core.season s using (season_id);
comment on view api.team_season_country is 'The country of a club season whose city is not known (basis: identity or league_season). Migration 138.';

grant select on api.team_season_country to anon, authenticated;

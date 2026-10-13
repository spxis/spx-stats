-- Cities: which club played in which city in each season, for the city pages (/city/<slug>) and the cities list (/cities).
-- The model is data, not code (see scripts/city/README.md for the rules and the metro decisions):
--   ref.metro            a metro area: a name for the cities that make up one urban area (Los Angeles, Anaheim and Inglewood). A grouping only:
--                        every city keeps its own page; the metro is used to list the clubs around a city and to rank metro areas.
--   ref.city             a city, one row per page: slug, name (and the French name where it differs), ISO 3166-2 region, country,
--                        Wikidata item and coordinates (Wikidata, CC0), the metro area it belongs to. Filled by db/build/197_city.sql
--                        from db/seed/metro.csv, db/seed/city.csv and db/seed/city_place.csv.
--   ref.city_alias       every spelling of a place name that appears in the data (core.franchise_identity.location, core.brand_venue.city)
--                        and the city it means, keyed by core.fold_text() of the spelling ("Montréal" and "Montreal" are one row).
--                        db/seed/city_alias.csv. A name without a row names no city (Minnesota, Golden State, Tampa Bay: regions) and
--                        a club under such a name is placed by its venue.
--   core.team_season_city  the city of each team season and how it was found: 'identity' (the city in the club's name that season),
--                        'venue' (the club's name has no city, so the city of the home venue that covers the season), 'venue_nearest'
--                        (the same, but the nearest era with a venue in the same state or province). Also the venue itself, for the map.
--                        Filled by db/build/197_city.sql; a season it cannot place is left out and logged in meta.data_issue.
-- core.fold_text is repeated from 037 so the build step runs wherever this migration does (the same text; harmless to run again).
-- On production: apply this file, then a data release of ref.metro, ref.city, ref.city_alias and core.team_season_city (AGENTS.md section 8, item 5).
-- Rerunnable.

create or replace function core.fold_text(t text) returns text language sql immutable parallel safe as $$
  select btrim(regexp_replace(replace(replace(replace(translate(
    regexp_replace(lower(normalize(t, nfd)), '[̀-ͯ.''’]', '', 'g'),
    'øłđðı', 'olddi'), 'æ', 'ae'), 'œ', 'oe'), 'ß', 'ss'), '[^[:alnum:]]+', ' ', 'g'))
$$;

create table if not exists ref.metro (
  slug     text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name     text not null,
  name_fr  text,
  note     text
);
comment on table ref.metro is 'A metro area: a named grouping of cities. Cities keep their own pages; the metro lists and ranks them together.';

create table if not exists ref.city (
  slug          text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text not null,
  name_fr       text,
  region        text not null,          -- ISO 3166-2, e.g. CA-BC, US-CA
  country_code  text not null references ref.country,
  metro_slug    text references ref.metro,
  wikidata_id   text,                   -- the city's Wikidata item (CC0)
  latitude      numeric(8, 5) check (latitude between -90 and 90),
  longitude     numeric(8, 5) check (longitude between -180 and 180),
  note          text
);
comment on table ref.city is 'A city with its own page on the site. Coordinates and Wikidata item are from Wikidata (CC0); the metro area is an editorial decision (db/seed/city.csv).';
create index if not exists city_metro_idx on ref.city (metro_slug);

create table if not exists ref.city_alias (
  alias_fold  text primary key,         -- core.fold_text(alias)
  alias       text not null,
  city_slug   text not null references ref.city,
  note        text
);
comment on table ref.city_alias is 'Every spelling of a place name found in the data and the city it means; a name that is not here names no city.';

create table if not exists core.team_season_city (
  team_season_id    integer primary key references core.team_season on delete cascade,
  city_slug         text not null references ref.city,
  basis             text not null check (basis in ('identity', 'venue', 'venue_nearest')),
  venue_label       text,               -- the home venue of that season (core.franchise_brand.home_venue) and where it stands
  venue_latitude    numeric(8, 5),
  venue_longitude   numeric(8, 5),
  venue_city_slug   text references ref.city
);
comment on table core.team_season_city is 'The city each team season belongs to: the city in the club''s name, else the city of its home venue. Built by db/build/197_city.sql.';
create index if not exists team_season_city_city_idx on core.team_season_city (city_slug);

create or replace view api.city as
select c.slug, c.name, c.name_fr, c.region, c.country_code, c.latitude, c.longitude, c.wikidata_id,
       c.metro_slug, m.name as metro_name, m.name_fr as metro_name_fr
from ref.city c
left join ref.metro m on m.slug = c.metro_slug;
comment on view api.city is 'The cities with a page: name, region, country, coordinates and metro area.';

create or replace view api.team_season_city as
select s.league_code as league,
       s.start_year as year,
       ts.franchise_id,
       c.city_slug,
       c.basis,
       c.venue_label as home_venue,
       c.venue_latitude as latitude,
       c.venue_longitude as longitude,
       c.venue_city_slug
from core.team_season_city c
join core.team_season ts using (team_season_id)
join core.season s using (season_id);
comment on view api.team_season_city is 'The city of each club season (basis: identity, venue or venue_nearest) and the home venue of the season with its coordinates.';

grant select on api.city, api.team_season_city to anon, authenticated;

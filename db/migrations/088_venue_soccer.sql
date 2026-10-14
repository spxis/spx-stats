-- Venue pages for the world soccer stadiums: the facts of every core.venue that has a soccer match (World Cup and MLS), so /venue/<slug> and /venues can
-- name, place and describe them. Add-only: one view and its grant, no data, no table.
--
-- The venues are already in core.venue / core.venue_name (the world stadium dataset, db/migrations/079 and scripts/world_stadiums/) and core.soccer_match.venue_id
-- points at them, but no api view showed their city, coordinates, capacity, dates or names: api.venue_ref has only the Wikidata id and the current name, and
-- api.venue_info / api.venue_place cover only the home venues of the five leagues (about 35 of the 299 soccer venues).
--
-- api.venue_soccer  one row per venue with at least one soccer match, 299 rows on 2026-10-13. Years are whole years: opened and closed from the dates;
--                   names is a JSON list of {name, from, to}, oldest first, with from and to null when the name has no dates (most have none).
-- On production: apply this file. No data release: it reads tables that are already there.

create or replace view api.venue_soccer as
select v.venue_id,
       v.source_key as wikidata_id,
       v.city,
       v.region,
       v.country_code,
       v.latitude::float8 as latitude,
       v.longitude::float8 as longitude,
       v.capacity,
       extract(year from v.opened_on)::int as opened_year,
       extract(year from v.closed_on)::int as closed_year,
       v.surface,
       v.roof,
       v.address,
       v.postal_code,
       coalesce((select jsonb_agg(jsonb_build_object(
                         'name', n.name,
                         'from', extract(year from lower(n.valid_during))::int,
                         'to', extract(year from (upper(n.valid_during) - 1))::int)
                       order by lower(n.valid_during) nulls first, n.name)
                   from core.venue_name n where n.venue_id = v.venue_id), '[]'::jsonb) as names
from core.venue v
where v.source_key ~ '^Q[0-9]+$'
  and exists (select 1 from core.soccer_match m where m.venue_id = v.venue_id);
comment on view api.venue_soccer is 'City, region, country, coordinates, capacity, opening and closing year, surface, roof, address and every name (JSON list of name, from, to) of each venue that has a soccer match, keyed by its Wikidata id.';
grant select on api.venue_soccer to anon, authenticated;

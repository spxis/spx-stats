-- Which facts of a home venue came from the English Wikipedia infobox, and the article revision they were read from.
-- core.brand_venue_info.wikipedia_fields and wikipedia_key have been stored since migration 052 (db/build/193_venue_names.sql fills them).
-- api.venue_info did not expose them, so the open dataset (/venues.csv, /venues.geojson, /api/venues) had to say surface and roof "may" be
-- CC BY-SA 4.0. Add-only: the view keeps every column it had, in the same order, and gains these two at the end (create or replace view;
-- api.venue_pack is built from it and stays as it is).
--   wikipedia_fields   surface, roof, address, opened, closed, capacity, or a comma list of those: the facts taken from the infobox; null when none were
--   wikipedia_key      enwiki:<article title>@<revision id> of that infobox; null when wikipedia_fields is null
-- A row with wikipedia_fields null took none of those facts from Wikipedia: they are Wikidata (CC0) or absent.
-- On production: apply this file. No data release is needed for the columns; the values are the ones core.brand_venue_info already holds there.

create or replace view api.venue_info as
select wikidata_id, capacity, opened_year, closed_year, owner, surface, roof, address, postal_code, surface_raw, status,
       wikipedia_fields, wikipedia_key
from core.brand_venue_info;
comment on view api.venue_info is 'Capacity, year opened and closed, owner, surface (ref.venue_surface, surface_raw as published), roof, address, postal code and open/closed status of a home venue. wikipedia_fields names the facts taken from the English Wikipedia infobox (CC BY-SA 4.0) and wikipedia_key is enwiki:<title>@<revision>; null wikipedia_fields means those facts are Wikidata (CC0) or absent.';
grant select on api.venue_info to anon, authenticated;

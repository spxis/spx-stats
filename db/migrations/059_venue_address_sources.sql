-- Two more street address sources for the home venues (scripts/wikidata_venues/load.py), for the venues whose Wikidata item has no address (P6375):
--   street_address: Wikidata P669 (located on street) with the house number P670, e.g. "68 Lexington Avenue" (CC0);
--   wp_address: the street line of the English Wikipedia infobox's address or location field (CC BY-SA 4.0), a house number and street or two crossing streets.
-- db/build/193_venue_names.sql takes the first that exists: legacy_franchise_info.place.address_street, P6375, P669 + P670, the infobox; an address from the
-- infobox is marked in core.brand_venue_info.wikipedia_fields ('address') with its article and revision in wikipedia_key.
-- The legacy columns exist on DS1 and the working copy only; on production this file does nothing (the data arrives with the core.brand_venue_info release).

do $$
begin
  if to_regclass('legacy_wikidata_venues.venue') is not null then
    alter table legacy_wikidata_venues.venue add column if not exists street_address text;
    alter table legacy_wikidata_venues.venue add column if not exists wp_address text;
  end if;
end $$;

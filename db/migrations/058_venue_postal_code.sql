-- The postal or ZIP code of a home venue, from Wikidata (P281, CC0), for the one address line the site shows (web/src/lib/venueAddress.ts).
-- core.brand_venue_info.postal_code is filled by db/build/193_venue_names.sql from legacy_wikidata_venues.venue.postal_checked: a code is kept
-- only when @johnmorrisdotca/address-plus accepts its shape and it belongs to the venue's state or province (scripts/wikidata_venues/postal_check.py);
-- any other code is logged in meta.data_issue and left empty. A code is never worked out from the rest of the address.
-- The legacy columns (postal_code as Wikidata gives it, postal_checked the standard form, postal_problem why it was refused) exist on DS1 and
-- the working copy only; on production the block below does nothing. About 20 rows get a code (well under 1 KB).
-- On production: apply this file, then a data release of core.brand_venue_info (AGENTS.md section 8, item 5).

do $$
begin
  if to_regclass('legacy_wikidata_venues.venue') is not null then
    alter table legacy_wikidata_venues.venue add column if not exists postal_code text;      -- Wikidata P281 as stored
    alter table legacy_wikidata_venues.venue add column if not exists postal_checked text;   -- the standard form, when valid and in the venue's region
    alter table legacy_wikidata_venues.venue add column if not exists postal_problem text;   -- why postal_code was not accepted
  end if;
end $$;

alter table core.brand_venue_info add column if not exists postal_code text;
comment on column core.brand_venue_info.postal_code is 'Postal or ZIP code (Wikidata P281) in the standard form, only when its shape is valid and it belongs to the venue''s state or province.';

create or replace view api.venue_info as
select wikidata_id, capacity, opened_year, closed_year, owner, surface, roof, address, postal_code from core.brand_venue_info;
comment on view api.venue_info is 'Capacity, year opened, owner, surface, roof, address and postal code of a home venue (Wikidata, CC0).';
grant select on api.venue_info to anon, authenticated;

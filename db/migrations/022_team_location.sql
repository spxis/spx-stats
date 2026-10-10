-- Where a franchise played in each era: its home venue's coordinates, for the site's maps.
alter table core.franchise_brand
  add column if not exists home_venue text,
  add column if not exists latitude numeric(8,5) check (latitude between -90 and 90),
  add column if not exists longitude numeric(8,5) check (longitude between -180 and 180);

create or replace view api.team_brand as
select fl.league_code as league, b.franchise_id, lower(b.valid_during) as brand_from, upper(b.valid_during) as brand_to,
       b.primary_hex, b.secondary_hex, b.logo_url, b.logo_licence, b.logo_page, src.code as source,
       b.home_venue, b.latitude, b.longitude
from core.franchise_brand b join core.franchise_league fl on fl.franchise_id = b.franchise_id join meta.source src on src.source_id = b.source_id;
grant select on api.team_brand to anon, authenticated;

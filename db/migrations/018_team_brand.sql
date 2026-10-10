-- A franchise's colours and logo over time, for the website's team pages.
-- Colours are facts; logos are the trademarks of their owners and are shown
-- small, to identify the team, with the licence or fair-use basis recorded
-- for each image (see the site's Logos page).
create table if not exists core.franchise_brand (
  franchise_brand_id integer generated always as identity primary key,
  franchise_id integer not null references core.franchise (franchise_id) on delete cascade,
  valid_during daterange not null default daterange(null, null),
  primary_hex text check (primary_hex ~ '^[0-9A-F]{6}$'),
  secondary_hex text check (secondary_hex ~ '^[0-9A-F]{6}$'),
  logo_url text,                 -- an image hosted by its source (e.g. upload.wikimedia.org)
  logo_licence text,             -- e.g. 'Public domain (text logo)', 'Non-free: trademark, used to identify the team'
  logo_page text,                -- where the image and its licence are described
  source_id smallint not null references meta.source (source_id),
  source_key text not null,
  unique (franchise_id, valid_during, source_id)
);
comment on table core.franchise_brand is 'Team colours and logo per franchise and era, with the source and licence of each.';

create or replace view api.team_brand as
select fl.league_code as league, b.franchise_id, lower(b.valid_during) as brand_from, upper(b.valid_during) as brand_to,
       b.primary_hex, b.secondary_hex, b.logo_url, b.logo_licence, b.logo_page, src.code as source
from core.franchise_brand b join core.franchise_league fl on fl.franchise_id = b.franchise_id join meta.source src on src.source_id = b.source_id;
grant select on api.team_brand to anon, authenticated;

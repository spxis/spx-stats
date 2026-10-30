-- Cold reads, part 6 (ticket SPX-812). Add-only: one new materialized view. Apply to DS1 first, then production. The site reads it and, while it is
-- missing (a 404), falls back on api.logo_fit, so the site works before and after.
--   api.logo_fit_pack   one row holding every row of api.logo_fit as a short array
-- Every page that draws a logo in a box reads api.logo_fit whole (137 rows, 64 KB). The rows without their thirteen column names are about 80 percent of that.
-- Precomputed because it reads a view; api.refresh() rebuilds it after a release (it is found from the catalog).

create materialized view api.logo_fit_pack as
select 1 as id,
       jsonb_agg(jsonb_build_array(logo_file, league, team, wordmark, mark_url, mark_licence, mark_page, scale, dx, dy, bg, status, note) order by logo_file) as fits
from api.logo_fit;
create unique index logo_fit_pack_key on api.logo_fit_pack (id);
comment on materialized view api.logo_fit_pack is
  'Every row of api.logo_fit in one row (id 1), as [logo_file, league, team, wordmark, mark_url, mark_licence, mark_page, scale, dx, dy, bg, status, note] in the order of logo_file. Refreshed by api.refresh() (migration 179).';
analyze api.logo_fit_pack;
grant select on api.logo_fit_pack to anon, authenticated;

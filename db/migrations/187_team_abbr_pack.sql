-- Cold reads, part 14. Add-only: one new materialized view. Apply to DS1 first, then production. The site reads it and, while it is
-- missing (a 404), falls back on api.team_abbr, so the site works before and after.
--   api.team_abbr_pack   one row for each league: the abbreviation of every club in each era as parallel arrays
-- Every page of a league reads the league's rows of api.team_abbr (516 rows in all, 108 bytes a row). This is the same rows in about a fifth of the bytes.
-- Precomputed because it reads a view; api.refresh() rebuilds it after a release (it is found from the catalog).

create materialized view api.team_abbr_pack as
with a as (
  select *, row_number() over (partition by league order by franchise_id, valid_from nulls first, valid_to, abbreviation) as n from api.team_abbr)
select league,
       array_agg(franchise_id order by n) as franchise_id,
       array_agg(valid_from order by n) as valid_from,
       array_agg(valid_to order by n) as valid_to,
       array_agg(abbreviation order by n) as abbreviation
from a group by league;
create unique index team_abbr_pack_key on api.team_abbr_pack (league);
comment on materialized view api.team_abbr_pack is
  'The rows of api.team_abbr of one league, ordered by franchise_id, valid_from with none first, valid_to and abbreviation, as parallel arrays. Refreshed by api.refresh() (migration 187).';
analyze api.team_abbr_pack;
grant select on api.team_abbr_pack to anon, authenticated;

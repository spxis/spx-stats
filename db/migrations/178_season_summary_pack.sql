-- Cold reads, part 5 (ticket SPX-812). Add-only: one new materialized view. Apply to DS1 first, then production. The site reads it and, while it is
-- missing (a 404), falls back on api.season_summary, so the site works before and after.
--   api.season_summary_pack   one row for each league: every season of api.season_summary as a short array
-- The home page, every league page and every season page read api.season_summary whole (782 rows, one request of 205 KB). The same rows without their
-- eleven column names repeated on each are about 60 percent of that.
-- Precomputed because it reads a materialized view; api.refresh() rebuilds it after a release (it is found from the catalog, after api.season_summary).

create materialized view api.season_summary_pack as
select league,
       jsonb_agg(jsonb_build_array(year, label, games, finals, playoff_finals, teams, champion, champion_note, champion_source, champion_franchise) order by year) as seasons
from api.season_summary
group by league;
create unique index season_summary_pack_key on api.season_summary_pack (league);
comment on materialized view api.season_summary_pack is
  'The rows of api.season_summary, a league to a row, as [year, label, games, finals, playoff_finals, teams, champion, champion_note, champion_source, champion_franchise] in the order of year. Refreshed by api.refresh() (migration 178).';
analyze api.season_summary_pack;
grant select on api.season_summary_pack to anon, authenticated;

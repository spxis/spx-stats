-- Cold reads, part 10. Add-only: one new materialized view. Apply to DS1 first, then production. The site reads it and, while it is
-- missing (a 404), falls back on the reads it made before, so the site works before and after.
--   api.award_league_pack   one row for each league: every winner of api.awards as short arrays, each award's code, name and kind once, and the winners counted by source
-- The trophy pages, the awards-by-season tables and the sources page read api.awards whole (5,452 rows, a request for every 1,000 rows), the column names and the award's
-- name and kind on every row. This is the same winners for a league in one request.
-- Precomputed because it reads a view; api.refresh() rebuilds it after a release (it is found from the catalog).

create materialized view api.award_league_pack as
with d as (
  select league, award_code, award, kind, row_number() over (partition by league order by award_code, award, kind) - 1 as di
  from (select distinct league, award_code, award, kind from api.awards) x),
a as (
  select w.*, d.di, row_number() over (partition by w.league order by w.year desc, w.award_code, w.winner, w.source, w.franchise_id, w.person_id, w.note) as n
  from api.awards w
  join d on d.league = w.league and d.award_code is not distinct from w.award_code and d.award is not distinct from w.award and d.kind is not distinct from w.kind),
src as (
  select league, array_agg(source order by source) as names, array_agg(c order by source) as counts
  from (select league, source, count(*)::int as c from api.awards group by league, source) s
  group by league)
select a.league,
       (select array_agg(d.award_code order by d.di) from d where d.league = a.league) as dict_code,
       (select array_agg(d.award order by d.di) from d where d.league = a.league) as dict_award,
       (select array_agg(d.kind order by d.di) from d where d.league = a.league) as dict_kind,
       array_agg(a.year order by a.n) as year,
       array_agg(a.di order by a.n) as dict,
       array_agg(a.winner order by a.n) as winner,
       array_agg(a.note order by a.n) as note,
       array_agg(a.franchise_id order by a.n) as franchise_id,
       array_agg(a.person_id order by a.n) as person_id,
       src.names as source_name,
       src.counts as source_count
from a join src on src.league = a.league
group by a.league, src.names, src.counts;
create unique index award_league_pack_key on api.award_league_pack (league);
comment on materialized view api.award_league_pack is
  'The winners of api.awards of one league, newest season first then by award_code, winner, source, franchise_id, person_id and note, as parallel arrays (year, dict, winner, note, franchise_id, person_id); dict is the index into dict_code, dict_award and dict_kind, the distinct (award_code, award, kind) of the league. source_name and source_count are the number of winners of each source. Refreshed by api.refresh() (migration 183).';
analyze api.award_league_pack;
grant select on api.award_league_pack to anon, authenticated;

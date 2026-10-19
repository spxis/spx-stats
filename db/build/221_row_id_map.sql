-- Last step of the build. Remembers the id of every game, series, venue, franchise, award, season, team season, soccer match and Stanley Cup series
-- the first time its natural key is seen (ingest.row_id_map, migration 135); a key already there keeps the id it was first given, so
-- db/checks/093_row_id_drift.sql finds any row a rerun gave a new id. Needs migration 135 on DS1. Rerunnable; DS1 only.
-- After a deliberate full rebuild (step 100 deletes everything) empty the map first: truncate ingest.row_id_map.
begin;
insert into ingest.row_id_map (tbl, natural_key, row_id)
select tbl, natural_key, id from ingest.row_id_current
on conflict (tbl, natural_key) do nothing;
select tbl, count(*) as remembered from ingest.row_id_map group by tbl order by tbl;
commit;

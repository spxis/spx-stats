-- what: a game, series, venue, franchise, award, season, team season, soccer match or cup series whose id is not the one first remembered (a rerun of a build step gave it a new id)
-- baseline: 0
-- needs migration 135 and db/build/221 on DS1. To accept a change made on purpose: delete the row from ingest.row_id_map and rerun 221.
select m.tbl, m.natural_key, m.row_id as remembered_id, c.id as current_id
from ingest.row_id_map m
join ingest.row_id_current c on c.tbl = m.tbl and c.natural_key = m.natural_key
where c.id <> m.row_id
order by m.tbl, m.natural_key

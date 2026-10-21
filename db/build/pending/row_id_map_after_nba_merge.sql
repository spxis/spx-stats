-- One-off DS1 repair (pending: not part of build_core.sh). 221 ran (remembering identity ids by franchise/first day) before
-- 147_nba_identity_merge.sql joined each NBA club's three fragments into its lowest-id row. The joined row now starts on the first
-- fragment's first day, so the map still remembers the removed fragment's id for that key and check 093 reports 30 rows.
-- The removed ids are gone on purpose (147_nba_identity_merge.sql), so remember the surviving id instead.
-- Touches only identity keys whose remembered id no longer exists. Rerunnable: a second run updates 0 rows.
begin;
update ingest.row_id_map m
   set row_id = c.id
  from ingest.row_id_current c
 where m.tbl = 'core.franchise_identity'
   and c.tbl = m.tbl and c.natural_key = m.natural_key
   and c.id <> m.row_id
   and not exists (select 1 from core.franchise_identity fi where fi.franchise_identity_id = m.row_id);
commit;

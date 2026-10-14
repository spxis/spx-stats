-- PRODUCTION ONLY. Never run this on DS1 or a working copy. John approved dropping unused indexes on 2026-10-14.
--
-- Three unique constraints on production that nothing reads. releases write core.game, meta.verification and core.betting_line by
-- primary key (release.py: "on conflict (<pk>) do update"), and no api view or web/src file looks a row up by these columns.
-- They only cost disk (32.2 MB, section 1 of docs/storage-plan.md) and slow every release insert, because each insert maintains them.
--
--   constraint (table)                                                 made by              MB    scans since 2026-10-02
--   game_source_id_source_key_key (core.game)                          001_core_schema      25.8  7
--   verification_entity_kind_entity_id_field_source_id_key             003_verification      3.7  1
--     (meta.verification)
--   betting_line_source_id_source_key_key (core.betting_line)          001_core_schema       2.7  1
--
-- DS1 KEEPS all three: ingest.report_results (migration 044) and the loaders use "on conflict (source_id, source_key)" there, and
-- DS1 is where uniqueness is enforced; production is a copy of DS1 and cannot hold a duplicate DS1 lacks.
-- Not a primary key, not the target of a foreign key (checked in pg_constraint), not an exclusion constraint.
--
-- Constraint-backed indexes cannot be removed with DROP INDEX CONCURRENTLY, so this is ALTER TABLE ... DROP CONSTRAINT: a short
-- ACCESS EXCLUSIVE lock (no rewrite, the file is simply deleted). lock_timeout makes it give up instead of queueing behind a long
-- query and blocking readers; if it gives up, rerun it later. Run each statement as its own request, after a release has applied
-- and none is running (meta.data_release has no row in status 'running').
--
-- Rollback (about a minute for core.game, builds the index without blocking writes; then add the constraint from it):
--   create unique index concurrently game_source_id_source_key_key on core.game (source_id, source_key);
--   alter table core.game add constraint game_source_id_source_key_key unique using index game_source_id_source_key_key;
--   create unique index concurrently verification_entity_kind_entity_id_field_source_id_key on meta.verification (entity_kind, entity_id, field, source_id);
--   alter table meta.verification add constraint verification_entity_kind_entity_id_field_source_id_key unique using index verification_entity_kind_entity_id_field_source_id_key;
--   create unique index concurrently betting_line_source_id_source_key_key on core.betting_line (source_id, source_key);
--   alter table core.betting_line add constraint betting_line_source_id_source_key_key unique using index betting_line_source_id_source_key_key;

set lock_timeout = '5s';

alter table core.game drop constraint if exists game_source_id_source_key_key;
alter table meta.verification drop constraint if exists verification_entity_kind_entity_id_field_source_id_key;
alter table core.betting_line drop constraint if exists betting_line_source_id_source_key_key;

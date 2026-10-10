-- A season records the source it was first created from, as games and
-- franchises do, so its notes are free for real remarks.
alter table core.season add column if not exists source_id smallint references meta.source;
update core.season set notes = null where notes like 'Season row%' or notes like 'Season rows%';
comment on column core.season.source_id is 'The source this season was first created from.';

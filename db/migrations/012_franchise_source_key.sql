-- A franchise records the key its source gave it, as games and betting lines
-- already do, so nothing needs to be parsed out of free-text notes.
alter table core.franchise add column if not exists source_key text;
update core.franchise set source_key = substring(notes from '^spx team (\d+)$'), notes = null
 where notes ~ '^spx team \d+$';
update core.franchise set source_key = substring(notes from '^retrosheet team (.*)$'), notes = null
 where notes ~ '^retrosheet team ';
create unique index if not exists franchise_source_key on core.franchise (source_id, source_key);
comment on column core.franchise.source_key is 'The franchise''s key in its source (SPX franchise number, Retrosheet team id).';

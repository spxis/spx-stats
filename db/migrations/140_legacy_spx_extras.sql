-- Raw files from John's SportsInteractive folder (Dropbox /Projects/SportsInteractive) that the SPX SQL backups do not hold. DS1 only:
-- production never holds a legacy_* schema (AGENTS.md section 8). One table so far:
--   efl_result  a line of Data/efl/2004-regular/data/efl-2004-schedules.csv, SPX's own capture (2004-11-22) of the results and fixtures
--               pages of 320 European clubs. The pages were ESPN Soccernet's (the fetch list names its host), so this is SPX's archive of an
--               ESPN page: loaded only after John says so (docs/spx-extras-inventory.md, "John decides").
-- Filled by scripts/spx_extras/efl.py. Rerunnable (the table is emptied and filled again from the file).
create schema if not exists legacy_spx_extras;
comment on schema legacy_spx_extras is 'Raw files from the SportsInteractive Dropbox folder that the SPX SQL backups do not hold (legacy_spx has those).';

create table if not exists legacy_spx_extras.efl_result (
  source_file  text     not null,            -- the archived file's name in legacy_files.raw_archive
  line         integer  not null,            -- 1 for the first data row
  team_page    integer  not null,            -- the club page the line was captured from (the first column of the file); a match is on two pages
  game_date    timestamp not null,           -- date, with the kick-off hour when the page gave one (local time, no zone)
  away_name    text     not null,
  away_score   smallint,                     -- null when the page showed no score
  home_name    text     not null,
  home_score   smallint,
  status       text,                         -- Final, Postponed, Fixture or empty
  primary key (source_file, line)
);
comment on table legacy_spx_extras.efl_result is 'One line of SPX''s 2004 European results/fixtures capture, exactly as the file has it (each match appears once per club page).';

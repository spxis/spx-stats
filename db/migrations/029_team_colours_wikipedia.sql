-- Team colours from Wikipedia's shared colour data modules (Lua), CC BY-SA 4.0.
-- One row per entry of Module:Sports color/{ice hockey,basketball,baseball} and
-- Module:Gridiron color/data, for the NHL, NBA, MLB, NFL/AFL and CFL sections only.
-- core.franchise_brand is filled from these by db/build/175_team_brand.sql.
-- Loaded by scripts/team_colours/load_wikipedia_colours.py; the modules as fetched are
-- in legacy_files.raw_archive under 'wikipedia-colours/2026-10-10/'.
create table if not exists legacy_team_brand.wikipedia_colour (
  league_code   text    not null,
  module_page   text    not null,
  entry_key     text    not null,          -- the key in the module, e.g. 'Cleveland Indians 1973thru1985'
  seq           integer not null,          -- position in the module file
  team_name     text    not null,          -- key without the 'XXXXthruYYYY' suffix
  start_year    integer,                   -- from 'XXXXthruYYYY' (inclusive); null = undated
  end_year      integer,
  indented      boolean not null,          -- a historical entry nested under a team
  alias_of      text,                      -- the key this entry points at, when it has no colours of its own
  resolved_key  text,                      -- the key whose colours it ends up with (itself when it has them)
  resolved_name text,
  primary_hex   text check (primary_hex ~ '^[0-9A-F]{6}$'),
  secondary_hex text check (secondary_hex ~ '^[0-9A-F]{6}$'),
  slot_1 text, slot_2 text, slot_3 text, slot_4 text, slot_5 text,   -- all colours the module gives, normalised
  raw_slots     text[],                    -- as written
  primary key (module_page, seq),
  check (end_year is null or start_year is null or end_year >= start_year)
);
comment on table legacy_team_brand.wikipedia_colour is
  'Wikipedia sports colour modules (CC BY-SA 4.0). Sports color modules: slots are bg1, text1, bg2, text2 (primary = 1, secondary = 3). Gridiron: slots are primary, text, secondary, alt primary, alt secondary (secondary = 3, else 2 unless white).';

update meta.source
   set attribution = attribution || ' Team colours (primary and secondary hex, by year) from Wikipedia''s Lua data modules Module:Sports color/ice hockey, /basketball, /baseball and Module:Gridiron color/data (en.wikipedia.org), CC BY-SA 4.0; text by the modules'' editors, see each module''s history.'
 where code = 'wikipedia' and attribution not like '%Team colours (primary and secondary hex%';

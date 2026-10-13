-- World soccer stadiums: pitch length and width where English Wikipedia's infobox publishes it. Add-only: one new table and one new api view.
-- The stadiums themselves need no migration: every World Cup and MLS ground (and kyogijo's famous grounds) is added to core.venue / core.venue_name
-- by the existing venue path (scripts/game_venue/ fetch + load, then db/build/198_home_venue.sql); see scripts/world_stadiums/README.md.
--
-- core.venue_pitch    one row per stadium (Wikidata item) whose English Wikipedia article gives one "length x width" pair that a football pitch can have
--                     (length 90-120 m, width 50-90 m). The figures are as published (length, width, unit m / yd / ft) and in metres; `international`
--                     says whether they fit what Law 1 allows for international matches (100-110 x 64-75 m). `wikipedia_key` cites the article and the
--                     revision it was read at: enwiki:<title>@<revision id> (CC BY-SA 4.0, text by the article's editors). 42 rows were read by hand by
--                     kyogijo (the same revisions); the others by scripts/world_stadiums/pitch_size.py. A stadium whose article gives no size, a range, or
--                     several sizes has no row: nothing is guessed.
-- Filled by db/build/206_world_venue.sql from db/seed/venue_pitch.csv. About 175 rows, under 40 KB. On production: apply this file, then a data
-- release of core.venue_pitch (AGENTS.md section 8, item 5).
begin;

create table if not exists core.venue_pitch (
  wikidata_id      text primary key,                                 -- the stadium's Wikidata item (core.venue.source_key)
  length_m         numeric(5, 2) not null check (length_m between 90 and 120),
  width_m          numeric(5, 2) not null check (width_m between 50 and 90),
  length_published numeric(6, 2) not null,                           -- as the article gives it, in `unit`
  width_published  numeric(6, 2) not null,
  unit             text not null check (unit in ('m', 'yd', 'ft')),
  international    boolean not null,                                 -- within 100-110 x 64-75 m (Law 1, international matches)
  wikipedia_key    text not null,                                    -- enwiki:<article title>@<revision id>
  source_id        smallint not null references meta.source
);
comment on table core.venue_pitch is 'Pitch length and width of a stadium as English Wikipedia''s infobox publishes it (CC BY-SA 4.0), with the article revision cited. No row where the article gives no single size.';

create or replace view api.venue_pitch as
select wikidata_id, length_m, width_m, length_published, width_published, unit, international, wikipedia_key
from core.venue_pitch;
comment on view api.venue_pitch is 'Pitch size of a stadium (metres, and as published) with the English Wikipedia article and revision it was read from (CC BY-SA 4.0).';
grant select on api.venue_pitch to anon, authenticated;

update meta.source set attribution = attribution || ' Pitch sizes of stadiums from the infoboxes of English Wikipedia stadium articles (CC BY-SA 4.0); text by the articles'' editors, see each article''s history (core.venue_pitch.wikipedia_key).'
  where code = 'wikipedia' and attribution not like '%Pitch sizes of stadiums%';

commit;

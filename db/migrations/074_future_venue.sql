-- Future venues: stadiums and arenas announced, approved or under construction for clubs of the five leagues (NHL, NBA, MLB, NFL, CFL), the
-- "Future" tab of a venue site. Add-only: new schema, new tables, one new api view. Nothing existing is changed.
--
-- Sources (all allowed, none from Sports Reference or ESPN): the "future" tables of English Wikipedia's venue lists of the five leagues
-- (CC BY-SA 4.0, text by the articles' editors; the revision id is stored on every row), each future venue's own Wikipedia article (infobox:
-- groundbreaking, opening, capacity, coordinates; lead: the venue it replaces) and its Wikidata item (CC0: coordinates, capacity, places,
-- "replaces"). Wikidata alone is too thin for this (no item carries state of use, and most carry no dates), so the lists decide which venues
-- are future and in which table (Under construction, Proposed); Wikidata and the articles fill in facts, and a fact the sources lack stays null.
--
-- legacy_future_venue.*  the raw parsed rows (DS1 and the working copy only; production has no legacy_* schemas):
--   source_page  the Wikipedia pages read and the revision of each      list_row  one row per row of a list's future tables, as shown
--   list_club    one row per club of a list row                          article   the infobox facts and "replaces" of a venue's own article
--   wikidata_venue  the Wikidata facts of a venue item                   wikidata_state  every US/Canadian Wikidata venue whose state of use is
--                                                                         under construction, proposed, on hold or cancelled (discovery only)
-- core.*  built from them by db/build/203_future_venue.sql (rerunnable): core.future_venue, core.future_venue_club
-- api.future_venue  one row per venue with its clubs as JSON.
-- About 15 venues, 20 club rows: far under 1 MB. On production: apply this file, then a data release of the two core tables
-- (AGENTS.md section 8, item 5).
--
-- When a future venue opens (a later change, by hand, with a source): add it to core.venue / core.franchise_home_venue like any other venue (the
-- game-venue steps, db/build 198 and 199), keep its Wikidata id, delete its row here and the club rows with it (cascade), and drop it from
-- db/seed/future_venue_club.csv if no other row needs the club. The build step empties and rebuilds the two tables from the legacy rows each
-- time, so a venue that is no longer in a list's future tables disappears by itself on the next refresh (scripts/future_venue/README.md).

create schema if not exists legacy_future_venue;
comment on schema legacy_future_venue is 'Raw rows of the future venues: English Wikipedia venue lists and articles, Wikidata items (scripts/future_venue/).';

create table if not exists legacy_future_venue.source_page (
  title        text primary key,          -- English Wikipedia article title
  revision_id  bigint not null,           -- the revision the rows were read from (cite it: CC BY-SA 4.0)
  revision_at  timestamptz,
  wikidata_id  text,                      -- the article's Wikidata item
  fetched_on   date not null
);

create table if not exists legacy_future_venue.list_row (
  row_no            integer primary key,   -- order of reading: nfl, mlb, nba, nhl, cfl, each in the article's order
  league            text not null check (league in ('nfl', 'mlb', 'nba', 'nhl', 'cfl')),
  table_caption     text,                  -- 'Under construction' or 'Proposed'; null for the CFL list, whose Status column is status_text
  name              text not null,         -- the venue cell as shown
  article           text,                  -- the first link of the venue cell
  resolved_article  text,                  -- the article it leads to after redirects
  wikidata_id       text,                  -- the Wikidata item used for this row (the article's, else an exact-label search hit); null = none
  wikidata_ignored  text,                  -- an item the article is linked to that was not used, and why
  location_text     text,                  -- as shown ('Nashville, Tennessee', 'TBD')
  city              text,
  state_name        text,                  -- the word after the comma
  region            text,                  -- ISO 3166-2 from state_name (US-TN, CA-AB); null when not a known state or province
  country_code      text,
  capacity          integer,
  opening_text      text,                  -- the Opening cell as shown ('2029', 'TBD')
  opening_year      smallint,
  status_text       text,
  roof              text,
  surface           text,
  list_title        text not null,
  list_revision     bigint not null,
  cells             jsonb not null         -- the raw wikitext cells
);

create table if not exists legacy_future_venue.list_club (
  list_club_id      integer generated always as identity primary key,
  row_no            integer not null references legacy_future_venue.list_row,
  club_text         text not null,         -- as shown ('Las Vegas Athletics')
  club_link         text,                  -- first link
  club_wikidata_id  text                   -- the Wikidata item of that article (for the Athletics: of the relocation article, not the club)
);

create table if not exists legacy_future_venue.article (
  title               text primary key,
  revision_id         bigint not null,
  wikidata_id         text,
  location_text       text,                -- infobox 'location'
  latitude            numeric(9, 6),       -- infobox 'coordinates'
  longitude           numeric(9, 6),
  groundbreaking_text text,                -- infobox, as written ('July 22, 2024', '2027 (planned)')
  opened_text         text,                -- infobox 'opened' ('2027 (planned)')
  capacity_text       text,
  capacity            integer,
  replaces_title      text,                -- the article the lead says this venue replaces
  replaces_wikidata   text
);

create table if not exists legacy_future_venue.wikidata_venue (
  wikidata_id         text primary key,
  label               text,
  description         text,
  instance_of         text[],
  wikipedia_title     text,
  latitude            numeric(9, 6),       -- P625
  longitude           numeric(9, 6),
  capacity            integer,             -- P1083
  inception_year      smallint,            -- P571
  planned_open_year   smallint,            -- P1619
  construction_start_year smallint,        -- P580
  state_of_use        text[],              -- P5817 labels
  city                text,
  region              text,
  country_code        text,
  replaces            text[],              -- P1365 item ids
  replaces_names      text[],              -- their English labels ('' where Wikidata has none)
  fetched_on          date not null
);

create table if not exists legacy_future_venue.wikidata_state (
  wikidata_id   text primary key,
  label         text,
  state_of_use  text not null,
  country       text,
  city          text,
  planned_open  date,
  inception     date,
  fetched_on    date not null
);

-- ---------------------------------------------------------------- core
create table if not exists core.future_venue (
  venue_key           text primary key,                  -- 'wikidata:Q...' or, for a venue with no Wikidata item, 'wikipedia-list:<league>:<name>'
  wikidata_id         text unique check (wikidata_id ~ '^Q[0-9]+$'),
  name                text not null,                     -- as the list shows it
  status              text not null check (status in ('proposed', 'approved', 'under_construction')),
  status_note         text,                              -- why 'approved': the sentence of the article that says so (db/seed/future_venue_status.csv)
  planned_open_year   smallint,                          -- the year the source gives, as planned (not a promise); null when 'TBD'
  opening_text        text,                              -- the source's words ('2029', 'June 2028 (planned)', 'TBD')
  groundbreaking_text text,                              -- infobox, as written
  groundbreaking_year smallint,
  capacity            integer check (capacity > 0),
  latitude            numeric(9, 6) check (latitude between -90 and 90),
  longitude           numeric(9, 6) check (longitude between -180 and 180),
  coordinates_source  text check (coordinates_source in ('wikidata', 'wikipedia')),
  city                text,
  region              text,                              -- ISO 3166-2
  country_code        text references ref.country,
  location_text       text,                              -- as the list shows it
  replaces_venue_wikidata text,                          -- the venue it replaces, when the sources say so (article lead or Wikidata P1365); else null
  replaces_venue_name text,
  wikipedia_title     text,
  wikipedia_revision  bigint,                            -- revision of the venue's own article (infobox, lead)
  list_title          text not null,
  list_revision       bigint not null,                   -- revision of the league list the row was read from
  as_of               date not null,                     -- the day the sources were read
  source_id           smallint not null references meta.source,
  source_key          text not null                      -- wikipedia:<list title>@<revision>
);
comment on table core.future_venue is 'A stadium or arena announced, approved or under construction for a club of the five leagues. Built by db/build/203_future_venue.sql. Planned years are the source''s, never a promise.';
create index if not exists future_venue_status_idx on core.future_venue (status);

create table if not exists core.future_venue_club (
  future_venue_club_id integer generated always as identity primary key,
  venue_key     text not null references core.future_venue on delete cascade,
  club_name     text not null,                           -- as the list shows it
  league        text not null check (league in ('nfl', 'mlb', 'nba', 'nhl', 'cfl')),
  franchise_id  integer references core.franchise on delete set null,   -- null: not matched (logged)
  source_id     smallint not null references meta.source,
  source_key    text not null,
  unique (venue_key, club_name)
);
comment on table core.future_venue_club is 'The club(s) a future venue is for; two for a shared arena (the new South Philadelphia arena: 76ers and Flyers).';
create index if not exists future_venue_club_franchise_idx on core.future_venue_club (franchise_id);

-- ---------------------------------------------------------------- api
create or replace view api.future_venue as
select v.venue_key,
       v.wikidata_id,
       v.name,
       v.status,
       v.status_note,
       v.planned_open_year,
       v.opening_text,
       v.groundbreaking_text,
       v.groundbreaking_year,
       v.capacity,
       v.latitude,
       v.longitude,
       v.coordinates_source,
       v.city,
       v.region,
       v.country_code,
       v.location_text,
       v.replaces_venue_wikidata,
       v.replaces_venue_name,
       v.wikipedia_title,
       v.wikipedia_revision,
       v.list_title,
       v.list_revision,
       v.as_of,
       coalesce(c.clubs, '[]'::jsonb) as clubs,
       coalesce(c.leagues, '{}'::text[]) as leagues
from core.future_venue v
left join lateral (
  select jsonb_agg(jsonb_build_object('franchise_id', x.franchise_id, 'club', x.club_name, 'league', x.league) order by x.league, x.club_name) as clubs,
         array_agg(distinct x.league order by x.league) as leagues
  from core.future_venue_club x
  where x.venue_key = v.venue_key
) c on true;
comment on view api.future_venue is 'Future stadiums and arenas (status proposed, approved or under_construction) with their clubs and leagues; planned_open_year is the source''s plan.';
grant select on api.future_venue to anon, authenticated;

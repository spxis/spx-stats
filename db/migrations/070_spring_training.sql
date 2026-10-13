-- Spring training parks: where major-league clubs trained in Arizona (the Cactus League) and Florida (the Grapefruit League), now and in the past,
-- and which club trained where in which years. Add-only: new schema, new tables, one new api view. Nothing existing is changed.
--
-- Sources (all allowed, none from Sports Reference or ESPN): English Wikipedia's "List of Major League Baseball spring training ballparks"
-- (CC BY-SA 4.0, text by the article's editors; the revision id is stored on every row), each park's Wikipedia article (infobox: fence distances,
-- former names), and each park's Wikidata item (CC0: name, coordinates, capacity, opened, closed, city/state/country). gavinr/mlb-spring-training-stadiums
-- (no licence, a 2013 list) was only the idea. The Cactus League and Grapefruit League articles are redirects to "Spring training", which holds
-- no history, so the list article is the history. A park is Cactus when it is in Arizona and Grapefruit when it is in Florida.
--
-- legacy_spring_training.*  the raw parsed rows (DS1 and the working copy only; production has no legacy_* schemas):
--   source_page  the Wikipedia pages read and the revision of each     park_row  one row per row of the list's tables, as shown
--   occupant     one row per club and span of years of a list row      venue     the Wikidata facts of a park     fence  the infobox's distances
--   park_name    former and other names with their years (Wikipedia infobox, the list's "a.k.a.", Wikidata)
-- core.*  built from them by db/build/201_spring_training.sql (rerunnable):
--   core.spring_training_venue, core.spring_training_venue_name, core.spring_training_tenant
-- api.spring_training_venue  one row per park with its tenants and names as JSON.
-- About 60 parks, 190 tenant spans: far under 1 MB. On production: apply this file, then a data release of the three core tables
-- (AGENTS.md section 8, item 5).

create schema if not exists legacy_spring_training;
comment on schema legacy_spring_training is 'Raw rows of the spring training parks: the Wikipedia list of ballparks, park infoboxes and Wikidata items (scripts/spring_training/).';

create table if not exists legacy_spring_training.source_page (
  title        text primary key,          -- English Wikipedia article title
  revision_id  bigint not null,           -- the revision the rows were read from (cite it: CC BY-SA 4.0)
  revision_at  timestamptz,
  wikidata_id  text,                      -- the article's Wikidata item
  fetched_on   date not null
);

create table if not exists legacy_spring_training.park_row (
  row_no            integer primary key,   -- order in the list article (current tables first, then the former table)
  status            text not null check (status in ('current', 'former')),
  league            text check (league in ('cactus', 'grapefruit')),   -- from the table or the state; null outside Arizona and Florida
  name              text not null,         -- the stadium cell as shown, links resolved (keeps "(a.k.a. ...)", "(new)", "(old)")
  article           text,                  -- the first link of the stadium cell
  resolved_article  text,                  -- the article it leads to after redirects
  wikidata_id       text,                  -- the Wikidata item of that article
  opened_year       smallint,
  last_used_year    smallint,              -- "Closed/Last used for Spring training" (former table only)
  city_text         text,
  city_link         text,
  state_name        text,                  -- from the city link ("Tampa, Florida")
  capacity          integer,               -- as shown ("capacity at closing" in the former table)
  status_text       text,                  -- "Still standing", "Demolished (became ...)"
  list_revision     bigint not null,
  cells             jsonb not null         -- the raw wikitext cells
);

create table if not exists legacy_spring_training.occupant (
  occupant_id  integer generated always as identity primary key,
  row_no       integer not null references legacy_spring_training.park_row,
  kind         text not null check (kind in ('current', 'former')),   -- which column of the list: current occupants or former/all occupants
  club_text    text not null,             -- as shown: "Houston Colt .45s/Astros"
  club_link    text,                      -- first link
  from_year    smallint,                  -- null when the list gives no readable years
  to_year      smallint,                  -- null = "present" (or unreadable when from_year is null)
  years_text   text,                      -- the bracket after the club, as shown
  raw          text not null
);

create table if not exists legacy_spring_training.venue (
  wikidata_id         text primary key,
  label               text,
  instance_of         text[],
  wikipedia_title     text,
  wikipedia_revision  bigint,             -- revision of the park's article that was read
  latitude            numeric(9, 6),      -- P625
  longitude           numeric(9, 6),
  capacity            integer,            -- P1083
  opened_year         smallint,           -- P1619, else P571
  closed_year         smallint,           -- P3999, else P576
  city                text,               -- nearest city up the P131 chain (null when the chain holds none)
  region              text,               -- ISO 3166-2 (P300)
  country_code        text,
  chain               jsonb,
  fetched_on          date not null
);

create table if not exists legacy_spring_training.fence (
  wikidata_id         text primary key,
  wikipedia_title     text,
  wikipedia_revision  bigint,
  dimensions_text     text,               -- the infobox's "dimensions" as read
  left_ft             smallint,
  center_ft           smallint,
  right_ft            smallint
);

create table if not exists legacy_spring_training.park_name (
  park_name_id        integer generated always as identity primary key,
  wikidata_id         text not null,
  name                text not null,
  from_year           smallint,
  to_year             smallint,
  source              text not null,      -- wikipedia (infobox former_names), wikipedia list (a.k.a.), wikidata
  wikipedia_revision  bigint
);

-- ---------------------------------------------------------------- core
create table if not exists core.spring_training_venue (
  wikidata_id         text primary key check (wikidata_id ~ '^Q[0-9]+$'),
  name                text not null,                     -- the name in the list article (current name for a current park)
  league              text not null check (league in ('cactus', 'grapefruit')),
  city                text,
  region              text,                              -- ISO 3166-2: US-AZ, US-FL
  country_code        text references ref.country,
  latitude            numeric(9, 6) check (latitude between -90 and 90),
  longitude           numeric(9, 6) check (longitude between -180 and 180),
  opened_year         smallint,
  closed_year         smallint,                          -- when the park closed (Wikidata); null while open or when a source contradicts the tenants
  capacity            integer check (capacity > 0),
  fence_left_ft       smallint,                          -- the infobox's current (or last) configuration, feet
  fence_center_ft     smallint,
  fence_right_ft      smallint,
  wikipedia_title     text,
  wikipedia_revision  bigint,                            -- revision of the park's article (fence distances, former names)
  list_revision       bigint,                            -- revision of the list article (name, city, capacity, tenants)
  source_id           smallint not null references meta.source,
  source_key          text not null                      -- wikidata:Q...
);
comment on table core.spring_training_venue is 'A major-league spring training park in Arizona (cactus) or Florida (grapefruit), current or past. Built by db/build/201_spring_training.sql.';
create index if not exists spring_training_venue_league_idx on core.spring_training_venue (league);

create table if not exists core.spring_training_venue_name (
  venue_name_id  integer generated always as identity primary key,
  wikidata_id    text not null references core.spring_training_venue on delete cascade,
  name           text not null,
  from_year      smallint,                               -- null when the sources give no years: never guessed
  to_year        smallint,
  source_id      smallint not null references meta.source,
  source_key     text not null
);
create unique index if not exists spring_training_venue_name_uq on core.spring_training_venue_name (wikidata_id, name, coalesce(from_year, 0), coalesce(to_year, 0));

create table if not exists core.spring_training_tenant (
  tenant_id     integer generated always as identity primary key,
  wikidata_id   text not null references core.spring_training_venue on delete cascade,
  club_name     text not null,                           -- as the list shows it ("Houston Colt .45s/Astros")
  franchise_id  integer references core.franchise on delete set null,   -- null: not a major-league club in core, or not matched (logged)
  from_year     smallint not null,
  to_year       smallint,                                -- null = still trains there (as of the list revision)
  source_id     smallint not null references meta.source,
  source_key    text not null,
  check (to_year is null or to_year >= from_year),
  unique (wikidata_id, club_name, from_year)
);
comment on table core.spring_training_tenant is 'A club that trained at a park, in whole years (first to last spring; null to_year = still there). Years are the list article''s, never guessed.';
create index if not exists spring_training_tenant_franchise_idx on core.spring_training_tenant (franchise_id);

-- ---------------------------------------------------------------- api
create or replace view api.spring_training_venue as
select v.wikidata_id,
       v.name,
       v.league,
       v.city,
       v.region,
       v.country_code,
       v.latitude,
       v.longitude,
       v.opened_year,
       v.closed_year,
       v.capacity,
       v.fence_left_ft,
       v.fence_center_ft,
       v.fence_right_ft,
       v.wikipedia_title,
       v.wikipedia_revision,
       v.list_revision,
       t.first_year,
       t.last_year,
       coalesce(t.in_use, false) as in_use,
       coalesce(t.tenants, '[]'::jsonb) as tenants,
       coalesce(n.names, '[]'::jsonb) as names
from core.spring_training_venue v
left join lateral (
  select min(x.from_year) as first_year,
         case when bool_or(x.to_year is null) then null else max(x.to_year) end as last_year,
         bool_or(x.to_year is null) as in_use,
         jsonb_agg(jsonb_build_object('franchise_id', x.franchise_id, 'club', x.club_name, 'from', x.from_year, 'to', x.to_year)
                   order by x.from_year, x.club_name) as tenants
  from core.spring_training_tenant x
  where x.wikidata_id = v.wikidata_id
) t on true
left join lateral (
  select jsonb_agg(jsonb_build_object('name', y.name, 'from', y.from_year, 'to', y.to_year)
                   order by y.from_year nulls first, y.name) as names
  from core.spring_training_venue_name y
  where y.wikidata_id = v.wikidata_id
) n on true;
comment on view api.spring_training_venue is 'Spring training parks (league cactus or grapefruit) with first and last spring, whether a club still trains there (in_use), tenants and names by period as JSON.';
grant select on api.spring_training_venue to anon, authenticated;

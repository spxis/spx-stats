-- OpenStreetMap venue outlines, as fetched (data (c) OpenStreetMap contributors, ODbL 1.0, openstreetmap.org/copyright).
-- For the working copy and DS1 only (production has no legacy_* schemas). Loaded by scripts/osm_venues/load.py from the Overpass
-- responses scripts/osm_venues/fetch.py saved (and legacy_files.raw_archive holds); read by db/build/204_venue_osm.sql.
-- Everything in this schema is ODbL data or derived from it; see scripts/osm_venues/README.md.
create schema if not exists legacy_osm;
comment on schema legacy_osm is 'OpenStreetMap (ODbL 1.0) elements around the home venues of the clubs, as fetched from Overpass, and the footprint, pitches and bearings picked from them.';

create table if not exists legacy_osm.query (
  qid            text primary key,          -- Wikidata id of the venue (api.venue_place.wikidata_id)
  name           text,                      -- the venue's name in the input list
  lat            numeric(9, 6) not null,    -- the coordinates we hold for it
  lon            numeric(9, 6) not null,
  file           text not null,             -- the raw response, relative to the raw folder (overpass/<qid>.json); same name in legacy_files.raw_archive
  sha256         text not null,
  fetched_at     timestamptz,
  osm_base       timestamptz,               -- the OSM database's timestamp the answer is from (osm3s.timestamp_osm_base)
  element_count  integer not null,           -- elements the requests returned for the venue (the wikidata match and the 400 m search), before duplicates are merged
  fetched_on     date not null
);

create table if not exists legacy_osm.element (
  qid            text not null references legacy_osm.query,
  osm_type       text not null check (osm_type in ('node', 'way', 'relation')),
  osm_id         bigint not null,
  version        integer,
  osm_timestamp  timestamptz,
  tags           jsonb not null default '{}',
  geometry       text,                      -- GeoJSON (Point, LineString, Polygon or MultiPolygon, 7 decimals as OSM has them); null if the element has none we read
  from_file      text,                      -- the raw file it came from (overpass/<qid>.json, or wikidata/ids-<hash>.json for the wikidata match)
  primary key (qid, osm_type, osm_id)
);
comment on table legacy_osm.element is 'Every element an Overpass request for a venue returned (wikidata match, stadium outlines, pitches, baseball walls within 400 m), unfiltered.';

-- What load.py picked and worked out; ODbL derived data. Rules in scripts/osm_venues/load.py.
create table if not exists legacy_osm.derived (
  qid             text not null references legacy_osm.query,
  kind            text not null check (kind in ('footprint', 'pitch', 'wall')),
  seq             smallint not null,
  osm_type        text not null,
  osm_id          bigint not null,
  matched_by      text not null check (matched_by in ('wikidata', 'proximity', 'inside_footprint')),
  distance_m      integer,                  -- metres from the venue's coordinates to the outline (0 = inside)
  sport           text,                     -- pitch: the recognised sports, ';' separated
  osm_name        text,
  geojson         text not null,            -- simplified to 1 m, 6 decimals
  area_m2         integer,
  bearing_deg     numeric(4, 1),
  bearing_kind    text check (bearing_kind in ('home_to_center', 'long_axis')),
  bearing_method  text,
  ref_lat         numeric(9, 6),            -- baseball: the home plate vertex
  ref_lon         numeric(9, 6),
  length_m        numeric(6, 1),            -- long_axis: length; home_to_center: distance from home plate to the farthest point of the pitch
  width_m         numeric(6, 1),
  primary key (qid, kind, seq),
  foreign key (qid, osm_type, osm_id) references legacy_osm.element
);

create table if not exists legacy_osm.verdict (
  qid            text primary key references legacy_osm.query,
  footprint      text not null check (footprint in ('wikidata', 'proximity', 'none', 'ambiguous')),
  reason         text,                      -- why there is no footprint, and why a pitch has no bearing
  pitch_count    integer not null,
  bearing_count  integer not null
);

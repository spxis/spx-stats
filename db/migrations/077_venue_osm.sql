-- Outline, pitches and bearings of the home venues from OpenStreetMap, in their own table because they are ODbL 1.0 data
-- ("(c) OpenStreetMap contributors"), not CC0 like the other venue tables. One row per footprint (the stadium outline), pitch
-- (a playing field with its sport and bearing) and wall (a mapped baseball outfield wall) of a venue (api.venue_place.wikidata_id).
-- Filled by db/build/204_venue_osm.sql from legacy_osm (migration 076, DS1 only). Geometry is simplified to 1 m GeoJSON text.
-- A few hundred rows, about 1 MB. On production it is filled by a data release: table core.brand_venue_osm (and meta.source if the
-- OpenStreetMap source_id differs between DS1 and production).
-- Anything that shows or republishes these rows carries the credit line in meta.source.attribution; a published file of them is ODbL
-- (scripts/osm_venues/README.md).

insert into meta.source (code, name, kind, licence, attribution, url, notes)
values ('openstreetmap', 'OpenStreetMap', 'dataset', 'ODbL 1.0',
        '(c) OpenStreetMap contributors, ODbL 1.0, openstreetmap.org/copyright',
        'https://www.openstreetmap.org/copyright',
        'Venue outlines, pitches, field bearings and mapped baseball walls, read from the Overpass API; kept in core.brand_venue_osm only (ODbL, share-alike).')
on conflict (code) do nothing;

create table if not exists core.brand_venue_osm (
  wikidata_id     text not null,
  kind            text not null check (kind in ('footprint', 'pitch', 'wall')),
  seq             smallint not null,
  sport           text,                     -- pitch: baseball, american_football, canadian_football, soccer, ice_hockey, basketball (';' separated); wall: baseball or softball
  geojson         text not null,            -- GeoJSON geometry (Polygon, MultiPolygon or LineString), lon/lat, simplified to 1 m
  area_m2         integer,
  bearing_deg     numeric(4, 1),            -- degrees clockwise from north
  bearing_kind    text check (bearing_kind in ('home_to_center', 'long_axis')),   -- home_to_center 0-360 (baseball); long_axis 0-180
  bearing_method  text,
  ref_lat         numeric(9, 6),            -- baseball: home plate
  ref_lon         numeric(9, 6),
  length_m        numeric(6, 1),
  width_m         numeric(6, 1),
  osm_name        text,
  matched_by      text not null check (matched_by in ('wikidata', 'proximity', 'inside_footprint')),
  distance_m      integer,
  osm_type        text not null,
  osm_id          bigint not null,
  osm_version     integer,
  osm_timestamp   timestamptz,
  source_id       smallint not null references meta.source,
  source_key      text not null,            -- osm:way/123@v7: the OSM element and its version
  external_id     text not null,            -- way/123
  licence         text not null default 'ODbL-1.0' check (licence = 'ODbL-1.0'),
  primary key (wikidata_id, kind, seq),
  check (bearing_deg is null or (bearing_kind = 'home_to_center' and bearing_deg >= 0 and bearing_deg < 360)
                              or (bearing_kind = 'long_axis' and bearing_deg >= 0 and bearing_deg < 180))
);
comment on table core.brand_venue_osm is 'ODbL 1.0, (c) OpenStreetMap contributors: outline, pitches (with bearing) and mapped baseball walls of the home venues. Never merge with CC0 rows.';

create or replace view api.venue_osm as
select o.wikidata_id, o.kind, o.seq, o.sport, o.geojson, o.area_m2, o.bearing_deg, o.bearing_kind, o.ref_lat, o.ref_lon, o.length_m, o.width_m,
       o.matched_by, o.distance_m, o.source_key, o.licence, s.attribution
from core.brand_venue_osm o join meta.source s using (source_id);
comment on view api.venue_osm is 'ODbL 1.0 data from OpenStreetMap: outline, pitches (bearing in degrees clockwise from north) and walls of a home venue. Show the attribution column wherever it is used.';
grant select on api.venue_osm to anon, authenticated;

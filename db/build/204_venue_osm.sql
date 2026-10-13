-- core.brand_venue_osm (migration 077) from legacy_osm (migration 076; scripts/osm_venues/load.py picked the footprint, pitches, bearings and
-- walls). Run from the repo root, as scripts/build_core.sh does, after the venue steps (176_venue_place.sql, 193_venue_names.sql). Rerunnable:
-- the table is emptied and filled again, and last run's data issues are replaced.
-- OpenStreetMap data is ODbL 1.0: these rows stay in this table and are never copied into a CC0 table. Provenance: source_key is
-- osm:<type>/<id>@v<version>, external_id <type>/<id>.
-- Needs meta.source 'openstreetmap' (migration 077).

delete from core.brand_venue_osm;
insert into core.brand_venue_osm (wikidata_id, kind, seq, sport, geojson, area_m2, bearing_deg, bearing_kind, bearing_method, ref_lat, ref_lon,
                                  length_m, width_m, osm_name, matched_by, distance_m, osm_type, osm_id, osm_version, osm_timestamp,
                                  source_id, source_key, external_id)
select d.qid, d.kind, d.seq, d.sport, d.geojson, d.area_m2, d.bearing_deg, d.bearing_kind, d.bearing_method, d.ref_lat, d.ref_lon,
       d.length_m, d.width_m, d.osm_name, d.matched_by, d.distance_m, d.osm_type, d.osm_id, e.version, e.osm_timestamp,
       (select source_id from meta.source where code = 'openstreetmap'),
       'osm:' || d.osm_type || '/' || d.osm_id || '@v' || coalesce(e.version::text, '?'),
       d.osm_type || '/' || d.osm_id
from legacy_osm.derived d
join legacy_osm.element e using (qid, osm_type, osm_id);

-- Unknowns: a venue with no outline, no pitch, or no bearing is logged, never guessed. One row per venue (entity_key = Wikidata id).
delete from meta.data_issue where entity_kind = 'venue_osm';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'openstreetmap'), 'venue_osm', v.qid,
       'OpenStreetMap: ' || coalesce(q.name, v.qid) || ' has ' ||
       concat_ws('; ',
         case when v.footprint in ('none', 'ambiguous') then 'no outline (' || v.footprint || ')' end,
         case when v.footprint in ('wikidata', 'proximity') and v.pitch_count = 0 then 'no pitch inside the outline' end,
         case when v.pitch_count > 0 and v.bearing_count = 0 and mlb.qid is null then 'no field bearing' end,
         case when mlb.qid is not null and v.footprint in ('wikidata', 'proximity')
                   and not exists (select 1 from legacy_osm.derived d where d.qid = v.qid and d.kind = 'pitch' and d.sport like '%baseball%' and d.bearing_deg is not null)
              then 'no baseball field bearing' end)
       || coalesce(' [' || nullif(v.reason, '') || ']', ''),
       'Left empty; OpenStreetMap is not changed and nothing is guessed.'
from legacy_osm.verdict v
join legacy_osm.query q using (qid)
left join (select distinct b.source_key as qid
           from core.brand_venue b
           join core.franchise_brand fb on fb.home_venue = b.venue_label and fb.latitude = b.latitude and fb.longitude = b.longitude
           join core.franchise_league fl on fl.franchise_id = fb.franchise_id
           where fl.league_code = 'mlb') mlb on mlb.qid = v.qid
where v.footprint in ('none', 'ambiguous')
   or v.pitch_count = 0
   or v.bearing_count = 0
   or (mlb.qid is not null and not exists (select 1 from legacy_osm.derived d where d.qid = v.qid and d.kind = 'pitch' and d.sport like '%baseball%' and d.bearing_deg is not null));

analyze core.brand_venue_osm;
select count(*) filter (where kind = 'footprint') as footprints, count(*) filter (where kind = 'pitch') as pitches,
       count(*) filter (where kind = 'pitch' and bearing_deg is not null) as bearings, count(*) filter (where kind = 'wall') as walls
from core.brand_venue_osm;

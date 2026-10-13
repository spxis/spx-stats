-- what: OpenStreetMap venue rows (ODbL) with a source other than openstreetmap, a source_key without an element version, or a bearing with no kind
-- baseline: 0
select o.wikidata_id || ' ' || o.kind || ' ' || o.seq as problem from core.brand_venue_osm o
where o.source_id <> (select source_id from meta.source where code = 'openstreetmap')
   or o.source_key not like 'osm:%@v%'
   or (o.bearing_deg is not null and o.bearing_kind is null)

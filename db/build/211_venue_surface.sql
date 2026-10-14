-- core.venue.surface and roof, and core.venue_feature.surface, in the fixed list (migration 089). Run from the repo root, after 193_venue_names.sql and
-- 198_home_venue.sql (which copies core.brand_venue_info into the venues it adds). Rerunnable.
--   * A venue that has a core.brand_venue_info row takes that row's surface (one of ref.venue_surface) and its roof, when the row has one.
--   * Any other surface text (step 176_franchise_info.sql copies Wikidata's raw P765 label, "lawn", "artificial turf") is mapped with the same
--     ref.venue_surface_rule as step 193; a text no rule covers becomes null and is logged (meta.data_issue 'venue_surface'), never guessed.
-- core.venue.surface of a venue with no source stays null.

create or replace function pg_temp.surf(t text) returns text language sql stable as $$
  with parts as (select btrim(x) as p from unnest(string_to_array(t, ';')) x where btrim(x) <> ''),
       m as (select p, (select r.surface from ref.venue_surface_rule r where p ~* r.pattern order by r.rank limit 1) as s from parts)
  select case when count(*) = 0 or bool_or(s is null) then null when count(distinct s) = 1 then min(s) else 'multi' end from m $$;

-- keep the text a venue had, to log what could not be mapped
create temp table surf_before as select venue_id, source_key, surface from core.venue where surface is not null;

update core.venue v set surface = i.surface
from core.brand_venue_info i
where v.source_key = i.wikidata_id and v.source_id = (select source_id from meta.source where code = 'wikidata') and i.surface is not null
  and v.surface is distinct from i.surface;
update core.venue v set roof = i.roof
from core.brand_venue_info i
where v.source_key = i.wikidata_id and v.source_id = (select source_id from meta.source where code = 'wikidata') and i.roof is not null
  and v.roof is distinct from i.roof;
update core.venue v set surface = pg_temp.surf(v.surface)
where v.surface is not null and v.surface not in (select surface from ref.venue_surface);
update core.venue_feature f set surface = pg_temp.surf(f.surface)
where f.surface is not null and f.surface not in (select surface from ref.venue_surface);

delete from meta.data_issue where entity_kind = 'venue_surface_core';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikidata'), 'venue_surface_core', b.source_key,
       'Surface "' || b.surface || '" of venue ' || b.source_key || ' is not in the fixed list',
       'core.venue.surface left empty; add a rule to db/seed/venue_surface_rule.csv if it is a surface.'
from surf_before b join core.venue v using (venue_id)
where v.surface is null;

select 'venues with a surface' as what, count(*) as n from core.venue where surface is not null
union all select '  not in the list', count(*) from core.venue where surface is not null and surface not in (select surface from ref.venue_surface)
union all select 'venue_feature surfaces not in the list', count(*) from core.venue_feature where surface is not null and surface not in (select surface from ref.venue_surface)
union all select 'surface texts not mapped', count(*) from meta.data_issue where entity_kind = 'venue_surface_core';

-- what: cities with no coordinates, or whose metro area is not shared with another city, or aliases of a city that does not exist
-- baseline: 0
select slug as problem from ref.city where latitude is null or longitude is null
union all
select c.slug from ref.city c where c.metro_slug is not null and (select count(*) from ref.city o where o.metro_slug = c.metro_slug) < 2
union all
select a.alias_fold from ref.city_alias a where not exists (select 1 from ref.city c where c.slug = a.city_slug)

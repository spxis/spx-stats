-- Cities (migration 062): ref.metro, ref.city and ref.city_alias from the seed files, then the city of every team season. Run from the repo root,
-- as scripts/build_core.sh does. Rules and decisions: scripts/city/README.md. Rerunnable: every table is emptied and filled again.
--
-- The city of a team season, in this order:
--   1. identity  the city in the club's name that season (core.franchise_identity.location), when ref.city_alias knows the name.
--                "New York Giants" play in New Jersey and are still a club of New York; a club under a region's name (Minnesota,
--                Golden State) has no city here.
--   2. venue     else the city of the home venue whose brand era covers the end of the season (the rule api.team_brand's maps use).
--   3. venue_nearest  else, for a club whose name is a state or province (the SPX record's region, or db/seed/place_region.csv), the nearest
--                era with a venue in that same state or province.
-- A season none of these places is left out and logged in meta.data_issue (entity_kind 'city_unplaced'); no city is guessed.
-- Every club has a country though (migration 138): a season with no city takes the country on its identity (core.team_season_country, basis 'identity'),
-- else the one country of every other club of that league season with a known country (basis 'league_season'). Both tables are emptied and filled again.

drop table if exists pg_temp.seed_metro;
create temp table seed_metro (slug text, name text, name_fr text, note text);
\copy seed_metro from 'db/seed/metro.csv' with (format csv, header true)
drop table if exists pg_temp.seed_city;
create temp table seed_city (slug text, name text, name_fr text, region text, country_code text, metro text, note text);
\copy seed_city from 'db/seed/city.csv' with (format csv, header true)
drop table if exists pg_temp.seed_place;
create temp table seed_place (slug text, wikidata_id text, latitude numeric, longitude numeric);
\copy seed_place from 'db/seed/city_place.csv' with (format csv, header true)
drop table if exists pg_temp.seed_region;
create temp table seed_region (name text, region text, note text);
\copy seed_region from 'db/seed/place_region.csv' with (format csv, header true)
drop table if exists pg_temp.seed_alias;
create temp table seed_alias (alias text, slug text, note text);
\copy seed_alias from 'db/seed/city_alias.csv' with (format csv, header true)

delete from core.team_season_country;
delete from core.team_season_city;
delete from ref.city_alias;
delete from ref.city;
delete from ref.metro;

insert into ref.metro (slug, name, name_fr, note)
select slug, name, nullif(name_fr, ''), nullif(note, '') from seed_metro;

insert into ref.city (slug, name, name_fr, region, country_code, metro_slug, wikidata_id, latitude, longitude, note)
select c.slug, c.name, nullif(c.name_fr, ''), c.region, c.country_code, nullif(c.metro, ''), p.wikidata_id, p.latitude, p.longitude, nullif(c.note, '')
from seed_city c left join seed_place p using (slug);

insert into ref.city_alias (alias_fold, alias, city_slug, note)
select core.fold_text(alias), alias, slug, nullif(note, '') from seed_alias;

-- every team season with the city its identity names
drop table if exists pg_temp.ts;
create temp table ts as
select t.team_season_id, t.franchise_id, t.season_id, s.league_code, s.start_year as year, make_date(s.start_year, 12, 31) as day,
       nullif(i.country_code, '') as icountry, i.location, coalesce(i.region, r.region) as iregion, a.city_slug as identity_city
from core.team_season t
join core.season s using (season_id)
left join core.franchise_identity i on i.franchise_identity_id = t.franchise_identity_id
left join ref.city_alias a on a.alias_fold = core.fold_text(i.location)
left join seed_region r on core.fold_text(r.name) = core.fold_text(i.location);

-- every home venue of a brand era with the city (and state or province) it stands in
drop table if exists pg_temp.venue;
create temp table venue as
select b.franchise_id, b.valid_during, b.home_venue, b.latitude, b.longitude, v.region, a.city_slug
from core.franchise_brand b
join core.brand_venue v on v.venue_label = b.home_venue and v.latitude = b.latitude and v.longitude = b.longitude
left join ref.city_alias a on a.alias_fold = core.fold_text(v.city)
where b.home_venue is not null and b.latitude is not null and b.longitude is not null;

-- the venue whose era covers the end of the season (the latest era to start, as the maps pick it)
drop table if exists pg_temp.cover;
create temp table cover as
select distinct on (t.team_season_id) t.team_season_id, v.home_venue, v.latitude, v.longitude, v.city_slug
from ts t join venue v on v.franchise_id = t.franchise_id and v.valid_during @> t.day
order by t.team_season_id, coalesce(lower(v.valid_during), '-infinity'::date) desc, v.home_venue;

-- the nearest era with a venue in the club's state or province, for a name that has no city
drop table if exists pg_temp.near;
create temp table near as
select distinct on (t.team_season_id) t.team_season_id, v.home_venue, v.latitude, v.longitude, v.city_slug
from ts t join venue v on v.franchise_id = t.franchise_id and v.region = t.iregion
where t.identity_city is null and v.city_slug is not null and not exists (select 1 from cover c where c.team_season_id = t.team_season_id and c.city_slug is not null)
order by t.team_season_id,
         least(coalesce(abs(t.day - lower(v.valid_during)), 1000000), coalesce(abs(t.day - upper(v.valid_during)), 1000000)),
         coalesce(lower(v.valid_during), '-infinity'::date) desc, v.home_venue;

insert into core.team_season_city (team_season_id, city_slug, basis, venue_label, venue_latitude, venue_longitude, venue_city_slug)
select t.team_season_id,
       coalesce(t.identity_city, c.city_slug, n.city_slug),
       case when t.identity_city is not null then 'identity' when c.city_slug is not null then 'venue' else 'venue_nearest' end,
       case when t.identity_city is null and c.city_slug is null then n.home_venue else c.home_venue end,
       case when t.identity_city is null and c.city_slug is null then n.latitude else c.latitude end,
       case when t.identity_city is null and c.city_slug is null then n.longitude else c.longitude end,
       case when t.identity_city is null and c.city_slug is null then n.city_slug else c.city_slug end
from ts t
left join cover c on c.team_season_id = t.team_season_id
left join near n on n.team_season_id = t.team_season_id
where coalesce(t.identity_city, c.city_slug, n.city_slug) is not null;

-- the country of a season with no city: its identity's, else the one country every other club of that league season with a known country is in
drop table if exists pg_temp.season_country;
create temp table season_country as
select t.season_id, min(coalesce(c.country_code, t.icountry)) as country_code
from ts t
left join core.team_season_city x on x.team_season_id = t.team_season_id
left join ref.city c on c.slug = x.city_slug
where coalesce(c.country_code, t.icountry) is not null
group by t.season_id
having count(distinct coalesce(c.country_code, t.icountry)) = 1;

insert into core.team_season_country (team_season_id, country_code, basis)
select t.team_season_id, coalesce(t.icountry, k.country_code), case when t.icountry is not null then 'identity' else 'league_season' end
from ts t
left join season_country k on k.season_id = t.season_id
where not exists (select 1 from core.team_season_city c where c.team_season_id = t.team_season_id)
  and coalesce(t.icountry, k.country_code) is not null;

-- seasons that no rule placed: one line per club and run of years
delete from meta.data_issue where entity_kind = 'city_unplaced';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'spx_stats_derived'), 'city_unplaced', r.league_code || ':' || r.franchise_id,
       'No city for ' || r.league_code || ' franchise ' || r.franchise_id || ', ' || r.first_year || case when r.last_year > r.first_year then '-' || r.last_year else '' end
         || ' (' || r.seasons || ' seasons): its name ' || coalesce('"' || r.location || '"', '(none)') || ' names no city in ref.city_alias and no venue is on record for those years.',
       'Left off the city pages; no city is guessed. Add the name to db/seed/city_alias.csv if it is a city.'
from (select t.league_code, t.franchise_id, t.location, min(t.year) as first_year, max(t.year) as last_year, count(*) as seasons
      from ts t where not exists (select 1 from core.team_season_city c where c.team_season_id = t.team_season_id)
      group by t.league_code, t.franchise_id, t.location) r;

analyze ref.city;
analyze core.team_season_city;

select 'metros' as what, count(*) as n from ref.metro
union all select 'cities', count(*) from ref.city
union all select 'cities with coordinates', count(latitude) from ref.city
union all select 'aliases', count(*) from ref.city_alias
union all select 'team seasons', count(*) from ts
union all select 'placed by identity', count(*) from core.team_season_city where basis = 'identity'
union all select 'placed by venue', count(*) from core.team_season_city where basis = 'venue'
union all select 'placed by nearest venue', count(*) from core.team_season_city where basis = 'venue_nearest'
union all select 'not placed', (select count(*) from ts) - count(*) from core.team_season_city
union all select 'country only by identity', count(*) from core.team_season_country where basis = 'identity'
union all select 'country only by league season', count(*) from core.team_season_country where basis = 'league_season'
union all select 'no city and no country', (select count(*) from ts) - (select count(*) from core.team_season_city) - (select count(*) from core.team_season_country)
union all select 'cities with no club', count(*) from ref.city c where not exists (select 1 from core.team_season_city x where x.city_slug = c.slug);

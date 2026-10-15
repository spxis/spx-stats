-- Logos for the name eras Wikidata gave none (or a non-free one): Wikimedia Commons files read by the sweep (public domain or other free
-- licences, legacy_team_brand.commons_logo, migration 108) and SportsLogos.Net marks (legacy_sportslogos.logo, shown small under fair use,
-- served from our own file). Which file goes to which name era is db/seed/logo_extra.csv, checked by hand:
--   league       nhl, nba, mlb, nfl, cfl, or 'other' for a club that never played in one (the PCHA clubs)
--   team         the identity's full name, as core.franchise_identity.full_name has it
--   from_year    first year the logo applies (empty: the identity's first day); to_year the last year (empty: the identity's last day)
--   source       wikimedia_commons or sportslogos
--   file_key     the Commons file name (underscores) or the SportsLogos.Net logo key
--   replaces     'nonfree' when it stands in for a non-free (fair use) logo the identity wears now; empty when it fills a gap
--   note         why this file, for whoever reads the CSV
-- Run after 175_team_brand.sql (the Wikidata rows exist) from the repo root, as scripts/build_core.sh does. Rerunnable: it first removes
-- the rows of the two sources it writes. A file the seed names that the legacy tables lack is reported, not guessed.
drop table if exists pg_temp.seed_logo_extra;
create temp table seed_logo_extra (league text, team text, from_year integer, to_year integer, source text, file_key text, replaces text, note text);
\copy seed_logo_extra from 'db/seed/logo_extra.csv' with (format csv, header true)

delete from core.franchise_brand where source_id in (select source_id from meta.source where code in ('wikimedia_commons', 'sportslogos'));

create or replace function pg_temp.norm(t text) returns text language sql immutable as $$
  select regexp_replace(translate(lower(t), 'éèêëáàâäóôöíîïúûüçñ', 'eeeeaaaaoooiiiuuucn'), '[^a-z0-9]', '', 'g') $$;

-- the file behind each seed row: its URL as the page draws it, its licence text and its page
create temp table logo_extra_file as
select s.*,
       case s.source
         when 'wikimedia_commons' then coalesce(c.file_url, '')
         else l.hosted_path end as url,
       case s.source
         when 'wikimedia_commons' then coalesce(c.licence, '') || case when c.restrictions ilike '%trademark%' then ' (trademark)' else '' end
         else 'Fair use, via SportsLogos.Net' end as licence,
       case s.source when 'wikimedia_commons' then c.page_url else l.page_url end as page,
       case s.source when 'wikimedia_commons' then c.page_url else l.page_url end as source_key
from seed_logo_extra s
left join legacy_team_brand.commons_logo c on s.source = 'wikimedia_commons' and c.file = s.file_key
left join legacy_sportslogos.logo l on s.source = 'sportslogos' and l.sl_logo_key = s.file_key;

select 'logo_extra seed rows whose file is not loaded' as what, count(*) as n from logo_extra_file
where url is null or url = '' or page is null having count(*) > 0;

with ident as (
  select i.franchise_id, i.valid_during, pg_temp.norm(i.full_name) n,
         coalesce((select min(fl.league_code) from core.franchise_league fl where fl.franchise_id = i.franchise_id), 'other') as league
  from core.franchise_identity i
), pick as (   -- the identity each seed row is for, and the days it covers
  select f.*, i.franchise_id, i.valid_during as ivd,
         daterange(case when f.from_year is null then lower(i.valid_during) else greatest(make_date(f.from_year, 1, 1), lower(i.valid_during)) end,
                   case when f.to_year is null then upper(i.valid_during) else least(make_date(f.to_year + 1, 1, 1), coalesce(upper(i.valid_during), 'infinity')) end) as rng
  from logo_extra_file f
  join ident i on i.league = f.league and i.n = pg_temp.norm(f.team)
  where f.url is not null and f.url <> '' and f.page is not null
    and (f.from_year is null or f.from_year < coalesce(extract(year from upper(i.valid_during))::int + 1, 9999))
    and (f.to_year is null or f.to_year >= extract(year from lower(i.valid_during))::int)
), gone as (   -- a non-free logo this one replaces: removed from the rows it fully covers (the row keeps its colours and venue)
  update core.franchise_brand b set logo_url = null, logo_licence = null, logo_page = null
  from pick p
  where p.replaces = 'nonfree' and b.franchise_id = p.franchise_id and b.logo_url is not null
    and b.logo_licence ilike 'Non-free%' and b.valid_during <@ p.rng
  returning b.franchise_brand_id
)
insert into core.franchise_brand (franchise_id, valid_during, logo_url, logo_licence, logo_page, source_id, source_key)
select p.franchise_id, p.rng, p.url, p.licence, p.page, (select source_id from meta.source where code = p.source), p.source_key
from pick p
where not isempty(p.rng)
on conflict (franchise_id, valid_during, source_id) do nothing;

-- A seed row that matched no identity (a typo, a renamed club, years outside the identity).
select 'logo_extra seed rows matching no name era' as what, count(*) as n from logo_extra_file f
where not exists (select 1 from core.franchise_identity i
                  where pg_temp.norm(i.full_name) = pg_temp.norm(f.team)
                    and coalesce((select min(fl.league_code) from core.franchise_league fl where fl.franchise_id = i.franchise_id), 'other') = f.league)
having count(*) > 0;
-- A non-free logo this file was meant to replace that only partly overlaps it stays, and both would draw: list them.
select 'logo_extra replacements left partly overlapping' as what, count(*) as n
from core.franchise_brand n join core.franchise_brand o on o.franchise_id = n.franchise_id and o.logo_licence ilike 'Non-free%' and o.valid_during && n.valid_during
where n.source_id in (select source_id from meta.source where code in ('wikimedia_commons', 'sportslogos'))
having count(*) > 0;

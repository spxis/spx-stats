-- Logos for the name eras Wikidata gave none (or a non-free one): Wikimedia Commons files read by the sweep (public domain or other free
-- licences, legacy_team_brand.commons_logo, migration 108) and SportsLogos.Net marks (legacy_sportslogos.logo, shown small under fair use,
-- served from our own file). Which file goes to which name era is db/seed/logo_extra.csv, checked by hand:
--   league       any league the club belonged to (nhl, nba, mlb, nfl, cfl, or a rival or predecessor league: afl, aafc, nha, pcha, wchl, wha) or that
--                league's parent (afl is also nfl, pcha is also nhl: the PARENT map of web/src/lib/leagues.ts, copied below), so a club that
--                moved from the AFL to the NFL answers to both; 'other' only for a club with no league row at all
--   team         the identity's full name, as core.franchise_identity.full_name has it
--   from_year    first season (its first year) the logo applies (empty: the identity's first day, open for a club's first name like 175_team_brand)
--   to_year      last season it applies (empty: the identity's last day, open for the current name). A name that several identity rows
--                share (a split era) must give both, or the row would reach every one of them. So must a name two clubs share
--                (the AAFC's and the NFL's Baltimore Colts): an empty from_year starts at the first day of any club of that name.
--   source       wikimedia_commons or sportslogos
--   file_key     the Commons file name (underscores) or the SportsLogos.Net logo key
--   replaces     empty: fills a gap; 'nonfree': stands in for the non-free (fair use) logo the era wears; 'free': replaces a free logo
--                (a PD SVG for a raster of the same kind). The rows it replaces lose their logo and keep their colours and venue.
--   note         why this file, for whoever reads the CSV
-- Runs after 175_team_brand.sql (the Wikidata rows exist) and before 175_team_logo_fit.sql (which checks its files against the logos), from
-- the repo root, as scripts/build_core.sh does. Rerunnable: it first removes the rows of the two sources it writes. A file the seed names
-- that the legacy tables lack is reported, not guessed.
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

-- Every league name a seed row may use for a franchise: the leagues it has a row for, each one's parent, or 'other' when it has none.
-- Keep the parents in step with PARENT in web/src/lib/leagues.ts.
create temp table league_parent (league text primary key, parent text not null);
insert into league_parent values ('afl', 'nfl'), ('aafc', 'nfl'), ('nha', 'nhl'), ('pcha', 'nhl'), ('wchl', 'nhl'), ('wha', 'nhl');
create temp table franchise_league_name as
select franchise_id, league_code as league from core.franchise_league
union select fl.franchise_id, p.parent from core.franchise_league fl join league_parent p on p.league = fl.league_code
union select f.franchise_id, 'other' from core.franchise f where not exists (select 1 from core.franchise_league fl where fl.franchise_id = f.franchise_id);

with ident as (
  select i.franchise_id, i.valid_during, pg_temp.norm(i.full_name) n,
         i.valid_during = first_value(i.valid_during) over w as is_first,
         i.valid_during = last_value(i.valid_during) over w as is_last
  from core.franchise_identity i
  window w as (partition by i.franchise_id order by lower(i.valid_during) nulls first rows between unbounded preceding and unbounded following)
), pick as (   -- the identity each seed row is for, and the days it covers (a club's first and last identity are open at the ends, as in 175_team_brand)
  select f.*, i.franchise_id,
         -- a year that reaches the identity's own first or last season means the identity's own bound (so a row that covers a whole identity
         -- lines up exactly with the Wikidata rows it may replace, whatever the club's other identities of the same name)
         daterange(case when f.from_year is null or f.from_year <= extract(year from lower(i.valid_during))::int
                        then (case when i.is_first then null else lower(i.valid_during) end)
                        else make_date(f.from_year, 1, 1) end,
                   case when f.to_year is null or (upper(i.valid_during) is not null and f.to_year >= extract(year from upper(i.valid_during))::int - 1)
                        then (case when i.is_last then null else upper(i.valid_during) end)
                        else make_date(f.to_year + 1, 1, 1) end) as rng
  from logo_extra_file f
  join ident i on i.n = pg_temp.norm(f.team)
  join franchise_league_name fn on fn.franchise_id = i.franchise_id and fn.league = f.league
  where f.url is not null and f.url <> '' and f.page is not null
    and (f.from_year is null or f.from_year <= coalesce(extract(year from upper(i.valid_during))::int - 1, 9999))   -- a year is a season's first year
    and (f.to_year is null or f.to_year >= extract(year from lower(i.valid_during))::int)
), gone as (   -- a logo this one replaces: removed from the rows it fully covers (the row keeps its colours and venue)
  update core.franchise_brand b set logo_url = null, logo_licence = null, logo_page = null
  from pick p
  where p.replaces in ('nonfree', 'free') and b.franchise_id = p.franchise_id and b.logo_url is not null
    and (b.logo_licence ilike 'Non-free%') = (p.replaces = 'nonfree') and b.valid_during <@ p.rng
  returning b.franchise_brand_id
)
insert into core.franchise_brand (franchise_id, valid_during, logo_url, logo_licence, logo_page, source_id, source_key)
select p.franchise_id, p.rng, p.url, p.licence, p.page, (select source_id from meta.source where code = p.source), p.source_key
from pick p
where not isempty(p.rng)
on conflict (franchise_id, valid_during, source_id) do nothing;

-- A row left with no logo, no colours and no venue after a replacement carries nothing.
delete from core.franchise_brand where logo_url is null and primary_hex is null and secondary_hex is null and home_venue is null and latitude is null;

-- A seed row that matched no identity (a typo, a renamed club, years outside the identity).
select 'logo_extra seed rows matching no name era' as what, count(*) as n from logo_extra_file f
where not exists (select 1 from core.franchise_identity i
                  join franchise_league_name fn on fn.franchise_id = i.franchise_id
                  where pg_temp.norm(i.full_name) = pg_temp.norm(f.team) and fn.league = f.league)
having count(*) > 0;
-- A logo this file was meant to replace that only partly overlaps it stays, and both would draw: list them.
select 'logo_extra replacements left partly overlapping' as what, count(*) as n
from core.franchise_brand n join core.franchise_brand o on o.franchise_id = n.franchise_id and o.franchise_brand_id <> n.franchise_brand_id
  and o.logo_url is not null and o.valid_during && n.valid_during and n.logo_url is not null
where n.source_id in (select source_id from meta.source where code in ('wikimedia_commons', 'sportslogos'))
having count(*) > 0;

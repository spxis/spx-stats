-- NWSL club colours (core.franchise_brand), from db/seed/nwsl_colour.csv. Wikipedia's colour modules have no NWSL entries and Wikidata gives
-- these clubs no colour (P462), so the colours are the ones English Wikipedia's club article uses for its own squad table: the header's
-- background is the primary colour, its border the secondary (CC BY-SA 4.0; source 'wikipedia'). source_key is
-- 'enwiki:<article title>@<revision id>#roster-header', the revision the colours were read from. A club's colours are left out where no
-- colour is stated (see the note column); never guessed.
-- Rerunnable and id-keeping: a row is updated in place by (franchise, years, source); a row this step wrote that the seed no longer holds is removed.
-- Run after 175_team_brand.sql (franchises exist).
drop table if exists pg_temp.seed_nwsl_colour;
create temp table seed_nwsl_colour (club text, from_date date, until_date date, primary_hex text, secondary_hex text, source_title text, source_revid bigint, note text);
\copy seed_nwsl_colour from 'db/seed/nwsl_colour.csv' with (format csv, header true)

create or replace function pg_temp.norm(t text) returns text language sql immutable as $$
  select regexp_replace(translate(lower(t), 'éèêëáàâäóôöíîïúûüçñ', 'eeeeaaaaoooiiiuuucn'), '[^a-z0-9]', '', 'g') $$;

drop table if exists pg_temp.nwsl_brand_new;
create temp table nwsl_brand_new as
select distinct on (f.franchise_id, daterange(s.from_date, s.until_date))
       f.franchise_id, daterange(s.from_date, s.until_date) as vd, s.primary_hex, nullif(s.secondary_hex, '') as secondary_hex,
       'enwiki:' || s.source_title || '@' || s.source_revid || '#roster-header' as source_key
from seed_nwsl_colour s
join core.franchise_identity i on pg_temp.norm(i.full_name) = pg_temp.norm(s.club)
join (select distinct franchise_id from core.franchise_league where league_code = 'nwsl') f on f.franchise_id = i.franchise_id
order by f.franchise_id, daterange(s.from_date, s.until_date), s.source_revid;

do $$
declare want int; got int;
begin
  select count(*) into want from seed_nwsl_colour;
  select count(*) into got from nwsl_brand_new;
  if got <> want then raise exception 'nwsl colours: % seed rows but % matched a franchise identity', want, got; end if;
end $$;

insert into core.franchise_brand (franchise_id, valid_during, primary_hex, secondary_hex, source_id, source_key)
select franchise_id, vd, primary_hex, secondary_hex, (select source_id from meta.source where code = 'wikipedia'), source_key
from nwsl_brand_new
on conflict (franchise_id, valid_during, source_id)
do update set primary_hex = excluded.primary_hex, secondary_hex = excluded.secondary_hex, source_key = excluded.source_key;

-- only rows this step owns: NWSL, source wikipedia, key ending '#roster-header', not in the seed any more
delete from core.franchise_brand b
using meta.source src
where src.source_id = b.source_id and src.code = 'wikipedia' and b.source_key like 'enwiki:%#roster-header'
  and exists (select 1 from core.franchise_league fl where fl.franchise_id = b.franchise_id and fl.league_code = 'nwsl')
  and not exists (select 1 from nwsl_brand_new n where n.franchise_id = b.franchise_id and n.vd = b.valid_during);

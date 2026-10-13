-- Birth country (and, where a source gives them, birth city and region) of NHL players, set only where core.person has none.
-- Run from the repo root (it reads db/seed/birthplace_token.csv). Rerunnable, and safe after scripts/build_core.sh: every key it uses is stable.
-- Sources, highest first (SPX's value wins where SPX has one; a lower source that agrees is a verification, one that disagrees a data issue):
--   1. SPX: legacy_spx.tbl_nhl_rosters and tbl_nhl_rosters_raw_yahoo, "City, Province/State/Country". The last part is read through
--      db/seed/birthplace_token.csv. SPX has no player id that is shared with the NHL's, so a row is matched to a person only when the
--      folded name AND the birth date are both equal (the birth date being the person's own, else Wikidata's for the same NHL id) and exactly
--      one person fits. A country that no longer exists (USSR, Czechoslovakia, Yugoslavia) gives no code: it is compatible with a list of
--      present-day codes instead, and a second source's code that is in that list confirms it.
--   2. Wikidata (CC0): legacy_wikidata.result 'nhl_birthplace' (scripts/wikidata/queries/nhl_birthplace.rq), one row per NHL.com player id (P3522),
--      with the country of the birth place (P19, then P17, then the ISO code P297). Matched by the NHL id, which core.external_id already holds
--      (source nhl_api). A place with no country code, or a code that ref.country lacks, is logged and not used.
--   3. English Wikipedia (CC BY-SA 4.0): the birth_place line of the infobox, legacy_wikipedia_birth.infobox (scripts/wikipedia_birth/), for players
--      whose article title core.external_id holds (source wikipedia), read through the same token list ("Ottawa, Ontario, Canada": the last part).
--   The NHL's own API was not used for this: nhl.com's terms of service forbid "unauthorized spidering, scraping, or harvesting of content".
-- Provenance: meta.verification (entity_kind 'person', field 'birth_country_code') has one row per source that states a country for the
-- person: 'confirmed' when it agrees with what core.person holds, 'disputed' when it does not (with the value it gave).
-- Nothing is written to nationality_code: a birth country is not a citizenship.
begin;

create temp table src on commit drop as
select (select source_id from meta.source where code = 'spx_database') as spx, (select source_id from meta.source where code = 'wikidata') as wd,
       (select source_id from meta.source where code = 'wikipedia') as wp;

-- The NHL players this is about: a person with an NHL season line or roster stint.
create temp table nhlp on commit drop as
select distinct s.person_id from core.player_season_stat s join core.team_season ts using (team_season_id) join core.season z using (season_id)
 where z.league_code = 'nhl'
union
select distinct r.person_id from core.roster_stint r join core.team_season ts using (team_season_id) join core.season z using (season_id)
 where z.league_code = 'nhl';

-- ---- Wikidata ----
create temp table wd0 on commit drop as
select r.row->>'nhl' as nhl, r.row->>'person' as person_uri, nullif(r.row->>'birthPlace', '') as place, nullif(r.row->>'countries', '') as countries,
       (r.row->>'birthDate')::timestamptz::date as bd
from legacy_wikidata.result r where r.query_name = 'nhl_birthplace';

create temp table wd1 on commit drop as
select x.entity_id as person_id, w.nhl, regexp_replace(w.person_uri, '^.*/', '') as qid, w.place, w.countries, w.bd
from wd0 w join core.external_id x on x.entity_kind = 'person' and x.source_id = (select source_id from meta.source where code = 'nhl_api') and x.external_key = w.nhl
join core.person p on p.person_id = x.entity_id and p.kind = 'player';

-- a person with two NHL ids that disagree gets no Wikidata code
create temp table wdp on commit drop as
select person_id, min(qid) as qid, min(nhl) as nhl,
       case when count(distinct countries) filter (where countries ~ '^[A-Z]{2}$') = 1 then min(countries) filter (where countries ~ '^[A-Z]{2}$') end as raw_code,
       min(place) as place, min(bd) as bd, count(distinct countries) filter (where countries is not null) as n_countries
from wd1 group by person_id;

create temp table wd_person on commit drop as
select w.person_id, w.qid, w.nhl, c.country_code as code,
       case when w.place ~ '^Q[0-9]+$' or w.place = c.name then null else w.place end as place, w.bd, w.raw_code, w.n_countries
from wdp w left join ref.country c on c.country_code = w.raw_code;

-- ---- SPX ----
create temp table tok on commit drop as select * from (values (''::text, ''::text, ''::text, ''::text)) v(token, country_code, region, compat) where false;
\copy tok from 'db/seed/birthplace_token.csv' with (format csv, header true)
create index on tok (lower(token));

create temp table sp0 on commit drop as
select 'roster'::text as src, roster_id::text as k, player_name as n, player_birth_date::date as bd, trim(player_birth_place) as bp
from legacy_spx.tbl_nhl_rosters where trim(coalesce(player_birth_place, '')) <> ''
union all
select 'yahoo', _row_hash, player_name,
       case when player_birthdate ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2}$'
            then make_date(1900 + split_part(player_birthdate, '/', 3)::int, split_part(player_birthdate, '/', 1)::int, split_part(player_birthdate, '/', 2)::int) end,
       trim(player_birthplace)
from legacy_spx.tbl_nhl_rosters_raw_yahoo where trim(coalesce(player_birthplace, '')) <> '';

create temp table sp1 on commit drop as
select s.*, case when s.bp like '%,%' then trim(regexp_replace(s.bp, ',[^,]*$', '')) end as city,
       trim(regexp_replace(s.bp, '^.*,', '')) as part,
       t.token is not null as known, nullif(t.country_code, '') as code, nullif(t.region, '') as region, string_to_array(nullif(t.compat, ''), '|') as compat
from sp0 s left join tok t on lower(t.token) = lower(trim(regexp_replace(s.bp, '^.*,', '')));

-- ---- Wikipedia ----
create temp table wp0 on commit drop as
select x.entity_id as person_id, i.title, i.birth_place as bp,
       trim(regexp_replace(i.birth_place, '^.*,', '')) as part,
       nullif(trim(split_part(i.birth_place, ',', 1)), '') as city,
       case when i.birth_place like '%,%' then trim(split_part(regexp_replace(i.birth_place, '^(.*),[^,]*$', '\1'), ',', -1)) end as before_part
from legacy_wikipedia_birth.infobox i
join core.external_id x on x.entity_kind = 'person' and x.source_id = (select wp from src) and x.external_key = i.title
join core.person p on p.person_id = x.entity_id and p.kind = 'player'
where i.birth_place is not null;

create temp table wp1 on commit drop as
select w.person_id, min(w.title) as title, min(w.bp) as bp, min(w.city) as city,
       case when count(distinct t.country_code) filter (where t.country_code <> '') = 1 then min(t.country_code) filter (where t.country_code <> '') end as code,
       count(distinct t.country_code) filter (where t.country_code <> '') as n_codes,
       -- the province or state is the part before a country name
       min(r.region) as region,
       string_to_array(min(t.compat) filter (where t.compat <> ''), '|') as compat,
       bool_or(t.token is not null) as known, min(w.part) as part
from wp0 w left join tok t on lower(t.token) = lower(w.part)
left join tok r on lower(r.token) = lower(w.before_part) and r.region <> '' and r.country_code = t.country_code and t.region = ''
group by w.person_id;

create temp table wp_person on commit drop as
select person_id, title, bp, city, code, region, compat from wp1 where known;

-- the person's birth date for matching: their own, else the one Wikidata gives for the same NHL id
create temp table pe on commit drop as
select p.person_id, core.fold_text(p.full_name) as fn, coalesce(p.birth_date, w.bd) as bd
from core.person p join nhlp using (person_id) left join wd_person w on w.person_id = p.person_id;
create index on pe (fn, bd);

create temp table sp2 on commit drop as
select s.*, (select count(distinct e.person_id) from pe e where e.fn = core.fold_text(s.n) and e.bd = s.bd) as n_match,
       (select min(e.person_id) from pe e where e.fn = core.fold_text(s.n) and e.bd = s.bd) as person_id
from sp1 s where s.bd is not null;

-- one SPX statement per person: a rosters row before a Yahoo row, one with a code before one without; two codes that differ cancel out
create temp table spx_person on commit drop as
select distinct on (person_id) person_id, k, src, bp, city, region, compat,
       case when (select count(distinct m.code) from sp2 m where m.person_id = a.person_id and m.code is not null) = 1 then code end as code,
       (select count(distinct m.code) from sp2 m where m.person_id = a.person_id and m.code is not null) as n_codes
from sp2 a where n_match = 1 and known
order by person_id, (code is not null) desc, src, k;

-- ---- what each person ends with ----
create temp table cand on commit drop as
select a.person_id,
       coalesce(s.code, w.code, p.code) as code,
       case when s.code is not null then s.city when w.code is not null then w.place else p.city end as place,
       case when s.code is not null then s.region when w.code is not null then null else p.region end as region
from (select person_id from spx_person union select person_id from wd_person union select person_id from wp_person) a
left join spx_person s on s.person_id = a.person_id left join wd_person w on w.person_id = a.person_id left join wp_person p on p.person_id = a.person_id;

update core.person p set birth_country_code = c.code, birth_place = coalesce(p.birth_place, c.place), birth_region = coalesce(p.birth_region, c.region), updated_at = now()
from cand c where c.person_id = p.person_id and p.birth_country_code is null and c.code is not null
  and exists (select 1 from ref.country k where k.country_code = c.code);

-- ---- verification and issues ----
delete from meta.verification where entity_kind = 'person' and field = 'birth_country_code' and source_id in (select spx from src union select wd from src union select wp from src);
delete from meta.data_issue where entity_kind = 'person' and entity_key like 'birth-country:%';

create temp table pkey on commit drop as
select p.person_id, coalesce(min(x.external_key) filter (where x.source_id = (select source_id from meta.source where code = 'nhl_api')), 'person:' || p.person_id) as k
from core.person p left join core.external_id x on x.entity_kind = 'person' and x.entity_id = p.person_id
where p.person_id in (select person_id from spx_person union select person_id from wd_person union select person_id from wp_person)
group by p.person_id;

create temp table stated on commit drop as
select s.person_id, (select spx from src) as source_id, s.bp as their_value, null::text as evidence_url,
       case when s.code is not null then s.code = p.birth_country_code else p.birth_country_code = any (s.compat) end as agrees
from spx_person s join core.person p using (person_id) where p.birth_country_code is not null and (s.code is not null or s.compat is not null)
union all
select w.person_id, (select wd from src), w.code, 'https://www.wikidata.org/wiki/' || w.qid, w.code = p.birth_country_code
from wd_person w join core.person p using (person_id) where p.birth_country_code is not null and w.code is not null
union all
select w.person_id, (select wp from src), w.bp, 'https://en.wikipedia.org/wiki/' || replace(w.title, ' ', '_'),
       case when w.code is not null then w.code = p.birth_country_code else p.birth_country_code = any (w.compat) end
from wp_person w join core.person p using (person_id) where p.birth_country_code is not null and (w.code is not null or w.compat is not null);

insert into meta.verification (entity_kind, entity_id, field, status, source_id, evidence_url, their_value)
select 'person', person_id, 'birth_country_code', case when agrees then 'confirmed' else 'disputed' end::meta.verification_status, source_id, evidence_url, their_value
from stated;

-- a disagreement keeps the higher source's value, and is logged
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select st.source_id, 'person', 'birth-country:' || k.k || ':' || (select code from meta.source where source_id = st.source_id),
       format('%s (person %s) holds birth country %s; %s says %s', p.full_name, p.person_id, p.birth_country_code,
              (select code from meta.source where source_id = st.source_id), st.their_value),
       'Kept ' || p.birth_country_code
from stated st join core.person p using (person_id) join pkey k using (person_id) where not st.agrees;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select wp from src), 'person', 'birth-country:unparsed:wikipedia:' || part, format('Wikipedia infobox birth place "%s" (%s articles): "%s" is not in db/seed/birthplace_token.csv', min(bp), count(*), part), 'No country set from it'
from wp1 where not known group by part;

-- SPX places that could not be used
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select spx from src), 'person', 'birth-country:unparsed:' || part, format('SPX birth place "%s" (%s rows): "%s" is not in db/seed/birthplace_token.csv', min(bp), count(*), part), 'No country set from it'
from sp1 where not known group by part;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select spx from src), 'person', 'birth-country:spx-match:' || s.src || ':' || s.k,
       format('SPX %s "%s" (%s, born %s) fits %s people by name and birth date', s.src, s.n, s.bp, s.bd, s.n_match), 'Not matched, nothing set from it'
from sp2 s where s.n_match > 1;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select spx from src), 'person', 'birth-country:spx-conflict:' || k.k,
       format('SPX gives %s different birth countries for person %s', a.n_codes, a.person_id), 'SPX ignored for this person'
from spx_person a join pkey k using (person_id) where a.n_codes > 1;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select spx from src), 'person', 'birth-country:spx-ambiguous:' || k.k,
       format('SPX birth place "%s" is a country that no longer exists, so it gives no code; no other source has one for %s (person %s)', a.bp, p.full_name, p.person_id),
       'No country set'
from spx_person a join pkey k using (person_id) join core.person p using (person_id)
where a.code is null and p.birth_country_code is null;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select wd from src), 'person', 'birth-country:wikidata:' || k.k,
       format('Wikidata birth place %s of %s (person %s) %s', coalesce('"' || w.place || '"', '(none)'), p.full_name, p.person_id,
              case when w.raw_code is not null and w.code is null then 'has the country code ' || w.raw_code || ', which ref.country lacks'
                   when w.n_countries > 1 then 'has more than one country'
                   else 'has no country code' end),
       'No country set from it'
from wd_person w join core.person p using (person_id) join pkey k using (person_id) where w.code is null and p.birth_country_code is null;

-- counts for the run
select 'nhl players' as what, count(*) as n from nhlp
union all select 'with a birth country', count(*) from core.person p join nhlp using (person_id) where p.birth_country_code is not null;

commit;

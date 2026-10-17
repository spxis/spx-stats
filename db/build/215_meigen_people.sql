-- People from db/seed/wikidata_meigen_athlete.csv (Wikidata CC0, meigen-sports).
-- Match by Wikidata QID in core.external_id only, never by name. A QID we
-- already hold updates empty facts and adds sports; it never makes a second
-- record. New people get core.person + the wikidata QID. Exact-day dates
-- only (prec = 11). Birthplace is kept apart from citizenship: empty
-- nationality_code is filled from P27 → P297, empty birth_country_code from
-- P19 → P17 → P297, never overwritten, never treating birthplace as
-- citizenship. Nothing about ethnicity, religion, health, sex or gender, family
-- or politics. Rerunnable: writes a row only when the stored value is
-- distinct from the incoming one (a second run is a no-op). Deletes only
-- person_sport and data_issue rows this step owns and that are no longer
-- wanted (wikidata:<qid>:P641:<code> only; 217 owns p641-map: rows). Run after 185 and 214. No begin/commit: ds1-apply.sh wraps one
-- transaction. Seed is loaded first by python3 -I scripts/wikidata_meigen/load.py.
-- Country claims: db/seed/wikidata_meigen_claim.csv (\copy from the repo root),
-- plus harvest / legacy_people claims when those tables exist.
-- Run from the repo root.

insert into meta.source (code, name, kind, licence, attribution, url, notes)
values (
  'wikidata_meigen',
  'Wikidata (meigen-sports athletes)',
  'dataset',
  'CC0 1.0',
  'Wikidata contributors, CC0.',
  'https://www.wikidata.org/',
  'Athletes collected for meigen-sports. Sport rows use this source so db/build/182 does not delete them.'
)
on conflict (code) do nothing;

create temp table mg as
select source_id from meta.source where code = 'wikidata_meigen';
create temp table wd as
select source_id from meta.source where code = 'wikidata';
do $$ begin
  if not exists (select 1 from mg) then
    raise exception 'missing meta.source wikidata_meigen';
  end if;
  if not exists (select 1 from wd) then
    raise exception 'missing meta.source wikidata';
  end if;
end $$;

create temp table wrote (
  step text primary key,
  n    bigint not null
);

create temp table want as
select a.qid,
       min(a.label) as full_name,
       min(a.birth_on) filter (where a.birth_prec = 11) as birth_date,
       min(a.death_on) filter (where a.death_prec = 11) as death_date,
       min(nullif(btrim(a.birth_place), '')) as birth_place
from legacy_wikidata_meigen.athlete a
where a.qid ~ '^Q[0-9]+$'
  and nullif(btrim(a.label), '') is not null
group by a.qid;

create temp table sports as
select distinct a.qid, a.sport
from legacy_wikidata_meigen.athlete a
where a.qid ~ '^Q[0-9]+$'
  and a.sport ~ '^[a-z][a-z0-9_]*$';

create temp table by_qid as
select distinct on (x.external_key) x.external_key as qid, x.entity_id
from core.external_id x
where x.entity_kind = 'person' and x.external_key ~ '^Q[0-9]+$'
order by x.external_key,
         (x.source_id = (select source_id from wd)) desc,
         x.entity_id;

create temp table pp as
select w.qid,
       coalesce(b.entity_id, nextval(pg_get_serial_sequence('core.person', 'person_id'))) as person_id,
       (b.entity_id is not null) as existed
from want w
left join by_qid b using (qid);

insert into core.person (
  person_id, full_name, given_name, family_name, kind,
  birth_date, birth_place, death_date, source_id
)
overriding system value
select pp.person_id,
       w.full_name,
       nullif(btrim(regexp_replace(w.full_name, '\s+\S+$', '')), ''),
       (regexp_match(w.full_name, '(\S+)$'))[1],
       'player',
       w.birth_date,
       w.birth_place,
       w.death_date,
       (select source_id from mg)
from want w
join pp using (qid)
where not pp.existed
on conflict (person_id) do nothing;

with u as (
  update core.person p
  set birth_date = coalesce(p.birth_date, w.birth_date),
      death_date = coalesce(p.death_date, w.death_date),
      birth_place = coalesce(p.birth_place, w.birth_place),
      updated_at = now()
  from pp
  join want w using (qid)
  where p.person_id = pp.person_id
    and pp.existed
    and (
      p.birth_date is distinct from coalesce(p.birth_date, w.birth_date)
      or p.death_date is distinct from coalesce(p.death_date, w.death_date)
      or p.birth_place is distinct from coalesce(p.birth_place, w.birth_place)
    )
  returning p.person_id
)
insert into wrote values ('person_facts', (select count(*) from u));

insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'person', pp.person_id, (select source_id from wd), pp.qid
from pp
join core.person p using (person_id)
on conflict do nothing;

insert into core.person_sport (person_id, sport_code, source_id, source_key)
select pp.person_id,
       s.sport,
       (select source_id from mg),
       'wikidata:' || s.qid || ':P641:' || s.sport
from sports s
join pp using (qid)
join core.person p on p.person_id = pp.person_id
on conflict do nothing;

-- Only the meigen athlete CSV rows this step wrote (wikidata:<qid>:P641:<code>).
-- 217 owns p641-map:<qid>:<code> for harvest / legacy_people P641; leave those.
delete from core.person_sport ps
 where ps.source_id = (select source_id from mg)
   and exists (select 1 from pp where pp.person_id = ps.person_id)
   and ps.source_key like 'wikidata:%:P641:%'
   and not exists (
     select 1 from sports s
     join pp using (qid)
     where pp.person_id = ps.person_id
       and s.sport = ps.sport_code);

-- Wikidata claims for country fill: the meigen seed, then harvest and
-- legacy_people when those tables exist. P27 is a country item (Q766 =
-- Jamaica → P297 JM), never a city. P19 is a place; country via P297 on
-- the place itself or P17 → P297.
create temp table wd_claim (
  qid        text,
  prop       text,
  rank       text,
  value_qid  text,
  value_text text
);
create temp table mg_claim_raw (
  qid        text,
  prop       text,
  n          smallint,
  rank       text,
  value_qid  text,
  value_text text
);
\copy mg_claim_raw from 'db/seed/wikidata_meigen_claim.csv' with (format csv, header true)
insert into wd_claim (qid, prop, rank, value_qid, value_text)
select r.qid, r.prop, coalesce(nullif(btrim(r.rank), ''), 'normal'),
       nullif(btrim(r.value_qid), ''), nullif(btrim(r.value_text), '')
  from mg_claim_raw r
 where r.qid ~ '^Q[0-9]+$'
   and r.prop in ('P27', 'P19', 'P17', 'P297')
   and coalesce(nullif(btrim(r.rank), ''), 'normal') <> 'deprecated';

do $$
begin
  if to_regclass('legacy_wikidata_harvest.claim') is not null then
    insert into wd_claim (qid, prop, rank, value_qid, value_text)
    select c.qid, c.prop, coalesce(c.rank, 'normal'), c.value_qid, c.value_text
      from legacy_wikidata_harvest.claim c
     where c.prop in ('P27', 'P19', 'P17', 'P297')
       and coalesce(c.rank, 'normal') <> 'deprecated';
  end if;
  if to_regclass('legacy_people.claim') is not null then
    insert into wd_claim (qid, prop, rank, value_qid, value_text)
    select c.qid, c.prop, coalesce(c.rank, 'normal'), c.value_qid, c.value_text
      from legacy_people.claim c
     where c.prop in ('P27', 'P19', 'P17', 'P297')
       and coalesce(c.rank, 'normal') <> 'deprecated';
  end if;
end $$;

create index on wd_claim (qid, prop);

create temp table nationality as
with p27 as (
  select c.qid, min(c.value_qid) as country_qid
    from wd_claim c
   where c.prop = 'P27' and c.value_qid is not null
   group by c.qid
  having count(*) = count(c.value_qid) and count(distinct c.value_qid) = 1
), alpha2 as (
  select c.qid, min(c.value_text) as code
    from wd_claim c
   where c.prop = 'P297'
   group by c.qid
  having count(*) = count(c.value_text)
     and bool_and(c.value_text ~ '^[A-Z]{2}$')
     and count(distinct c.value_text) = 1
)
select p27.qid, alpha2.code
  from p27
  join alpha2 on alpha2.qid = p27.country_qid
  join ref.country rc on rc.country_code = alpha2.code;

create temp table birth_country as
with place as (
  select c.qid, min(c.value_qid) as place_qid
    from wd_claim c
   where c.prop = 'P19' and c.value_qid is not null
   group by c.qid
  having count(*) = count(c.value_qid) and count(distinct c.value_qid) = 1
), place_country as (
  select c.qid, min(c.value_qid) as country_qid
    from wd_claim c
   where c.prop = 'P17' and c.value_qid is not null
   group by c.qid
  having count(*) = count(c.value_qid) and count(distinct c.value_qid) = 1
), alpha2 as (
  select c.qid, min(c.value_text) as code
    from wd_claim c
   where c.prop = 'P297'
   group by c.qid
  having count(*) = count(c.value_text)
     and bool_and(c.value_text ~ '^[A-Z]{2}$')
     and count(distinct c.value_text) = 1
)
select place.qid, coalesce(direct.code, via.code) as code
  from place
  left join alpha2 direct on direct.qid = place.place_qid
  left join place_country pc on pc.qid = place.place_qid
  left join alpha2 via on via.qid = pc.country_qid
  join ref.country rc on rc.country_code = coalesce(direct.code, via.code);

with u as (
  update core.person p
     set nationality_code = n.code,
         updated_at = now()
    from pp
    join nationality n using (qid)
   where p.person_id = pp.person_id
     and p.nationality_code is null
     and p.nationality_code is distinct from n.code
  returning p.person_id
)
insert into wrote values ('nationality', (select count(*) from u));

with u as (
  update core.person p
     set birth_country_code = b.code,
         updated_at = now()
    from pp
    join birth_country b using (qid)
   where p.person_id = pp.person_id
     and p.birth_country_code is null
     and p.birth_country_code is distinct from b.code
  returning p.person_id
)
insert into wrote values ('birth_country', (select count(*) from u));

create temp table new_issues as
select 'meigen-people:possible-duplicate:' || w.qid || '+' || o.person_id as entity_key,
       'possible-duplicate: ' || w.full_name || ' (wikidata ' || w.qid
         || ', person ' || pp.person_id || ') and ' || o.full_name
         || ' (person ' || o.person_id
         || ') have the same name and birth_date and no shared id' as issue,
       'Not merged; a person decides' as resolution
from want w
join pp on pp.qid = w.qid
join core.person o
  on o.person_id <> pp.person_id
 and w.birth_date is not null
 and o.birth_date is not null
 and o.birth_date = w.birth_date
 and core.fold_text(o.full_name) = core.fold_text(w.full_name)
where not exists (
  select 1 from core.external_id x
  where x.entity_kind = 'person'
    and x.entity_id = o.person_id
    and x.external_key = w.qid);

delete from meta.data_issue d
 where d.source_id = (select source_id from mg)
   and d.entity_kind = 'person'
   and d.entity_key like 'meigen-people:%'
   and not exists (select 1 from new_issues n where n.entity_key = d.entity_key);

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from mg), 'person', n.entity_key, n.issue, n.resolution
from new_issues n
where not exists (
  select 1 from meta.data_issue d
   where d.source_id = (select source_id from mg)
     and d.entity_kind = 'person'
     and d.entity_key = n.entity_key);

select (select count(*) from want) as athletes,
       (select count(*) from pp where not existed) as new_people,
       (select count(*) from pp where existed) as matched_qid,
       (select n from wrote where step = 'person_facts') as person_fact_updates,
       (select n from wrote where step = 'nationality') as nationality_fills,
       (select n from wrote where step = 'birth_country') as birth_country_fills,
       (select count(*) from core.person_sport where source_id = (select source_id from mg)) as sports,
       (select count(*) from meta.data_issue where entity_key like 'meigen-people:%') as possible_duplicates;

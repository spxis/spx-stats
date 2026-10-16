-- People from db/seed/wikidata_meigen_athlete.csv (Wikidata CC0, meigen-sports).
-- Match by Wikidata QID in core.external_id only, never by name. A QID we
-- already hold updates empty facts and adds sports; it never makes a second
-- record. New people get core.person + the wikidata QID. Exact-day dates
-- only (prec = 11). Birthplace is kept apart from citizenship (P27 is not
-- read). Nothing about ethnicity, religion, health, sex or gender, family
-- or politics. Rerunnable: deletes only person_sport, data_issue and
-- legacy_wikidata_meigen.athlete rows this step owns (source wikidata_meigen).
-- Run after 185 and 214. No begin/commit: ds1-apply.sh wraps one transaction.
-- Seed is loaded first by python3 -I scripts/wikidata_meigen/load.py

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

delete from core.person_sport where source_id = (select source_id from mg);
delete from meta.data_issue
 where source_id = (select source_id from mg)
   and entity_key like 'meigen-people:%';

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

update core.person p
set birth_date = coalesce(p.birth_date, w.birth_date),
    death_date = coalesce(p.death_date, w.death_date),
    birth_place = coalesce(p.birth_place, w.birth_place),
    updated_at = now()
from pp
join want w using (qid)
where p.person_id = pp.person_id
  and pp.existed;

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

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from mg),
       'person',
       'meigen-people:possible-duplicate:' || w.qid || '+' || o.person_id,
       'possible-duplicate: ' || w.full_name || ' (wikidata ' || w.qid
         || ', person ' || pp.person_id || ') and ' || o.full_name
         || ' (person ' || o.person_id
         || ') have the same name and birth_date and no shared id',
       'Not merged; a person decides'
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

select (select count(*) from want) as athletes,
       (select count(*) from pp where not existed) as new_people,
       (select count(*) from pp where existed) as matched_qid,
       (select count(*) from core.person_sport where source_id = (select source_id from mg)) as sports,
       (select count(*) from meta.data_issue where entity_key like 'meigen-people:%') as possible_duplicates;

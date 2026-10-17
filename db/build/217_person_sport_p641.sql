-- Fill core.person_sport from Wikidata P641 (sport) and known P106 occupations.
-- Maps only QIDs already used as sports in this project (ref.sport / 179 / 180).
-- Does not invent a sport. Gridiron-player Q14128148 is skipped (American vs Canadian).
-- Source wikidata_meigen so db/build/182 (person_career, source wikidata) does not
-- touch these rows. source_key p641-map:<qid>:<sport_code> is this step's only
-- ownership; 215 keeps wikidata:<qid>:P641:<code> for meigen athlete CSV sports.
-- Reads already-loaded claims: harvest and legacy_people when those tables exist.
-- Rerunnable. No begin/commit: ds1-apply.sh wraps one transaction.
-- Run after 121 and 215. From the spx-stats repo root:
--   bash scripts/mac/ds1-apply.sh db/build/217_person_sport_p641.sql

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
do $$ begin
  if not exists (select 1 from mg) then
    raise exception 'missing meta.source wikidata_meigen';
  end if;
end $$;

-- Keep in sync with db/seed/wikidata_p641_sport.csv
create temp table p641_map (
  qid        text primary key,
  sport_code text not null
);
insert into p641_map (qid, sport_code) values
  ('Q41466',    'hockey'),
  ('Q11774891', 'hockey'),
  ('Q5372',     'basketball'),
  ('Q3665646',  'basketball'),
  ('Q5369',     'baseball'),
  ('Q10871364', 'baseball'),
  ('Q41323',    'american_football'),
  ('Q19204627', 'american_football'),
  ('Q248534',   'canadian_football'),
  ('Q19841381', 'canadian_football'),
  ('Q2736',     'soccer'),
  ('Q937857',   'soccer');

create temp table p641_claim (
  qid       text not null,
  value_qid text not null
);

do $$
begin
  if to_regclass('legacy_wikidata_harvest.claim') is not null then
    insert into p641_claim (qid, value_qid)
    select c.qid, c.value_qid
      from legacy_wikidata_harvest.claim c
     where c.prop in ('P641', 'P106')
       and c.value_qid is not null
       and coalesce(c.rank, 'normal') <> 'deprecated';
  end if;
  if to_regclass('legacy_people.claim') is not null then
    insert into p641_claim (qid, value_qid)
    select c.qid, c.value_qid
      from legacy_people.claim c
     where c.prop in ('P641', 'P106')
       and c.value_qid is not null
       and coalesce(c.rank, 'normal') <> 'deprecated';
  end if;
end $$;

create temp table want as
select distinct x.entity_id as person_id, x.external_key as qid, m.sport_code
  from core.external_id x
  join p641_claim c on c.qid = x.external_key
  join p641_map m on m.qid = c.value_qid
  join core.person p on p.person_id = x.entity_id
 where x.entity_kind = 'person'
   and x.external_key ~ '^Q[0-9]+$';

insert into core.person_sport (person_id, sport_code, source_id, source_key)
select w.person_id,
       w.sport_code,
       (select source_id from mg),
       'p641-map:' || w.qid || ':' || w.sport_code
  from want w
on conflict do nothing;

delete from core.person_sport ps
 where ps.source_id = (select source_id from mg)
   and ps.source_key like 'p641-map:%'
   and not exists (
     select 1 from want w
      where w.person_id = ps.person_id
        and w.sport_code = ps.sport_code
        and ('p641-map:' || w.qid || ':' || w.sport_code) = ps.source_key);

select (select count(*) from want) as mapped_pairs,
       (select count(distinct person_id) from want) as people,
       (select count(*) from core.person_sport
         where source_id = (select source_id from mg)
           and source_key like 'p641-map:%') as sports;

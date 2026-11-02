-- Map legacy_wikidata_meigen bio/stint/honour/wiki_page onto core by Wikidata
-- QID only. Never by name. Empty core.person facts are filled; existing values
-- stay. person_career / person_honour / person_image rows this step owns are
-- replaced (sources wikidata_meigen and wikipedia_meigen). 182 deletes only
-- source wikidata career rows, so these stay. Exact-day dates only (prec 11).
-- Citizenship is not birthplace. No begin/commit: ds1-apply.sh wraps one
-- transaction. Run after 121, 190, 215 and scripts/wikidata_meigen/load_bio.py.

create temp table mg on commit drop as
select source_id from meta.source where code = 'wikidata_meigen';
create temp table wp on commit drop as
select source_id from meta.source where code = 'wikipedia_meigen';
create temp table wd on commit drop as
select source_id from meta.source where code = 'wikidata';
do $$ begin
  if not exists (select 1 from mg) then
    raise exception 'missing meta.source wikidata_meigen';
  end if;
  if not exists (select 1 from wp) then
    raise exception 'missing meta.source wikipedia_meigen';
  end if;
  if not exists (select 1 from wd) then
    raise exception 'missing meta.source wikidata';
  end if;
end $$;

create temp table by_qid on commit drop as
select distinct on (x.external_key) x.external_key as qid, x.entity_id as person_id
from core.external_id x
where x.entity_kind = 'person' and x.external_key ~ '^Q[0-9]+$'
order by x.external_key,
         (x.source_id = (select source_id from wd)) desc,
         x.entity_id;

create temp table bio_ok on commit drop as
select b.*, q.person_id
from legacy_wikidata_meigen.bio b
join by_qid q using (qid)
where nullif(btrim(b.label), '') is not null;

update core.person p
set birth_date = coalesce(p.birth_date, case when b.birth_prec = 11 then b.birth_on end),
    death_date = coalesce(p.death_date, case when b.death_prec = 11 then b.death_on end),
    birth_place = coalesce(p.birth_place, nullif(btrim(b.birth_place_label), '')),
    death_place = coalesce(p.death_place, nullif(btrim(b.death_place_label), '')),
    height_cm = coalesce(p.height_cm, b.height_cm),
    debut_on = coalesce(p.debut_on, case when b.debut_prec = 11 then b.debut_on end),
    final_game_on = coalesce(p.final_game_on, case when b.final_prec = 11 then b.final_on end),
    hall_of_fame_year = coalesce(p.hall_of_fame_year, b.hof_year),
    updated_at = now()
from bio_ok b
where p.person_id = b.person_id;

delete from core.person_honour
 where source_id in (select source_id from mg union select source_id from wp);
delete from core.person_image
 where source_id in (select source_id from mg union select source_id from wp);
delete from core.person_career
 where source_id in (select source_id from mg union select source_id from wp)
   and source_key like 'meigen-bio:%';

insert into core.person_honour (person_id, kind, name, year, item_qid, detail, source_id, source_key)
select q.person_id,
       h.kind,
       coalesce(nullif(btrim(h.name), ''), nullif(btrim(h.item_qid), ''), h.kind),
       h.year,
       nullif(btrim(h.item_qid), ''),
       h.detail,
       case when h.source = 'wikipedia' then (select source_id from wp)
            else (select source_id from mg) end,
       'meigen-bio:' || h.source || ':' || h.qid || ':' || h.source_key
from legacy_wikidata_meigen.honour h
join by_qid q using (qid)
on conflict do nothing;

insert into core.person_image (person_id, commons_file, url, licence, source_id, source_key)
select distinct on (b.person_id)
       b.person_id,
       b.image_file,
       b.image_url,
       null,
       (select source_id from mg),
       'meigen-bio:P18:' || b.qid
from bio_ok b
where nullif(btrim(b.image_file), '') is not null
  and nullif(btrim(b.image_url), '') is not null
on conflict do nothing;

insert into core.person_career (
  person_id, kind, name, club_qid, level, start_year, end_year, source_id, source_key
)
select q.person_id,
       'club',
       coalesce(nullif(btrim(t.club_name), ''), nullif(btrim(t.club_qid), ''), 'club'),
       nullif(btrim(t.club_qid), ''),
       'professional',
       t.start_year,
       t.end_year,
       case when t.source = 'wikipedia' then (select source_id from wp)
            else (select source_id from mg) end,
       'meigen-bio:' || t.source || ':' || t.qid || ':' || t.source_key
from legacy_wikidata_meigen.team_stint t
join by_qid q using (qid)
where nullif(btrim(coalesce(t.club_name, t.club_qid)), '') is not null
on conflict do nothing;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from mg),
       'person',
       'meigen-people:possible-duplicate:' || b.qid || '+' || o.person_id,
       'possible-duplicate: ' || b.label || ' (wikidata ' || b.qid
         || ', person ' || q.person_id || ') and ' || o.full_name
         || ' (person ' || o.person_id
         || ') have the same name and birth_date and no shared id',
       'Not merged; a person decides'
from bio_ok b
join by_qid q using (qid)
join core.person o
  on o.person_id <> q.person_id
 and b.birth_on is not null and b.birth_prec = 11
 and o.birth_date is not null
 and o.birth_date = b.birth_on
 and core.fold_text(o.full_name) = core.fold_text(b.label)
where not exists (
  select 1 from core.external_id x
  where x.entity_kind = 'person'
    and x.entity_id = o.person_id
    and x.external_key = b.qid)
  and not exists (
    select 1 from meta.data_issue i
    where i.entity_key = 'meigen-people:possible-duplicate:' || b.qid || '+' || o.person_id);

select (select count(*) from bio_ok) as bios_matched,
       (select count(*) from core.person_honour where source_key like 'meigen-bio:%') as honours,
       (select count(*) from core.person_image where source_key like 'meigen-bio:%') as images,
       (select count(*) from core.person_career where source_key like 'meigen-bio:%') as stints,
       (select count(*) from legacy_wikidata_meigen.wiki_page) as wiki_pages;

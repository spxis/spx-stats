-- One-off repair, DS1 only. A rerun of 180_players_nhl after 145 had cleared the NHL's external ids made a new core.person for every
-- NHL player whose old person was not matched again. Each such run person holds the NHL id and the season lines that belong to the
-- old person (the "twin": source nhl_api, no NHL id left, same name and hand, alone on both sides: see db/review/180_new_persons.sql).
-- This moves the NHL id, the season lines and anything else that points at the run person to the twin, then deletes the run person.
-- Run persons were never released, so no core.person_redirect row is written; a redirect that points at a run person is moved.
-- Stops with an error (nothing is changed) if a table other than player_season_stat, external_id or person_redirect points at one.
-- Run persons with no twin stay: db/build/185_person_merge merges the ones it has evidence for, the rest are listed by the review file.
begin;

create temp table run on commit drop as select timestamptz '2026-10-18 22:00+00' as at;

create temp table n on commit drop as
select p.person_id, core.fold_text(p.full_name) as nm, p.throws_or_shoots as h,
       count(*) over (partition by core.fold_text(p.full_name), p.throws_or_shoots) as same
from core.person p join run on p.created_at >= run.at
where p.source_id = (select source_id from meta.source where code = 'nhl_api');

create temp table loose on commit drop as
select o.person_id, core.fold_text(o.full_name) as nm, o.throws_or_shoots as h,
       count(*) over (partition by core.fold_text(o.full_name), o.throws_or_shoots) as same
from core.person o, run
where o.source_id = (select source_id from meta.source where code = 'nhl_api') and o.kind = 'player' and o.created_at < run.at
  and not exists (select 1 from core.external_id x where x.entity_kind = 'person' and x.entity_id = o.person_id and x.source_id = o.source_id);

create temp table pair on commit drop as
select n.person_id as run_person, l.person_id as old_person
from n join loose l on l.nm = n.nm and l.h is not distinct from n.h
where n.same = 1 and l.same = 1;

-- Run persons that share a name and hand with another (result 5 of the review file): production still holds each old person's NHL id.
-- Read it from production for the old persons that result lists and paste the rows here as (old person, NHL id), then run the file again:
--   select entity_id, external_key from core.external_id where entity_kind = 'person' and source_id = (select source_id from meta.source where code = 'nhl_api') and entity_id in (...)
create temp table prod_key (old_person bigint, nhl_id text) on commit drop;
-- insert into prod_key values (123, '8471214'), (124, '8471215');
insert into pair
select n.person_id, k.old_person
from n join core.external_id x on x.entity_kind = 'person' and x.entity_id = n.person_id and x.source_id = (select source_id from meta.source where code = 'nhl_api')
join prod_key k on k.nhl_id = x.external_key
where k.old_person in (select person_id from loose) and n.person_id not in (select run_person from pair)
  and k.old_person not in (select old_person from pair);

select (select count(*) from n) as run_persons, (select count(*) from pair) as pairs;

do $$
declare t record; cnt bigint;
begin
  for t in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'core.person'::regclass and cardinality(c.conkey) = 1
      and c.conrelid::regclass::text not in ('core.player_season_stat', 'core.person_redirect')
  loop
    execute format('select count(*) from %s where %I in (select run_person from pair)', t.tbl, t.col) into cnt;
    if cnt > 0 then raise exception '% rows of % point at a run person: move them first', cnt, t.tbl; end if;
  end loop;
  select count(*) into cnt from core.game_event where person_ids && (select array_agg(run_person) from pair);
  if cnt > 0 then raise exception '% rows of core.game_event point at a run person: move them first', cnt; end if;
  select count(*) into cnt from pair p join core.person_redirect rd on rd.old_person_id = p.run_person;
  if cnt > 0 then raise exception '% core.person_redirect rows start at a run person', cnt; end if;
end $$;

update core.person_redirect r set person_id = p.old_person from pair p where r.person_id = p.run_person;
update core.external_id x set entity_id = p.old_person from pair p where x.entity_kind = 'person' and x.entity_id = p.run_person;
update core.player_season_stat s set person_id = p.old_person from pair p where s.person_id = p.run_person;

update core.person k set
  throws_or_shoots = coalesce(k.throws_or_shoots, l.throws_or_shoots), primary_position = coalesce(k.primary_position, l.primary_position),
  positions = coalesce(k.positions, l.positions), birth_country_code = coalesce(k.birth_country_code, l.birth_country_code),
  nationality_code = coalesce(k.nationality_code, l.nationality_code), birth_date = coalesce(k.birth_date, l.birth_date),
  height_cm = coalesce(k.height_cm, l.height_cm), weight_kg = coalesce(k.weight_kg, l.weight_kg), is_active = coalesce(k.is_active, l.is_active),
  updated_at = now()
from pair p join core.person l on l.person_id = p.run_person
where k.person_id = p.old_person
  and (k.throws_or_shoots, k.primary_position, k.positions, k.birth_country_code, k.nationality_code, k.birth_date, k.height_cm, k.weight_kg, k.is_active)
      is distinct from (coalesce(k.throws_or_shoots, l.throws_or_shoots), coalesce(k.primary_position, l.primary_position), coalesce(k.positions, l.positions),
      coalesce(k.birth_country_code, l.birth_country_code), coalesce(k.nationality_code, l.nationality_code), coalesce(k.birth_date, l.birth_date),
      coalesce(k.height_cm, l.height_cm), coalesce(k.weight_kg, l.weight_kg), coalesce(k.is_active, l.is_active));

delete from core.person where person_id in (select run_person from pair);

select (select count(*) from pair) as folded,
       (select count(*) from core.person p join run on p.created_at >= run.at where p.source_id = (select source_id from meta.source where code = 'nhl_api')) as run_persons_left;

commit;

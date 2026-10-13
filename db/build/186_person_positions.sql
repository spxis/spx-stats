-- core.person.positions (migration 049): every position a person holds, lower case, the main one (primary_position) first.
-- Sources: the person's primary_position (Wikidata's preferred or first P413 statement, the NHL API or Lahman) and every other
-- Wikidata "position played" (P413) statement of the same item, in Wikidata's order (preferred first). Shohei Ohtani is
-- pitcher, designated hitter, outfielder and two-way player. Statements that name a job rather than a position (coach, manager)
-- are dropped. Run after 177, 180 and 181 (they set primary_position), before 190. Rerunnable; only changed rows are written.
begin;

create temp table claim_pos on commit drop as
select x.entity_id as person_id, lower(btrim(it.label)) as label,
       row_number() over (partition by x.entity_id order by (cl.rank = 'preferred') desc, cl.n) as ord
from core.external_id x
join meta.source s on s.source_id = x.source_id and s.code = 'wikidata'
join legacy_people.claim cl on cl.qid = x.external_key and cl.prop = 'P413' and coalesce(cl.rank, 'normal') <> 'deprecated'
left join legacy_people.redirect r on r.from_qid = cl.value_qid
join legacy_people.item it on it.qid = coalesce(r.to_qid, cl.value_qid)
where x.entity_kind = 'person' and it.label is not null and btrim(it.label) <> ''
  and it.label !~* '(^| )(coach|manager)$';

create temp table want_pos on commit drop as
select person_id, array_agg(label order by ord2) as positions from (
  select person_id, label, min(ord2) as ord2 from (
    select person_id, lower(btrim(primary_position)) as label, 0 as ord2 from core.person where btrim(coalesce(primary_position, '')) <> ''
    union all
    select person_id, label, ord from claim_pos) u
  group by person_id, label) v
group by person_id;

update core.person p set positions = w.positions
from want_pos w
where w.person_id = p.person_id and p.positions is distinct from w.positions;

update core.person p set positions = null
where p.positions is not null and not exists (select 1 from want_pos w where w.person_id = p.person_id);

select 'persons with positions' as what, count(*) as n from core.person where positions is not null
union all select 'persons with more than one', count(*) from core.person where cardinality(positions) > 1;

commit;

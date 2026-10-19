-- Read-only (select only; safe under ds1-apply.sh --dry-run). The persons the latest run of db/build/180_players_nhl made, and which
-- existing person each one may duplicate. Nothing is merged on a name: "name only" is a count for a person to look at.
-- Run persons: source nhl_api and created on or after 2026-10-18 22:00 UTC (the run of 2026-10-18 23:00; nothing else makes them).
-- Result 1, one row per kind (each run person counted once, first kind that fits):
--   id         an existing person is the Wikidata item that lists this NHL player id (legacy_wikidata.result 'nhl_birthplace').
--   twin       an existing person of source nhl_api has lost its NHL id and has the same name (accents ignored) and shooting hand, and the
--              pair is the only one: the same player made by an earlier run (db/build/145 clears the ids, 180 then made a new person).
--   birth+name an existing person has the same name and the birth date Wikidata gives for this NHL player id.
--   name only  an existing person has the same name and nothing else agrees.
--   none       no existing person has this name.
-- Result 2: how many fit each test on its own. Result 3: loose ends (run persons with no twin, twins with no run person).
-- Result 4: rows that point at run persons, by table (anything but player_season_stat and external_id must be moved before a delete).
-- Result 5: the run persons that share a name and hand (no twin can be told apart on DS1): "run person:NHL id" and the old persons.
--   Production still holds the old persons' NHL ids: select entity_id, external_key from core.external_id where entity_kind = 'person'
--   and source_id = (select source_id from meta.source where code = 'nhl_api') and entity_id in (<the old persons listed here>)
with nhl as (select source_id from meta.source where code = 'nhl_api'),
run as (select timestamptz '2026-10-18 22:00+00' as at),
n as (
  select p.person_id, p.full_name, core.fold_text(p.full_name) as nm, p.throws_or_shoots as h, x.external_key as nhl_id,
         count(*) over (partition by core.fold_text(p.full_name), p.throws_or_shoots) as same
  from core.person p join run on p.created_at >= run.at
  left join core.external_id x on x.entity_kind = 'person' and x.entity_id = p.person_id and x.source_id = p.source_id
  where p.source_id = (select source_id from nhl)),
old as (
  select p.person_id, p.full_name, core.fold_text(p.full_name) as nm, p.birth_date, p.throws_or_shoots as h, p.source_id
  from core.person p, run where p.created_at < run.at and p.kind = 'player'),
wd as (
  select r.row->>'nhl' as nhl_id, regexp_replace(r.row->>'person', '^.*/', '') as qid, (r.row->>'birthDate')::timestamptz::date as bd
  from legacy_wikidata.result r where r.query_name = 'nhl_birthplace'),
by_id as (
  select distinct n.person_id from n join wd on wd.nhl_id = n.nhl_id
  join core.external_id wx on wx.entity_kind = 'person' and wx.source_id = (select source_id from meta.source where code = 'wikidata') and wx.external_key = wd.qid
  join old o on o.person_id = wx.entity_id),
loose as (
  select o.person_id, o.nm, o.h, count(*) over (partition by o.nm, o.h) as same from old o
  where o.source_id = (select source_id from nhl)
    and not exists (select 1 from core.external_id x where x.entity_kind = 'person' and x.entity_id = o.person_id and x.source_id = o.source_id)),
twin as (
  select n.person_id as run_person, l.person_id as old_person from n join loose l on l.nm = n.nm and l.h is not distinct from n.h
  where n.same = 1 and l.same = 1),
by_birth as (
  select distinct n.person_id from n join wd on wd.nhl_id = n.nhl_id join old o on o.birth_date = wd.bd and o.nm = n.nm),
by_name as (select distinct n.person_id from n join old o on o.nm = n.nm),
kind as (
  select n.person_id,
         case when n.person_id in (select person_id from by_id) then '1 id'
              when n.person_id in (select run_person from twin) then '2 twin'
              when n.person_id in (select person_id from by_birth) then '3 birth+name'
              when n.person_id in (select person_id from by_name) then '4 name only'
              else '5 none' end as k
  from n)
select 'result 1' as result, k as kind, count(*) as persons from kind group by k
union all select 'result 1', '0 run persons', count(*) from n
union all select 'result 2', 'fits id', count(*) from by_id
union all select 'result 2', 'fits twin', count(*) from twin
union all select 'result 2', 'fits birth+name', count(*) from by_birth
union all select 'result 2', 'fits name', count(*) from by_name
union all select 'result 3', 'old nhl_api persons with no NHL id', count(*) from loose
union all select 'result 3', 'of them with no twin in the run', count(*) from loose where person_id not in (select old_person from twin)
union all select 'result 3', 'run persons with no twin', count(*) from n where person_id not in (select run_person from twin)
union all select 'result 3', 'run persons whose name+hand is shared (twin ambiguous)', count(*) from n where same > 1
union all
select 'result 4', c.conrelid::regclass::text || '.' || a.attname,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %s where %I in (select person_id from core.person where source_id = %s and created_at >= %L)',
          c.conrelid::regclass, a.attname, (select source_id from nhl), (select at from run)), false, true, '')))[1]::text::bigint
from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
where c.contype = 'f' and c.confrelid = 'core.person'::regclass and cardinality(c.conkey) = 1
union all
select 'result 5', g.nm || ' ' || coalesce(g.h, '-') || ' | run ' || string_agg(g.id, ', ' order by g.id) || ' | old ' ||
       coalesce((select string_agg(l.person_id::text, ', ' order by l.person_id) from loose l where l.nm = g.nm and l.h is not distinct from g.h), 'none'),
       count(*)
from (select nm, h, person_id || ':' || coalesce(nhl_id, '?') as id from n where same > 1) g
group by g.nm, g.h
order by 1, 2;

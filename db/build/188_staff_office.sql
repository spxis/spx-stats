-- General managers and presidents of NHL, NBA and CFL club seasons, from the infoboxes of the "<season> <club> season" articles on English Wikipedia
-- (CC BY-SA 4.0; legacy_staff.wikipedia_office, scripts/staff/load_office.py), into core.roster_stint as roles 'general_manager' and 'president'.
-- A person is found by core.external_id (wikipedia link title), else by the Wikidata item of the article (legacy_people.item.enwiki_title), else created
-- (kind 'executive') under the key 'name:<name>@<franchise id>': a name with no link counts as one person only within one franchise, never across clubs.
-- Rerunnable: the stints this step wrote are deleted and written again with the same ids; people it created are kept and found by their external id.
-- Runs after 184 (head coaches) and 185 (person merge), before 190.
create temp table sid on commit drop as
select (select source_id from meta.source where code = 'wikipedia') as wiki, (select source_id from meta.source where code = 'wikidata') as wikidata;

update meta.source set attribution = attribution || ' General managers and presidents of NHL, NBA and CFL club seasons from the infoboxes of the "<season> <club> season" articles, English Wikipedia, CC BY-SA 4.0; text by the articles'' editors, see each article''s history.'
where code = 'wikipedia' and attribution not like '%General managers and presidents%';

create temp table old_stint on commit drop as
select roster_stint_id, person_id, team_season_id, role,
       row_number() over (partition by person_id, team_season_id, role order by roster_stint_id) as rn
from core.roster_stint
where role in ('general_manager', 'president') and source_id = (select wiki from sid);
delete from core.roster_stint where role in ('general_manager', 'president') and source_id = (select wiki from sid);

create temp table office_raw on commit drop as
select o.team_season_id, o.field, o.n, o.name,
       coalesce(o.link_title, 'name:' || o.name || '@' || ts.franchise_id) as key
from legacy_staff.wikipedia_office o join core.team_season ts using (team_season_id);

create temp table cand on commit drop as
select key, (array_agg(name order by length(name) desc))[1] as name from office_raw group by 1;

create temp table pp on commit drop as
select c.key, c.name, coalesce(x.entity_id, via_wikidata.entity_id) as person_id
from cand c
left join core.external_id x on x.entity_kind = 'person' and x.source_id = (select wiki from sid) and x.external_key = c.key
left join lateral (select e.entity_id from legacy_people.item i
                   join core.external_id e on e.entity_kind = 'person' and e.source_id = (select wikidata from sid) and e.external_key = i.qid
                   where i.enwiki_title = c.key limit 1) via_wikidata on true;

create temp table newp on commit drop as
select key, name, nextval(pg_get_serial_sequence('core.person', 'person_id')) as person_id from pp where person_id is null;
insert into core.person (person_id, full_name, kind, source_id)
overriding system value
select person_id, name, 'executive', (select wiki from sid) from newp;
update pp set person_id = newp.person_id from newp where pp.key = newp.key;

insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'person', person_id, (select wiki from sid), key from pp
on conflict do nothing;

insert into core.roster_stint (roster_stint_id, person_id, team_season_id, role, source_id)
overriding system value
select coalesce(o.roster_stint_id, nextval(pg_get_serial_sequence('core.roster_stint', 'roster_stint_id'))), s.person_id, s.team_season_id, s.role, (select wiki from sid)
from (
  select distinct on (pp.person_id, r.team_season_id, r.field) pp.person_id, r.team_season_id, r.field as role, r.n
  from office_raw r join pp on pp.key = r.key
  order by pp.person_id, r.team_season_id, r.field, r.n) s
left join old_stint o on o.person_id = s.person_id and o.team_season_id = s.team_season_id and o.role = s.role and o.rn = 1
order by s.team_season_id, s.role, s.n;

select 'general_manager stints' as what, count(*) from core.roster_stint where role = 'general_manager'
union all select 'president stints', count(*) from core.roster_stint where role = 'president'
union all select 'executive people', count(*) from core.person where kind = 'executive';

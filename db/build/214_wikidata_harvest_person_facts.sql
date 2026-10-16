-- Fill empty core.person facts from the already archived Wikidata harvest.
-- Stable QID mapping only. Existing core values are never overwritten.
-- Ambiguous facts are left unchanged and written under this step's data_issue namespace.
begin;
create temp table wd on commit drop as select source_id from meta.source where code = 'wikidata';
do $$ begin
  if not exists (select 1 from wd) then raise exception 'missing Wikidata source row'; end if;
end $$;
create temp table target on commit drop as
select p.person_id, x.external_key qid, p.birth_date, p.death_date, p.birth_place, p.birth_country_code,
       p.nationality_code, p.height_cm, p.weight_kg, p.primary_position, p.positions
from core.external_id x join core.person p on p.person_id=x.entity_id join wd on wd.source_id=x.source_id
where x.entity_kind='person' and x.external_key ~ '^Q[0-9]+$';
create unique index on target(qid);
create unique index on target(person_id);
create temp table c on commit drop as
select c.qid,c.prop,c.n,coalesce(c.rank,'normal') rank,c.value_qid,c.value_on,c.value_prec,
       c.value_num,c.unit_qid,c.value_text
from legacy_wikidata_harvest.claim c join target t using(qid)
where coalesce(c.rank,'normal') <> 'deprecated';
create index on c(qid,prop);

-- The harvest parser stores time claims only for supported Gregorian dates.
-- Every active alternative must be exact day precision and agree.
create temp table dates on commit drop as
select qid,prop,min(value_on) value_on from c where prop in('P569','P570')
group by qid,prop
having bool_and(value_on is not null and value_prec=11) and count(distinct value_on)=1;
create unique index on dates(qid,prop);

create temp table birthplace on commit drop as
select c.qid,min(c.value_qid) place_qid,min(i.label) label
from c join legacy_wikidata_harvest.item i on i.qid=c.value_qid
where c.prop='P19' and c.value_qid is not null and nullif(btrim(i.label),'') is not null
group by c.qid having count(*)=count(c.value_qid) and count(distinct c.value_qid)=1;
create unique index on birthplace(qid);

-- Birth country uses P19 -> place's P17 -> country's P297. P27 below is
-- kept separate as nationality_code; birthplace never stands in for citizenship.
create temp table birth_country on commit drop as
with place_country_qid as (
  select qid,min(value_qid) country_qid from legacy_wikidata_harvest.claim
  where prop='P17' and coalesce(rank,'normal')<>'deprecated' and value_qid is not null
  group by qid having count(distinct value_qid)=1 and count(*)=count(value_qid)
), alpha2 as (
  select qid,min(value_text) code from legacy_wikidata_harvest.claim
  where prop='P297' and coalesce(rank,'normal')<>'deprecated'
  group by qid having count(*)=count(value_text) and bool_and(value_text ~ '^[A-Z]{2}$')
    and count(distinct value_text)=1
)
select b.qid,max(a.code) code from birthplace b
join place_country_qid pc on pc.qid=b.place_qid join alpha2 a on a.qid=pc.country_qid
join ref.country rc on rc.country_code=a.code group by b.qid;
create unique index on birth_country(qid);

create temp table nationality on commit drop as
with p27 as (
  select qid,min(value_qid) country_qid from c where prop='P27' and value_qid is not null
  group by qid having count(*)=count(value_qid) and count(distinct value_qid)=1
), alpha2 as (
  select qid,min(value_text) code from legacy_wikidata_harvest.claim
  where prop='P297' and coalesce(rank,'normal')<>'deprecated'
  group by qid having count(*)=count(value_text) and bool_and(value_text ~ '^[A-Z]{2}$')
    and count(distinct value_text)=1
)
select p.qid,a.code from p27 p join alpha2 a on a.qid=p.country_qid
join ref.country rc on rc.country_code=a.code;
create unique index on nationality(qid);

create temp table height on commit drop as
select qid,min(cm)::smallint cm from (
 select qid,round(case unit_qid when 'Q11573' then value_num*100 when 'Q174728' then value_num
                                when 'Q218593' then value_num*2.54 end) cm
 from c where prop='P2048'
) v group by qid having count(*)=count(cm) and count(distinct cm)=1 and min(cm) between 120 and 250;
create unique index on height(qid);
create temp table mass on commit drop as
select qid,min(value_num)::smallint kg from c where prop='P2067' and unit_qid='Q11570'
group by qid having count(*)=count(value_num) and count(distinct value_num)=1 and min(value_num) between 30 and 250;
create unique index on mass(qid);

-- P413 is mapped only when the person has a league from existing player history,
-- through the established Wikidata aliases. No name or league is inferred.
create temp table person_league on commit drop as
select distinct t.person_id,s.league_code from target t
join core.roster_stint r on r.person_id=t.person_id join core.team_season ts using(team_season_id)
join core.season s using(season_id)
union
select distinct t.person_id,s.league_code from target t
join core.player_season_stat ps on ps.person_id=t.person_id join core.team_season ts using(team_season_id)
join core.season s using(season_id)
union
select distinct t.person_id,s.league_code from target t
join core.award_winner aw on aw.person_id=t.person_id join core.season s using(season_id);
create index on person_league(person_id,league_code);
create temp table position_fact on commit drop as
with mapped_claims as (
 select distinct t.qid,c.n
 from c join target t using(qid)
 join legacy_wikidata_harvest.item it on it.qid=c.value_qid
 join person_league pl on pl.person_id=t.person_id
 join ref.position_alias a on a.source_code='wikidata' and a.league_code=pl.league_code
      and a.raw_value=lower(btrim(it.label))
 where c.prop='P413'
), fully_mapped as (
 select all_claims.qid from
   (select qid,count(*) as n from c where prop='P413' group by qid) all_claims
 join (select qid,count(*) as n from mapped_claims group by qid) mapped using(qid)
 where all_claims.n=mapped.n
), mapped as (
 select t.qid,a.code,bool_or(c.rank='preferred') preferred,min(c.n*100+a.ord) ord
 from c join target t using(qid)
 join legacy_wikidata_harvest.item it on it.qid=c.value_qid
 join person_league pl on pl.person_id=t.person_id
 join ref.position_alias a on a.source_code='wikidata' and a.league_code=pl.league_code
      and a.raw_value=lower(btrim(it.label))
 where c.prop='P413' group by t.qid,a.code
), ordered as (
 select qid,array_agg(code order by preferred desc,ord,code) codes from mapped group by qid
)
select o.qid,o.codes[1] primary_position,o.codes positions from ordered o
join fully_mapped f using(qid);
create unique index on position_fact(qid);

create temp table issues(entity_key text not null,issue text not null,resolution text not null) on commit drop;
insert into issues
select 'wikidata-enrichment:'||qid||':'||prop||':ambiguous',
       format('Wikidata %s has conflicting, coarse, or unsupported active %s claims',qid,prop),
       'Left the core field unchanged; review the archived statement set'
from c where prop in('P569','P570') group by qid,prop
having not(bool_and(value_on is not null and value_prec=11) and count(distinct value_on)=1);
insert into issues
select 'wikidata-enrichment:'||t.qid||':P19:ambiguous',
       format('Wikidata %s has conflicting or unmapped active birthplace claims',t.qid),
       'Left birthplace and derived birth country unchanged'
from target t join c using(qid) where c.prop='P19' group by t.qid
having count(*)<>count(c.value_qid) or count(distinct c.value_qid)<>1
   or not exists(select 1 from birthplace b where b.qid=t.qid);
insert into issues
select 'wikidata-enrichment:'||t.qid||':P27:ambiguous',
       format('Wikidata %s has multiple or unmapped active citizenship claims',t.qid),
       'Left nationality code unchanged; citizenship was not guessed'
from target t join c using(qid) where c.prop='P27' group by t.qid
having count(*)<>count(c.value_qid) or count(distinct c.value_qid)<>1
   or not exists(select 1 from nationality n where n.qid=t.qid);
insert into issues
select 'wikidata-enrichment:'||t.qid||':P2048:ambiguous',
       format('Wikidata %s has conflicting, unsupported, or implausible active height claims',t.qid),
       'Left height unchanged'
from target t join c using(qid) where c.prop='P2048' group by t.qid
having count(*)<>count(case when c.unit_qid in('Q11573','Q174728','Q218593') and c.value_num is not null then 1 end)
   or count(distinct round(case c.unit_qid when 'Q11573' then c.value_num*100 when 'Q174728' then c.value_num
                                           when 'Q218593' then c.value_num*2.54 end))<>1
   or min(round(case c.unit_qid when 'Q11573' then c.value_num*100 when 'Q174728' then c.value_num
                                when 'Q218593' then c.value_num*2.54 end)) not between 120 and 250;
insert into issues
select 'wikidata-enrichment:'||t.qid||':P2067:ambiguous',
       format('Wikidata %s has conflicting, unsupported, or implausible active mass claims',t.qid),
       'Left weight unchanged'
from target t join c using(qid) where c.prop='P2067' group by t.qid
having count(*)<>count(case when c.unit_qid='Q11570' and c.value_num is not null then 1 end)
   or count(distinct c.value_num)<>1 or min(c.value_num) not between 30 and 250;
insert into issues
select 'wikidata-enrichment:'||t.qid||':P413:unmapped',
       format('Wikidata %s position claims have no alias in its known leagues',t.qid),
       'Left position unchanged; no league or position was guessed'
from target t join c using(qid) where c.prop='P413'
  and not exists(select 1 from position_fact p where p.qid=t.qid);

-- Record conflicts with existing values, never overwrite them.
insert into issues
select 'wikidata-enrichment:'||t.qid||':'||f.prop||':core-conflict',
       format('Wikidata %s %s=%s disagrees with existing core value %s',t.qid,f.prop,f.value,f.current_value),
       'Kept the existing core value'
from target t cross join lateral(values
 ('P569',t.birth_date::text,(select d.value_on::text from dates d where d.qid=t.qid and d.prop='P569')),
 ('P570',t.death_date::text,(select d.value_on::text from dates d where d.qid=t.qid and d.prop='P570')),
 ('P19',t.birth_place,(select b.label from birthplace b where b.qid=t.qid)),
 ('P27',t.nationality_code,(select n.code from nationality n where n.qid=t.qid)),
 ('P2048',t.height_cm::text,(select h.cm::text from height h where h.qid=t.qid)),
 ('P2067',t.weight_kg::text,(select m.kg::text from mass m where m.qid=t.qid)),
 ('P413',t.primary_position,(select p.primary_position from position_fact p where p.qid=t.qid))
) f(prop,current_value,value)
where f.current_value is not null and f.value is not null and f.current_value is distinct from f.value;
insert into issues
select 'wikidata-enrichment:'||t.qid||':P19:birth-country-conflict',
       format('Wikidata %s birthplace country=%s disagrees with existing core value %s',t.qid,b.code,t.birth_country_code),
       'Kept the existing core birth country'
from target t join birth_country b using(qid)
where t.birth_country_code is not null and t.birth_country_code is distinct from b.code;
insert into issues
select 'wikidata-enrichment:'||t.qid||':P413:positions-conflict',
       format('Wikidata %s positions=%s disagree with existing core positions %s',t.qid,f.positions,t.positions),
       'Kept existing core positions'
from target t join position_fact f using(qid)
where t.positions is not null and t.positions is distinct from f.positions;

-- Replace only this step's own issue keys; unrelated data issues survive.
delete from meta.data_issue where source_id=(select source_id from wd)
 and entity_kind='person_wikidata_enrichment' and entity_key like 'wikidata-enrichment:%';
insert into meta.data_issue(source_id,entity_kind,entity_key,issue,resolution)
select (select source_id from wd),'person_wikidata_enrichment',entity_key,issue,resolution from issues;

update core.person p set birth_date=d.value_on,updated_at=now() from target t join core.external_id x
 on x.entity_id=t.person_id and x.entity_kind='person' and x.external_key=t.qid
join dates d on d.qid=t.qid and d.prop='P569'
where p.person_id=t.person_id and p.birth_date is null;
update core.person p set death_date=d.value_on,updated_at=now() from target t join core.external_id x
 on x.entity_id=t.person_id and x.entity_kind='person' and x.external_key=t.qid
join dates d on d.qid=t.qid and d.prop='P570'
where p.person_id=t.person_id and p.death_date is null;
update core.person p set birth_place=b.label,updated_at=now() from target t join core.external_id x
 on x.entity_id=t.person_id and x.entity_kind='person' and x.external_key=t.qid
join birthplace b on b.qid=t.qid
where p.person_id=t.person_id and p.birth_place is null;
update core.person p set birth_country_code=b.code,updated_at=now() from target t join core.external_id x
 on x.entity_id=t.person_id and x.entity_kind='person' and x.external_key=t.qid
join birth_country b on b.qid=t.qid
where p.person_id=t.person_id and p.birth_country_code is null;
update core.person p set nationality_code=n.code,updated_at=now() from target t join core.external_id x
 on x.entity_id=t.person_id and x.entity_kind='person' and x.external_key=t.qid
join nationality n on n.qid=t.qid
where p.person_id=t.person_id and p.nationality_code is null;
update core.person p set height_cm=h.cm,updated_at=now() from target t join core.external_id x
 on x.entity_id=t.person_id and x.entity_kind='person' and x.external_key=t.qid
join height h on h.qid=t.qid
where p.person_id=t.person_id and p.height_cm is null;
update core.person p set weight_kg=m.kg,updated_at=now() from target t join core.external_id x
 on x.entity_id=t.person_id and x.entity_kind='person' and x.external_key=t.qid
join mass m on m.qid=t.qid
where p.person_id=t.person_id and p.weight_kg is null;
update core.person p set primary_position=f.primary_position,positions=f.positions,updated_at=now()
from target t join core.external_id x on x.entity_id=t.person_id and x.entity_kind='person' and x.external_key=t.qid
join position_fact f on f.qid=t.qid
where p.person_id=t.person_id and p.primary_position is null and p.positions is null;

select 'birth_date' field,count(*) filled from dates d join target t using(qid) where d.prop='P569' and t.birth_date is null
union all select 'death_date',count(*) from dates d join target t using(qid) where d.prop='P570' and t.death_date is null
union all select 'birth_place',count(*) from birthplace b join target t using(qid) where t.birth_place is null
union all select 'birth_country_code',count(*) from birth_country b join target t using(qid) where t.birth_country_code is null
union all select 'nationality_code',count(*) from nationality n join target t using(qid) where t.nationality_code is null
union all select 'height_cm',count(*) from height h join target t using(qid) where t.height_cm is null
union all select 'weight_kg',count(*) from mass m join target t using(qid) where t.weight_kg is null
union all select 'positions',count(*) from position_fact f join target t using(qid) where t.primary_position is null and t.positions is null
union all select 'logged_review_issues',count(*) from issues;
commit;

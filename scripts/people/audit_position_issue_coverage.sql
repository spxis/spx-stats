-- Read-only coordinator check: identify owned unmapped-position issues whose
-- person already has a position, so the issue-cleanup effect can be estimated.
begin transaction read only;
set local statement_timeout = '120s';
with wd as (
  select source_id from meta.source where code = 'wikidata'
), owned_issues as (
  select d.entity_key,
         substring(d.entity_key from '^wikidata-enrichment:(Q[0-9]+):P413:unmapped$') as person_qid
  from meta.data_issue d join wd using (source_id)
  where d.entity_kind = 'person_wikidata_enrichment'
    and d.entity_key ~ '^wikidata-enrichment:Q[0-9]+:P413:unmapped$'
), coverage as (
  select case
           when p.person_id is null then 'person_not_found'
           when p.primary_position is not null
             or coalesce(cardinality(p.positions), 0) > 0 then 'position_already_present'
           else 'position_empty'
         end as position_status
  from owned_issues i
  left join core.external_id x on x.entity_kind = 'person'
    and x.external_key = i.person_qid and x.source_id = (select source_id from wd)
  left join core.person p on p.person_id = x.entity_id
)
select position_status, count(*) as issue_count
from coverage
group by position_status
order by position_status;
commit;

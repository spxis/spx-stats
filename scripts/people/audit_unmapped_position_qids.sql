-- Read-only coordinator export: active P413 value QIDs the current QID-first/label map
-- does not cover, grouped by each person's established SPX league history.
-- Output is the Wikidata item QID/label plus aggregate affected people and claims.
begin transaction read only;
set local statement_timeout = '120s';
with wd as (
  select source_id from meta.source where code = 'wikidata'
), targets as (
  select p.person_id, x.external_key as person_qid
  from core.person p
  join core.external_id x on x.entity_id = p.person_id and x.entity_kind = 'person'
  join wd on wd.source_id = x.source_id
  where p.primary_position is null and p.positions is null
    and x.external_key ~ '^Q[0-9]+$'
), person_league as (
  select distinct t.person_id, s.league_code
  from targets t
  join core.roster_stint r on r.person_id = t.person_id
  join core.team_season ts using (team_season_id)
  join core.season s using (season_id)
  union
  select distinct t.person_id, s.league_code
  from targets t
  join core.player_season_stat ps on ps.person_id = t.person_id
  join core.team_season ts using (team_season_id)
  join core.season s using (season_id)
  union
  select distinct t.person_id, s.league_code
  from targets t
  join core.award_winner aw on aw.person_id = t.person_id
  join core.season s using (season_id)
), active_claims as (
  select t.person_id, t.person_qid, pl.league_code, c.value_qid, i.label as value_label
  from targets t
  join person_league pl using (person_id)
  join legacy_wikidata_harvest.claim c on c.qid = t.person_qid and c.prop = 'P413'
  left join legacy_wikidata_harvest.item i on i.qid = c.value_qid
  where coalesce(c.rank, 'normal') <> 'deprecated'
), gaps as (
  select c.*
  from active_claims c
  where not exists (
       select 1 from ref.position_alias a
       where a.source_code = 'wikidata'
         and a.league_code = c.league_code
         and (a.raw_value = lower(c.value_qid) or
              (a.raw_value = lower(btrim(c.value_label)) and not exists (
                select 1 from ref.position_alias qid_alias
                where qid_alias.source_code='wikidata' and qid_alias.league_code=c.league_code
                  and qid_alias.raw_value=lower(c.value_qid))))
     )
), totals as (
  select league_code, count(distinct value_qid) as distinct_unmapped_qids
  from gaps
  group by league_code
)
select g.league_code,
       coalesce(g.value_qid, '(null)') as value_qid,
       coalesce(g.value_label, '(missing item label)') as value_label,
       count(distinct g.person_id) as affected_people,
       count(*) as active_claims,
       t.distinct_unmapped_qids
from gaps g
join totals t using (league_code)
group by g.league_code, g.value_qid, g.value_label, t.distinct_unmapped_qids
order by g.league_code, affected_people desc, g.value_qid;
commit;

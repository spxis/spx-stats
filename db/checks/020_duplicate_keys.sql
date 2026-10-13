-- what: two rows with the same natural key where no unique constraint guards it
-- baseline: 0
select 'external_id' as tbl, entity_kind || '/' || source_id::text || '/' || external_key as dup
from core.external_id
group by entity_kind, source_id, external_key
having count(distinct entity_id) > 1
union all
select 'standing_final', team_season_id::text || '/' || phase::text
from core.standing
where is_final
group by team_season_id, phase
having count(*) > 1

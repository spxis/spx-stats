-- what: external ids that name a game, person, franchise or award that does not exist
-- baseline: 168
select e.entity_kind, e.entity_id
from core.external_id e
where (e.entity_kind = 'game' and not exists (select 1 from core.game x where x.game_id = e.entity_id))
   or (e.entity_kind = 'person' and not exists (select 1 from core.person x where x.person_id = e.entity_id))
   or (e.entity_kind = 'franchise' and not exists (select 1 from core.franchise x where x.franchise_id = e.entity_id))
   or (e.entity_kind = 'award' and not exists (select 1 from core.award x where x.award_id = e.entity_id))

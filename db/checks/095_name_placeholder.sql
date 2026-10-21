-- what: a core name column holds a source placeholder ('(none)', '(null)', 'n/a' or a name ending in '(none)'); the loader should map it to empty or null (Retrosheet's Allegheny Club nickname was '(none)', step 140)
-- baseline: 0
select t, id, col, val
from (
  select 'core.franchise_identity' t, franchise_identity_id::text id, 'location' col, location val from core.franchise_identity
  union all select 'core.franchise_identity', franchise_identity_id::text, 'nickname', nickname from core.franchise_identity
  union all select 'core.franchise_identity', franchise_identity_id::text, 'full_name', full_name from core.franchise_identity
  union all select 'core.person', person_id::text, 'full_name', full_name from core.person
  union all select 'core.conference', conference_id::text, 'name', name from core.conference
  union all select 'core.division', division_id::text, 'name', name from core.division
  union all select 'core.venue_name', venue_id::text, 'name', name from core.venue_name
  union all select 'core.award', award_id::text, 'name', name from core.award
) x
where lower(btrim(val)) in ('(none)', '(null)', 'n/a') or val ilike '% (none)' or val ilike '% (null)'
order by t, id, col

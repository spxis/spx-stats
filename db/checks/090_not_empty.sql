-- what: core tables that must never be empty (a failed load or a truncate shows up here)
-- baseline: 0
select t as empty_table
from (values
  ('core.season', (select count(*) from core.season)),
  ('core.franchise', (select count(*) from core.franchise)),
  ('core.team_season', (select count(*) from core.team_season)),
  ('core.game', (select count(*) from core.game)),
  ('core.person', (select count(*) from core.person)),
  ('ref.league', (select count(*) from ref.league)),
  ('meta.source', (select count(*) from meta.source))
) v(t, n)
where n = 0

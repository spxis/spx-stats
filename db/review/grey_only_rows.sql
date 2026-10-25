-- what: the rows held ONLY by a grey-tier source (meta.source.tier = 'grey'), to be replaced by legal data over time. Read-only; run with
--       bash scripts/mac/ds1-apply.sh db/review/grey_only_rows.sql --dry-run. Not a db/checks file on purpose: the count is meant to grow while grey
--       data is loaded and shrink as a green source confirms or replaces it, so it has no baseline and must never fail a release.
-- A row counts when its source_id is a grey source and meta.verification has no 'confirmed' line for it from a source that is not grey.
-- The same rule as api.grey_only_rows (migration 153), which counts them per source for /admin/sources. Columns: source, kind, id, what, since.
with grey as (select source_id, code from meta.source where tier = 'grey'),
held as (
  select 'game' as entity_kind, g.game_id as entity_id, g.source_id, g.source_key as what, g.game_date::text as since from core.game g where g.source_id in (select source_id from grey)
  union all select 'team_season', t.team_season_id, t.source_id, t.team_season_id::text, null from core.team_season t where t.source_id in (select source_id from grey)
  union all select 'season', s.season_id, s.source_id, s.league_code || ' ' || s.start_year, null from core.season s where s.source_id in (select source_id from grey)
  union all select 'person', p.person_id, p.source_id, p.full_name, p.birth_date::text from core.person p where p.source_id in (select source_id from grey)
  union all select 'venue', v.venue_id, v.source_id, v.city, v.opened_on::text from core.venue v where v.source_id in (select source_id from grey)
  union all select 'franchise', f.franchise_id, f.source_id, f.franchise_id::text, f.founded_on::text from core.franchise f where f.source_id in (select source_id from grey)
)
select g.code as source, h.entity_kind as kind, h.entity_id as id, h.what, h.since
from held h
join grey g using (source_id)
where not exists (
  select 1 from meta.verification v
  where v.entity_kind = h.entity_kind and v.entity_id = h.entity_id and v.status = 'confirmed'
    and v.source_id not in (select source_id from grey))
order by g.code, h.entity_kind, h.entity_id

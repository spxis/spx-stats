-- The tier of a source (scripts/daily/sources.py): green (terms allow storing), grey (no terms found; backup or cross-check only, to be replaced by
-- legal data over time), red-confirm (read to confirm, never stored), red. meta.source carries it with the terms note and the evidence link, and
-- api.grey_only_rows counts the rows held ONLY by a grey source (no confirmation from a non-grey source), which /admin/sources shows.
-- A row of core.game, team_season, season, person, venue or franchise counts when its source_id is a grey source and meta.verification holds no
-- 'confirmed' line for it from a source that is not grey. Rerunnable; adds columns and one view, changes no row. Production too (meta and api only).
-- db/build/225_source_tier.sql fills the tier (generated from the registry); db/review/grey_only_rows.sql lists the rows themselves (DS1).
alter table meta.source
  add column if not exists tier text check (tier in ('green', 'grey', 'red-confirm', 'red')),
  add column if not exists terms_note text,
  add column if not exists evidence_url text;
comment on column meta.source.tier is 'green, grey, red-confirm or red (scripts/daily/sources.py); null = not classified (SPX, editorial, derived).';
comment on column meta.source.terms_note is 'The terms clause or the reason for the tier, from the registry.';
comment on column meta.source.evidence_url is 'The page that shows the terms.';

create or replace view api.grey_only_rows as
with grey as (select source_id, code from meta.source where tier = 'grey'),
held as (
  select 'game'::text as entity_kind, game_id as entity_id, source_id from core.game where source_id in (select source_id from grey)
  union all select 'team_season', team_season_id, source_id from core.team_season where source_id in (select source_id from grey)
  union all select 'season', season_id, source_id from core.season where source_id in (select source_id from grey)
  union all select 'person', person_id, source_id from core.person where source_id in (select source_id from grey)
  union all select 'venue', venue_id, source_id from core.venue where source_id in (select source_id from grey)
  union all select 'franchise', franchise_id, source_id from core.franchise where source_id in (select source_id from grey)
)
select g.code as source, h.entity_kind, count(*)::bigint as n_rows
from held h
join grey g using (source_id)
where not exists (
  select 1 from meta.verification v
  where v.entity_kind = h.entity_kind and v.entity_id = h.entity_id and v.status = 'confirmed'
    and v.source_id not in (select source_id from grey))
group by g.code, h.entity_kind;
comment on view api.grey_only_rows is 'Rows held only by a grey-tier source, per source and kind of row (migration 153): to be replaced by legal data over time. Empty while no grey data is loaded.';
grant select on api.grey_only_rows to anon, authenticated;

-- api.provenance: where each published record came from and whether a second source checked it, for the provenance diagram on /sources.
-- One row per (kind of record, league, source it was loaded from, source that checked it, outcome) with the number of records:
--   kind        game, team_season, season or person (games exclude cancelled ones, like api.totals)
--   league      the league of the record; null for a person, who belongs to no one league
--   source      meta.source code of the source the record was loaded from
--   checked_by  meta.source code of the second source that looked at it; null when none did
--   outcome     confirmed (a second source agrees), disputed (it disagrees; the difference is logged in meta.data_issue), not_found
--               (a second source looked and found nothing) or single (no second source has checked it)
-- Records are read from core, outcomes from meta.verification (one row per record is kept: a dispute wins over a confirmation, which wins
-- over the rest). A materialized view like api.quality: api.refresh() refreshes it and db/build/194_provenance.sql refreshes it after a
-- core rebuild. People carry no check today, so they all read single. Rerunnable.

create materialized view if not exists api.provenance as
with v as (
  select distinct on (entity_kind, entity_id) entity_kind, entity_id, status::text as status, source_id
  from meta.verification
  order by entity_kind, entity_id, (status = 'disputed') desc, (status = 'confirmed') desc, verification_id),
rec as (
  select 'game'::text as kind, s.league_code as league, g.source_id, g.game_id as id
    from core.game g join core.season s using (season_id) where g.status <> 'cancelled'
  union all
  select 'team_season', s.league_code, t.source_id, t.team_season_id from core.team_season t join core.season s using (season_id)
  union all
  select 'season', s.league_code, s.source_id, s.season_id from core.season s
  union all
  select 'person', null, p.source_id, p.person_id from core.person p)
select r.kind, r.league, ps.code as source, vs.code as checked_by, coalesce(v.status, 'single') as outcome, count(*)::int as n
from rec r
left join meta.source ps on ps.source_id = r.source_id
left join v on v.entity_kind = r.kind and v.entity_id = r.id
left join meta.source vs on vs.source_id = v.source_id
group by r.kind, r.league, ps.code, vs.code, coalesce(v.status, 'single');

comment on materialized view api.provenance is 'Records by kind, league, source loaded from, source that checked them and outcome (confirmed, disputed, not_found, single). Refreshed by api.refresh().';
grant select on api.provenance to anon, authenticated;

create or replace function api.refresh() returns void language sql security definer as $$
  refresh materialized view api.season_summary; refresh materialized view api.totals;
  refresh materialized view api.games_by_source; refresh materialized view api.quality;
  refresh materialized view api.player_index;
  refresh materialized view api.team_season_index; refresh materialized view api.standing_index;
  refresh materialized view api.team_index;
  refresh materialized view api.provenance;
$$;
revoke all on function api.refresh() from public;

-- Read-only coordinator export for the one-time Wikidata person enrichment.
-- Run from the repository root with psql -X -qAt -f this file > private/audit.jsonl.
-- One JSON object per linked person. Never write the output into the repository.
begin transaction read only;
set local statement_timeout = '120s';
with wd as (
  select source_id from meta.source where code = 'wikidata'
), mapped as (
  select p.person_id, p.full_name, p.birth_date, p.death_date, p.birth_place,
         p.birth_country_code, p.nationality_code, p.height_cm, p.weight_kg,
         p.primary_position, p.positions, x.external_key as qid
  from core.external_id x
  join wd on wd.source_id = x.source_id
  join core.person p on p.person_id = x.entity_id
  where x.entity_kind = 'person'
), people as (
  select m.*,
         i.lastrevid, i.archive_name, i.fetched_at, i.missing, i.redirect_to,
         a.sha256 as archive_sha256,
         coalesce(c.claims, '[]'::jsonb) as claims,
         coalesce(tm.membership_count, 0) as team_membership_count,
         coalesce(pl.leagues, '[]'::jsonb) as league_codes
  from mapped m
  left join legacy_wikidata_harvest.item i on i.qid = m.qid
  left join legacy_files.raw_archive a on a.name = i.archive_name
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'prop', c.prop, 'n', c.n, 'rank', c.rank,
      'value_qid', c.value_qid, 'value_on', c.value_on,
      'value_prec', c.value_prec, 'value_num', c.value_num,
      'unit_qid', c.unit_qid, 'value_text', c.value_text,
      'value_label', vi.label
    ) order by c.prop, c.n) as claims
    from legacy_wikidata_harvest.claim c
    left join legacy_wikidata_harvest.item vi on vi.qid = c.value_qid
    where c.qid = m.qid
      and c.prop in ('P17','P19','P20','P27','P106','P166','P297','P413','P569','P570','P641',
                     'P735','P734','P1477','P1559','P2048','P2067','P423','P741')
  ) c on true
  left join lateral (
    select count(*) as membership_count
    from legacy_wikidata_harvest.team_member tm
    where tm.person_qid = m.qid
  ) tm on true
  left join lateral (
    select coalesce(jsonb_agg(distinct leagues.league_code order by leagues.league_code), '[]'::jsonb) as leagues
    from (
      select s.league_code from core.roster_stint rs
      join core.team_season ts using (team_season_id)
      join core.season s using (season_id)
      where rs.person_id = m.person_id
      union
      select s.league_code from core.player_season_stat ps
      join core.team_season ts using (team_season_id)
      join core.season s using (season_id)
      where ps.person_id = m.person_id
      union
      select s.league_code from core.award_winner aw
      join core.season s using (season_id)
      where aw.person_id = m.person_id
    ) leagues
  ) pl on true
)
select jsonb_build_object(
  'schema', 'spx.wikidata-person-audit/v1',
  'person_id', person_id,
  'qid', qid,
  'full_name', full_name,
  'core', jsonb_build_object(
    'birth_date', birth_date, 'death_date', death_date,
    'birth_place', birth_place, 'birth_country_code', birth_country_code,
    'nationality_code', nationality_code, 'height_cm', height_cm,
    'weight_kg', weight_kg, 'primary_position', primary_position,
    'positions', to_jsonb(positions)
  ),
  'item', jsonb_build_object(
    'lastrevid', lastrevid, 'archive_name', archive_name,
    'fetched_at', fetched_at, 'missing', coalesce(missing, false),
    'redirect_to', redirect_to, 'archive_sha256', archive_sha256
  ),
  'claims', claims,
  'reference_status', 'not_retained_by_existing_harvest_claims',
  'league_codes', league_codes,
  'team_membership_count', team_membership_count,
  'coverage_properties', case
    when archive_sha256 is not null and lastrevid is not null
         and not coalesce(missing, false) and redirect_to is null
      then jsonb_build_array('P19','P27','P413','P569','P570','P2048','P2067')
    else '[]'::jsonb
  end
)::text
from people
order by person_id, qid;
commit;

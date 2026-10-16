-- Admin people search: one row per core.person, including athletes with no club season.
-- A regular view (not materialized): CREATE is instant, it stays current without api.refresh(),
-- and it does not copy 78k rows onto production (player_index is already 40 MB). person_id is
-- the unique key (core.person PK). Indexes on core.person make a name search one indexed read.
-- Needs 037 (core.fold_text, pg_trgm) and 121 (core.person_sport). Rerunnable.

create index if not exists person_fold_idx
  on core.person (core.fold_text(full_name) text_pattern_ops);
do $$
declare s text;
begin
  select n.nspname into s from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm';
  if s is null then
    raise exception 'pg_trgm is not installed (migration 037)';
  end if;
  execute format('create index if not exists person_fold_trgm_idx on core.person using gin (core.fold_text(full_name) %I.gin_trgm_ops)', s);
end $$;
create index if not exists person_birth_date_idx on core.person (birth_date);
create index if not exists person_birth_country_idx on core.person (birth_country_code);

create or replace view api.person_admin as
with sports as (
  select person_id, array_agg(distinct sport_code order by sport_code) as sports
  from (
    select ps.person_id, ps.sport_code from core.person_sport ps
    union
    select rs.person_id, l.sport_code
    from core.roster_stint rs
    join core.team_season ts using (team_season_id)
    join core.season s using (season_id)
    join ref.league l on l.league_code = s.league_code
    where rs.role = 'player') u
  group by person_id),
seen as (
  select person_id from core.roster_stint where role = 'player'
  union
  select person_id from core.player_season_stat)
select p.person_id,
       p.full_name as name,
       core.fold_text(p.full_name) as search,
       p.kind,
       coalesce(p.birth_country_code, p.nationality_code) as country,
       p.birth_date,
       p.death_date,
       extract(year from p.birth_date)::smallint as birth_year,
       extract(year from p.death_date)::smallint as death_year,
       (select x.external_key
          from core.external_id x
          join meta.source src on src.source_id = x.source_id
         where x.entity_kind = 'person' and x.entity_id = p.person_id
           and x.external_key ~ '^Q[0-9]+$'
         order by (src.code = 'wikidata') desc, x.external_key
         limit 1) as qid,
       coalesce(sp.sports, '{}'::text[]) as sports,
       (select array_agg(league order by n desc, last desc, league)
          from (
            select s.league_code as league, count(distinct s.season_id)::int as n, max(s.start_year) as last
            from core.roster_stint rs
            join core.team_season ts using (team_season_id)
            join core.season s using (season_id)
            where rs.person_id = p.person_id and rs.role = 'player'
            group by s.league_code) g) as leagues,
       (sn.person_id is not null) as has_seasons,
       coalesce((select count(distinct ts.season_id)::int
                   from core.roster_stint rs join core.team_season ts using (team_season_id)
                  where rs.person_id = p.person_id and rs.role = 'player'), 0) as seasons_played,
       (select min(s.start_year)
          from core.roster_stint rs
          join core.team_season ts using (team_season_id)
          join core.season s using (season_id)
         where rs.person_id = p.person_id and rs.role = 'player') as first_season,
       (select max(s.start_year)
          from core.roster_stint rs
          join core.team_season ts using (team_season_id)
          join core.season s using (season_id)
         where rs.person_id = p.person_id and rs.role = 'player') as last_season,
       coalesce((select array_agg(distinct code order by code)
                   from (
                     select src.code from meta.source src where src.source_id = p.source_id
                     union
                     select src.code
                       from core.external_id x join meta.source src using (source_id)
                      where x.entity_kind = 'person' and x.entity_id = p.person_id
                     union
                     select src.code
                       from core.person_sport ps join meta.source src using (source_id)
                      where ps.person_id = p.person_id) c), '{}'::text[]) as sources
from core.person p
left join sports sp using (person_id)
left join seen sn using (person_id);

comment on view api.person_admin is
  'Every core.person for the admin /admin/people search (migration 122): folded name, sports (person_sport plus each club-season league), Wikidata QID, sources, has_seasons. Unique key person_id. Filter search, sport, country, birth_year, has_seasons, sources. Not a public page.';

grant select on api.person_admin to anon, authenticated;

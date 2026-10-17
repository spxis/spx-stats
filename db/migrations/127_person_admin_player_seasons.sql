-- Sports, leagues and season spans of api.person_admin from the same facts a
-- player page uses: core.person_sport, roster stints, player_season_stat (the
-- team-season path api.player_index uses) and award_winner leagues. 124 only
-- joined roster_stint for sport/league/span, so people with stats and a public
-- page (MLB Terry Fox, core.person 41424) had empty sports and no player link;
-- has_seasons was already true from player_season_stat. Do not guess a sport.
-- A meigen athlete with only person_sport (runner Terry Fox) stays athletics,
-- with no MLB league. Build api.person_admin_new, drop chip views (they read
-- person_admin), api.swap_matview, recreate the views. Unique key person_id.
-- Time CREATE on scratch; 123 CREATE was 14 s on production. Rerunnable. No
-- begin/commit: ds1-apply.sh wraps one transaction. Needs 124 and 097.

drop materialized view if exists api.person_admin_new cascade;
drop view if exists api.person_admin_countries;
drop view if exists api.person_admin_sports;
drop view if exists api.person_admin_sources;
drop view if exists api.person_admin_letters;
drop view if exists api.person_admin_span;

create materialized view api.person_admin_new as
with seen as (
  select person_id, team_season_id from core.roster_stint where role = 'player'
  union
  select person_id, team_season_id from core.player_season_stat),
sports as (
  select person_id, array_agg(distinct sport_code order by sport_code) as sports
  from (
    select ps.person_id, ps.sport_code from core.person_sport ps
    union
    select t.person_id, l.sport_code
    from seen t
    join core.team_season ts using (team_season_id)
    join core.season s using (season_id)
    join ref.league l on l.league_code = s.league_code
    union
    select w.person_id, l.sport_code
    from core.award_winner w
    join core.season s using (season_id)
    join ref.league l on l.league_code = s.league_code
    where w.person_id is not null) u
  group by person_id),
spans as (
  select t.person_id,
         count(distinct s.season_id)::int as seasons_played,
         min(s.start_year) as first_season,
         max(s.start_year) as last_season
  from seen t
  join core.team_season ts using (team_season_id)
  join core.season s using (season_id)
  group by t.person_id),
league_n as (
  select person_id, league, count(distinct season_id)::int as n, max(year) as last
  from (
    select t.person_id, s.league_code as league, s.season_id, s.start_year as year
    from seen t
    join core.team_season ts using (team_season_id)
    join core.season s using (season_id)
    union
    select w.person_id, s.league_code, s.season_id, s.start_year
    from core.award_winner w
    join core.season s using (season_id)
    where w.person_id is not null) u
  group by person_id, league),
leagues as (
  select person_id, array_agg(league order by n desc, last desc, league) as leagues
  from league_n
  group by person_id),
qid as (
  select distinct on (x.entity_id) x.entity_id as person_id, x.external_key as qid
  from core.external_id x
  join meta.source src on src.source_id = x.source_id
  where x.entity_kind = 'person' and x.external_key ~ '^Q[0-9]+$'
  order by x.entity_id, (src.code = 'wikidata') desc, x.external_key),
src as (
  select person_id, array_agg(distinct code order by code) as sources
  from (
    select p.person_id, s.code
      from core.person p join meta.source s on s.source_id = p.source_id
    union
    select x.entity_id, s.code
      from core.external_id x join meta.source s using (source_id)
     where x.entity_kind = 'person'
    union
    select ps.person_id, s.code
      from core.person_sport ps join meta.source s using (source_id)
  ) u
  group by person_id)
select p.person_id,
       p.full_name as name,
       core.fold_text(p.full_name) as search,
       nullif(substring(core.fold_text(p.full_name) from '^[a-z]'), '') as letter_first,
       nullif(substring(regexp_replace(core.fold_text(p.full_name), '( (jr|sr|ii|iii|iv))+$', '') from '([a-z])[^ ]*$'), '') as letter_last,
       p.kind,
       coalesce(p.birth_country_code, p.nationality_code) as country,
       p.birth_date,
       p.death_date,
       extract(year from p.birth_date)::smallint as birth_year,
       extract(year from p.death_date)::smallint as death_year,
       q.qid,
       coalesce(sp.sports, '{}'::text[]) as sports,
       lg.leagues,
       (sn.person_id is not null) as has_seasons,
       coalesce(spn.seasons_played, 0) as seasons_played,
       spn.first_season,
       spn.last_season,
       coalesce(src.sources, '{}'::text[]) as sources
from core.person p
left join sports sp using (person_id)
left join (select distinct person_id from seen) sn using (person_id)
left join spans spn using (person_id)
left join leagues lg using (person_id)
left join qid q using (person_id)
left join src using (person_id);

create unique index person_admin_new_key on api.person_admin_new (person_id);
create index person_admin_new_letter_last on api.person_admin_new (letter_last);
create index person_admin_new_letter_first on api.person_admin_new (letter_first);
create index person_admin_new_country on api.person_admin_new (country);
create index person_admin_new_birth_year on api.person_admin_new (birth_year);
create index person_admin_new_name on api.person_admin_new (name, person_id);
do $$
declare s text;
begin
  select n.nspname into s from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm';
  if s is null then
    raise exception 'pg_trgm is not installed (migration 037)';
  end if;
  execute format('create index person_admin_new_search_trgm on api.person_admin_new using gin (search %I.gin_trgm_ops)', s);
end $$;

analyze api.person_admin_new;

select api.swap_matview('person_admin', 'person_admin_new');

comment on materialized view api.person_admin is
  'Every core.person for /admin/people (migration 127): folded name, letter_first/last, sports (person_sport plus each team-season and award league), Wikidata QID, sources, has_seasons. Unique key person_id. No GIN on sports/leagues/sources (78k seq scan). Refresh concurrently through api.refresh().';

create view api.person_admin_countries as
select country, count(*)::int as n
from api.person_admin
group by country;

create view api.person_admin_sports as
select s.sport, count(*)::int as n
from api.person_admin p
cross join lateral unnest(p.sports) as s(sport)
group by s.sport;

create view api.person_admin_sources as
select src.source, count(*)::int as n
from api.person_admin p
cross join lateral unnest(p.sources) as src(source)
group by src.source;

create view api.person_admin_letters as
select 'last'::text as kind, letter_last as letter, count(*)::int as n
from api.person_admin
where letter_last is not null
group by letter_last
union all
select 'first', letter_first, count(*)::int
from api.person_admin
where letter_first is not null
group by letter_first;

create view api.person_admin_span as
select min(birth_year)::int as min_year, max(birth_year)::int as max_year
from api.person_admin
where birth_year is not null;

comment on view api.person_admin_countries is
  'Country counts of api.person_admin for the people flag chips (migration 127).';
comment on view api.person_admin_sports is
  'Sport counts of api.person_admin for the people sport chips (migration 127).';
comment on view api.person_admin_sources is
  'Source counts of api.person_admin for the people source chips (migration 127).';
comment on view api.person_admin_letters is
  'A-Z counts of api.person_admin (kind last/first) for the letter row (migration 127).';
comment on view api.person_admin_span is
  'Birth-year ends of api.person_admin for the people year slider (migration 127).';

grant select on api.person_admin_countries to anon, authenticated;
grant select on api.person_admin_sports to anon, authenticated;
grant select on api.person_admin_sources to anon, authenticated;
grant select on api.person_admin_letters to anon, authenticated;
grant select on api.person_admin_span to anon, authenticated;

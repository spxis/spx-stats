-- Where the players come from: how many players of each country (api.player_index.country: birth country, else nationality) played in a league,
-- a season, a club's season and a franchise. Four materialized views, all add-only (nothing existing is dropped or changed except that
-- api.refresh() gains their refresh lines):
--   api.country_team_season   league, year, franchise, team season, country, players     the club-season grain: a club's roster by country, a season's clubs by country
--   api.country_season        league, year, country, players                              distinct players of the league that season (a player on two clubs counts once)
--   api.country_league        league, country, players, first/last season, first player  all time per league, and the first player from each country
--   api.country_franchise     league, franchise, stat group, country, players, stats      per franchise and country: distinct players ('all' = everyone who was
--                                                                                         on the club, even without stats) and the added-up counting stats of the
--                                                                                         regular seasons per stat group, from which the page works out rates
-- A player is "on" a club's season when he has a roster stint (role player) or a statistics row for it, exactly as api.player_index counts seasons.
-- A player with no country is counted under the code 'ZZ' (ISO's "unknown"), so a page can say how many are unknown; it is never guessed.
-- The pages hide their country sections until these views exist. core.club_season_player is the one shared definition of "on a club's season".
-- Each view is built as <name>_swap and renamed, so a rerun swaps it in at once and readers never find it missing; api.refresh() refreshes
-- them concurrently (each has a unique index) after the existing ones. Needs 032 (player_season_stat); the country is read from core.person, so 063 is not needed.
-- Rerunnable.
begin;

create or replace view core.club_season_player as
with seen as (
  select person_id, team_season_id from core.roster_stint where role = 'player'
  union
  select person_id, team_season_id from core.player_season_stat)
select s.league_code as league, s.start_year as year, ts.franchise_id, ts.team_season_id, p.person_id,
       coalesce(p.birth_country_code, p.nationality_code, 'ZZ') as country
from seen t
join core.team_season ts using (team_season_id)
join core.season s using (season_id)
join core.person p using (person_id)
where p.kind = 'player';

comment on view core.club_season_player is 'One row per player and club season (roster stint or statistics row), with the player''s country (birth country, else nationality, else ZZ for unknown). The base of the api.country_* views.';

drop materialized view if exists api.country_team_season_swap;
drop materialized view if exists api.country_season_swap;
drop materialized view if exists api.country_league_swap;
drop materialized view if exists api.country_franchise_swap;

-- 1. club season x country
create materialized view api.country_team_season_swap as
select league, year, franchise_id, team_season_id, country, count(*)::int as players
from core.club_season_player
group by league, year, franchise_id, team_season_id, country;
create unique index country_team_season_swap_key on api.country_team_season_swap (team_season_id, country);
create index country_team_season_swap_lg on api.country_team_season_swap (league, year);
create index country_team_season_swap_fr on api.country_team_season_swap (league, franchise_id, year);

-- 2. league season x country (distinct players)
create materialized view api.country_season_swap as
with c as (
  select league, year, country, count(distinct person_id)::int as players
  from core.club_season_player
  group by league, year, country)
select league, year, country, players,
       (sum(players) over w)::int as season_players,
       (sum(players) filter (where country <> 'ZZ') over w)::int as season_known
from c
window w as (partition by league, year);
create unique index country_season_swap_key on api.country_season_swap (league, year, country);

-- 3. league x country, all time, with the first player (earliest season in that league; ties by debut date, then id)
create materialized view api.country_league_swap as
with per as (
  select league, country, person_id, min(year) as first_year, max(year) as last_year
  from core.club_season_player
  group by league, country, person_id),
ranked as (
  select per.*, p.full_name, row_number() over (partition by per.league, per.country order by per.first_year, p.debut_on nulls last, per.person_id) as rn
  from per join core.person p using (person_id)),
c as (
  select league, country, count(*)::int as players, min(first_year)::smallint as first_year, max(last_year)::smallint as last_year,
         (array_agg(person_id order by rn))[1] as first_person_id, (array_agg(full_name order by rn))[1] as first_name
  from ranked
  group by league, country)
select league, country, players, first_year, last_year, first_person_id, first_name,
       (sum(players) over w)::int as league_players,
       (sum(players) filter (where country <> 'ZZ') over w)::int as league_known
from c
window w as (partition by league);
create unique index country_league_swap_key on api.country_league_swap (league, country);

-- 4. franchise x stat group x country
create materialized view api.country_franchise_swap as
with pres as (
  select league, franchise_id, country, person_id, team_season_id from core.club_season_player),
everyone as (
  select league, franchise_id, 'all'::text as stat_group, country, count(distinct person_id)::int as players, count(*)::int as seasons, '{}'::jsonb as stats
  from pres group by league, franchise_id, country),
rows_ as (
  select s.league_code as league, ts.franchise_id, coalesce(p.birth_country_code, p.nationality_code, 'ZZ') as country, x.person_id, x.team_season_id, x.stat_group, x.stats
  from core.player_season_stat x
  join core.team_season ts using (team_season_id)
  join core.season s using (season_id)
  join core.person p using (person_id)
  where p.kind = 'player' and x.phase = 'regular' and x.is_total is not true and x.stat_group in ('skater', 'goalie', 'batting', 'pitching')),
counts as (
  select league, franchise_id, stat_group, country, count(distinct person_id)::int as players, count(*)::int as seasons
  from rows_ group by league, franchise_id, stat_group, country),
sums as (
  select r.league, r.franchise_id, r.stat_group, r.country, e.key, sum(e.value::numeric) as v
  from rows_ r cross join lateral jsonb_each_text(r.stats) e
  where e.value ~ '^-?[0-9]+(\.[0-9]+)?$'
  group by r.league, r.franchise_id, r.stat_group, r.country, e.key),
packed as (
  select league, franchise_id, stat_group, country, jsonb_object_agg(key, v) as stats
  from sums group by league, franchise_id, stat_group, country)
select * from everyone
union all
select c.league, c.franchise_id, c.stat_group, c.country, c.players, c.seasons, coalesce(p.stats, '{}'::jsonb)
from counts c left join packed p using (league, franchise_id, stat_group, country);
create unique index country_franchise_swap_key on api.country_franchise_swap (league, franchise_id, stat_group, country);

-- swap the new ones in
drop materialized view if exists api.country_team_season;
alter materialized view api.country_team_season_swap rename to country_team_season;
alter index api.country_team_season_swap_key rename to country_team_season_key;
alter index api.country_team_season_swap_lg rename to country_team_season_lg;
alter index api.country_team_season_swap_fr rename to country_team_season_fr;

drop materialized view if exists api.country_season;
alter materialized view api.country_season_swap rename to country_season;
alter index api.country_season_swap_key rename to country_season_key;

drop materialized view if exists api.country_league;
alter materialized view api.country_league_swap rename to country_league;
alter index api.country_league_swap_key rename to country_league_key;

drop materialized view if exists api.country_franchise;
alter materialized view api.country_franchise_swap rename to country_franchise;
alter index api.country_franchise_swap_key rename to country_franchise_key;

comment on materialized view api.country_team_season is 'Players of each country on each club''s season (ZZ = country unknown). Refreshed by api.refresh().';
comment on materialized view api.country_season is 'Distinct players of each country in a league''s season (ZZ = country unknown). Refreshed by api.refresh().';
comment on materialized view api.country_league is 'Distinct players of each country in a league, all time, with the first and last season and the first player (ZZ = country unknown). Refreshed by api.refresh().';
comment on materialized view api.country_franchise is 'Per franchise and country: distinct players and club seasons; stat_group all = everyone on the club, others carry the added-up regular-season counting stats of that group. Refreshed by api.refresh().';

grant select on api.country_team_season, api.country_season, api.country_league, api.country_franchise to anon, authenticated;

-- api.refresh() keeps whatever the other migrations put in it and gains the four lines (written so that the order the migrations ran in does not matter).
do $$
declare body text;
begin
  select prosrc into body from pg_proc where oid = 'api.refresh()'::regprocedure;
  if body !~ 'country_team_season' then
    body := rtrim(body, E' \n\t') ;
    execute 'create or replace function api.refresh() returns void language sql security definer as $f$' || body
      || E'\n  refresh materialized view concurrently api.country_team_season; refresh materialized view concurrently api.country_season;'
      || E'\n  refresh materialized view concurrently api.country_league; refresh materialized view concurrently api.country_franchise;\n$f$';
    execute 'revoke all on function api.refresh() from public';
  end if;
end $$;

analyze api.country_team_season;
analyze api.country_season;
analyze api.country_league;
analyze api.country_franchise;

commit;

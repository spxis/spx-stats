-- The teams of the players list (/players): which franchises each player played for, and the list of players of one franchise.
--
-- api.player_teams: one row per player and franchise (every team the person is known to have been on, from the rosters and the stats both, as
--   api.player_index and api.person_season_teams count them): the first and last season (start year) with it, how many seasons, and the league of
--   its latest season there (a franchise can change league: WHA to NHL). A plain view, not a matview: the page asks it for the 50 players it shows
--   (person_id=in.(..): the person id leads core.roster_stint's and core.player_season_stat's keys) and the list asks it for one franchise
--   (franchise_id=eq.N: the franchise's team seasons, then their rosters), so each read touches a few thousand rows at most and nothing is stored.
--   api.player_index itself is not touched (rebuilding that matview blocks reads).
-- api.player_team_search: the players list of one franchise: api.player_search's columns plus franchise_id, so `franchise_id=eq.N` with the usual
--   filters (league, years, country, position, name, letter), sort and page works exactly as on api.player_index. A player appears once for each
--   franchise, so always ask it with franchise_id=eq.N. It reads api.player_index (034, 050, 063): after that matview is rebuilt by a swap of
--   names, run this file again.
-- api.player_letters (091) and api.player_countries (096) gain p_franchise, so the A to Z row and the country section follow a team choice. Each is
--   dropped and made again with the extra argument last (a function with another argument list would be a second function PostgREST cannot choose
--   between); a call without it means what it meant. Needs 091 and 096 first.
-- Add-only for the tables and the views; rerunnable.

create or replace view api.player_teams as
select p.person_id, p.franchise_id,
       (array_agg(s.league_code order by s.start_year desc))[1] as league,
       min(s.start_year) as first_year, max(s.start_year) as last_year, count(distinct s.season_id)::integer as seasons
from (select rs.person_id, ts.franchise_id, ts.season_id
        from core.roster_stint rs join core.team_season ts on ts.team_season_id = rs.team_season_id where rs.role = 'player'
      union all
      select x.person_id, ts.franchise_id, ts.season_id
        from core.player_season_stat x join core.team_season ts on ts.team_season_id = x.team_season_id) p
join core.season s on s.season_id = p.season_id
group by p.person_id, p.franchise_id;

comment on view api.player_teams is 'Every franchise a player was on: first and last season (start year), seasons, and the league of the latest one. Read with person_id=in.(..) or franchise_id=eq.N.';
grant select on api.player_teams to anon, authenticated;

create or replace view api.player_team_search as
select t.franchise_id, i.person_id, i.name, i.position, i.leagues, i.first_season, i.last_season, i.seasons_played, i.award_count,
       core.fold_text(i.name) as search, i.positions, i.country
from api.player_teams t
join api.player_index i on i.person_id = t.person_id;

comment on view api.player_team_search is 'api.player_search for the players of one franchise: read with franchise_id=eq.N; one row per player and franchise.';
grant select on api.player_team_search to anon, authenticated;

drop function if exists api.player_letters(text, text, text, text, integer, integer, text);
drop function if exists api.player_letters(text, text, text, text, integer, integer, text, integer);
create function api.player_letters(
  p_by text default 'last', p_league text default null, p_nat text default null, p_position text default null,
  p_from integer default null, p_to integer default null, p_q text default null, p_franchise integer default null)
returns table (letter text, n integer)
language sql stable
as $$
  select l.letter, count(*)::integer
  from api.player_search s
  cross join lateral (
    select left(case when p_by = 'first' then s.search
                     else regexp_replace(regexp_replace(s.search, '( (jr|sr|ii|iii|iv))+$', ''), '^.* ', '') end, 1) as letter) l
  where s.leagues <> '{}'
    and (p_league is null or s.leagues @> array[p_league])
    and (p_nat is null or s.country = upper(p_nat))
    and (p_position is null or s.position ilike p_position or s.positions @> array[p_position])
    and (p_to is null or s.first_season <= p_to)
    and (p_from is null or s.last_season >= p_from)
    and (p_franchise is null or exists (select 1 from api.player_teams t where t.person_id = s.person_id and t.franchise_id = p_franchise))
    and not exists (select 1 from unnest(string_to_array(coalesce(p_q, ''), ' ')) w where w <> '' and s.search not like '%' || w || '%')
    and l.letter ~ '^[a-z]$'
    and (p_by = 'first' or s.search !~ '^(jr|sr|ii|iii|iv)( (jr|sr|ii|iii|iv))*$')
  group by l.letter
  order by l.letter
$$;

comment on function api.player_letters(text, text, text, text, integer, integer, text, integer) is 'Players per first letter of the last name (or first name with p_by = first) under the players list filters (p_franchise: played for that franchise); for the A to Z row of /players.';
grant execute on function api.player_letters(text, text, text, text, integer, integer, text, integer) to anon, authenticated;

drop function if exists api.player_countries(text, integer, integer, text, text, text, text);
drop function if exists api.player_countries(text, integer, integer, text, text, text, text, integer);
create function api.player_countries(
  p_league text default null, p_from integer default null, p_to integer default null,
  p_letter text default null, p_by text default 'last', p_position text default null, p_q text default null, p_franchise integer default null)
returns table (country text, n integer)
language sql stable
as $$
  select coalesce(nullif(s.country, ''), 'ZZ') as country, count(*)::integer as n
  from api.player_search s
  cross join lateral (
    select left(case when p_by = 'first' then s.search
                     else regexp_replace(regexp_replace(s.search, '( (jr|sr|ii|iii|iv))+$', ''), '^.* ', '') end, 1) as letter) l
  where s.leagues <> '{}'
    and (p_league is null or s.leagues @> array[p_league])
    and (p_position is null or s.position ilike p_position or s.positions @> array[p_position])
    and (p_to is null or s.first_season <= p_to)
    and (p_from is null or s.last_season >= p_from)
    and (p_franchise is null or exists (select 1 from api.player_teams t where t.person_id = s.person_id and t.franchise_id = p_franchise))
    and not exists (select 1 from unnest(string_to_array(coalesce(p_q, ''), ' ')) w where w <> '' and s.search not like '%' || w || '%')
    and (p_letter is null or (p_letter ~ '^[a-zA-Z]$' and l.letter = lower(p_letter)
         and (p_by = 'first' or s.search !~ '^(jr|sr|ii|iii|iv)( (jr|sr|ii|iii|iv))*$')))
  group by 1
  order by n desc, country
$$;

comment on function api.player_countries(text, integer, integer, text, text, text, text, integer) is 'Players per country (ZZ = unknown) under the players list filters but the country (p_franchise: played for that franchise); for the country chips, donut and map of /players.';
grant execute on function api.player_countries(text, integer, integer, text, text, text, text, integer) to anon, authenticated;

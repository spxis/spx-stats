-- "Where the players come from" on the players page (/players): how many players of the list come from each country, under the filters already chosen
-- (league, years, first letter of the name, position, words of a name), but not the country itself, so the country chips, the donut and the world map
-- keep offering every country. A player's country is api.player_search.country (birth country, else nationality, 063); a player with none is counted
-- under 'ZZ' (unknown), never guessed.
-- Same filters, and the same meaning, as api.player_letters (091) and the list itself (lib/listQuery.ts): the letter is the first letter of the LAST
-- name (the last word of the folded name, once trailing Jr, Sr, II, III and IV are set aside), or of the first name with p_by = 'first'.
-- Until this function exists the page answers a league on its own from api.country_league (068) and leaves the section out for any other choice.
-- Add-only (a new function). Reads api.player_search, which anon may select, so the function needs no extra rights. Rerunnable.

create or replace function api.player_countries(
  p_league text default null, p_from integer default null, p_to integer default null,
  p_letter text default null, p_by text default 'last', p_position text default null, p_q text default null)
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
    and not exists (select 1 from unnest(string_to_array(coalesce(p_q, ''), ' ')) w where w <> '' and s.search not like '%' || w || '%')
    and (p_letter is null or (p_letter ~ '^[a-zA-Z]$' and l.letter = lower(p_letter)
         and (p_by = 'first' or s.search !~ '^(jr|sr|ii|iii|iv)( (jr|sr|ii|iii|iv))*$')))
  group by 1
  order by n desc, country
$$;

comment on function api.player_countries(text, integer, integer, text, text, text, text) is 'Players per country (ZZ = unknown) under the players list filters but the country; for the country chips, donut and map of /players.';
grant execute on function api.player_countries(text, integer, integer, text, text, text, text) to anon, authenticated;

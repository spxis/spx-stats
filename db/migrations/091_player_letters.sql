-- The A to Z row of the players page (/players): how many players start with each letter, under the filters already chosen, so a letter with
-- none can be greyed out. The letter is the first letter of the LAST name (the last word of the folded name, once trailing Jr, Sr, II, III and IV
-- are set aside), or of the first name with p_by = 'first'. The folded name has no accents or capitals, so "Éric" counts under E.
-- The filter itself (a click on a letter) needs no database change: lib/listQuery.ts asks api.player_search with a regular-expression match on the
-- same folded name, and means the same thing as the expression here. This function only counts. Until it exists the page draws every letter.
-- Add-only (a new function). Reads api.player_search (037, 050, 063), which anon may select, so the function needs no extra rights.
-- Same filters as the players list: league, country (p_nat), position code (the main position or any other held), years (first..last season
-- overlapping p_from..p_to) and the words of a name (p_q, folded, every word contained). Rerunnable.

create or replace function api.player_letters(
  p_by text default 'last', p_league text default null, p_nat text default null, p_position text default null,
  p_from integer default null, p_to integer default null, p_q text default null)
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
    and not exists (select 1 from unnest(string_to_array(coalesce(p_q, ''), ' ')) w where w <> '' and s.search not like '%' || w || '%')
    and l.letter ~ '^[a-z]$'
    and (p_by = 'first' or s.search !~ '^(jr|sr|ii|iii|iv)( (jr|sr|ii|iii|iv))*$')
  group by l.letter
  order by l.letter
$$;

comment on function api.player_letters(text, text, text, text, integer, integer, text) is 'Players per first letter of the last name (or first name with p_by = first) under the players list filters; for the A to Z row of /players.';
grant execute on function api.player_letters(text, text, text, text, integer, integer, text) to anon, authenticated;

-- Cold reads (ticket SPX-808). Add-only: one new view. Apply to DS1 first, then production. The site reads it and, while it is missing (a 404), falls back
-- on the request it made before, so the site works before and after.
--   api.player_multi_league   new view: the people who played in more than one league (person_id and their leagues, ~ a few thousand of ~82,000 in api.player_index)
-- The site used to find them with one `leagues @> '{a,b}'` test for every pair of menu leagues (36 of them, about 17 ms each on DS1, 500 ms a request, made
-- by almost every page that links a player); the view is one scan of the people.

create or replace view api.player_multi_league as
select person_id, leagues
from api.player_index
where cardinality(leagues) > 1;
comment on view api.player_multi_league is
  'The people with more than one league in api.player_index.leagues (rival and predecessor leagues count, so a reader that wants only the menu leagues filters the list again). Migration 167.';
grant select on api.player_multi_league to anon, authenticated;

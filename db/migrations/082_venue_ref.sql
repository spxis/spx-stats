-- The Wikidata id of the venue api.game_venue and api.venue_game name by venue_id, so a page can say where a game was played and draw it on the right
-- surface (a ballpark's own fence is found by the venue's Wikidata item). core.venue keeps that item in source_key (every row of it is one); no view
-- of the api schema showed it. One row per venue (about 770), the name as it is now. Add-only: a view and its grant, no data.
create or replace view api.venue_ref as
select v.venue_id,
       v.source_key as wikidata_id,
       (select n.name from core.venue_name n where n.venue_id = v.venue_id order by upper(n.valid_during) desc nulls first limit 1) as name
from core.venue v
where v.source_key ~ '^Q[0-9]+$';
comment on view api.venue_ref is 'The Wikidata item (wikidata_id) and current name of each venue by core.venue.venue_id, the id api.game_venue and api.venue_game use.';
grant select on api.venue_ref to anon, authenticated;

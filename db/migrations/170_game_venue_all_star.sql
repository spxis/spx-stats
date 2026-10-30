-- Cold reads, part 2 (ticket SPX-810). Add-only: two new views. Apply to DS1 first, then production. The site reads each of them and, while it is
-- missing (a 404), falls back on the reads it made before, so the site works before and after. No existing object changes.
--   api.game_venue_place   a game's venue (api.game_venue) with the venue's Wikidata item and name (api.venue_ref)
--   api.all_star_league    one league's All-Star events, games and Most Valuable Players, as three lists in one row
-- Each replaces two or three requests a page made one after the other (or at once) with one. Each is made only where the views it reads exist.
-- Every statement finishes in well under a second.

-- api.game_venue_place: where a game was played and the Wikidata item of the venue. Two requests in a row on every game and season page.
-- Made only where api.game_venue and api.venue_ref exist.
do $$
begin
  if to_regclass('api.game_venue') is not null and to_regclass('api.venue_ref') is not null then
    execute $v$
      create or replace view api.game_venue_place as
      select g.game_id, g.venue_id, g.basis, r.wikidata_id, r.name
      from api.game_venue g
      left join lateral (select v.wikidata_id, v.name from api.venue_ref v where v.venue_id = g.venue_id limit 1) r on true $v$;
    execute $v$ comment on view api.game_venue_place is 'api.game_venue with the Wikidata item (wikidata_id) and current name of the venue from api.venue_ref, null where that holds none (migration 170).' $v$;
    execute 'grant select on api.game_venue_place to anon, authenticated';
  end if;
end $$;

-- api.all_star_league: the three lists the All-Star pages read together (events, games, Most Valuable Players), in the order each was read in.
-- The lists hold the rows of api.all_star_event, api.all_star_game and api.all_star_mvp as JSON objects with the same columns. Made only where those exist.
do $$
begin
  if to_regclass('api.all_star_event') is not null and to_regclass('api.all_star_game') is not null and to_regclass('api.all_star_mvp') is not null then
    execute $v$
      create or replace view api.all_star_league as
      select l.league,
             (select coalesce(jsonb_agg(to_jsonb(e) order by e.year, e.event_no), '[]'::jsonb) from api.all_star_event e where e.league = l.league) as events,
             (select coalesce(jsonb_agg(to_jsonb(g) order by g.year, g.event_no, g.game_no), '[]'::jsonb) from api.all_star_game g where g.league = l.league) as games,
             (select coalesce(jsonb_agg(to_jsonb(m) order by m.year, m.event_no, m.seq), '[]'::jsonb) from api.all_star_mvp m where m.league = l.league) as mvps
      from (select distinct league from api.all_star_event) l $v$;
    execute $v$ comment on view api.all_star_league is 'One row for each league with All-Star events: its events, games and Most Valuable Players as JSON lists (the rows of api.all_star_event, api.all_star_game and api.all_star_mvp, oldest first). One request in place of three (migration 170).' $v$;
    execute 'grant select on api.all_star_league to anon, authenticated';
  end if;
end $$;

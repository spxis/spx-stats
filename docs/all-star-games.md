# All-Star Games, from Wikipedia

Every All-Star Game of the NHL, NBA, MLB, NFL (the Pro Bowl), CFL and WNBA on record, from the English Wikipedia list article of each league and the article of each
game (CC BY-SA 4.0): when and where it was played, the host club, the result, the Most Valuable Player(s) and, where the game article lists them, the players picked for
each side. A game that was not held (a lockout, the Olympics, a pandemic) is a row with its reason. Nothing in `core.game` is written or copied, and no red source is read.

| Piece | Where |
|---|---|
| Fetch (one request per 2.5 s, API with the revision id; each list article, then every game article the list links) | `scripts/all_star/fetch.py <raw dir> [league ...]` |
| Parse to SQL for the legacy tables | `scripts/all_star/parse.py <raw dir> <out.sql> [<out.json>]`, tests `python3 -I scripts/all_star/test_parse.py` |
| Legacy tables (DS1 only) | `db/migrations/144_legacy_wikipedia_all_star.sql` |
| Core tables and `api` views (DS1 and production) | `db/migrations/145_all_star.sql`: `core.all_star_event`, `all_star_game`, `all_star_mvp`, `all_star_selection`; `api.all_star_event`, `all_star_game`, `all_star_mvp`, `all_star_selection` |
| Build into core | `db/build/224_all_star.sql` |
| Site | `/<league>/all-star` (the newest decades as cards, older decades at `/<league>/all-star/decade/1990s`), `/<league>/all-star/<year>` (the game(s) of a calendar year: a two-sided banner, a tournament as a Taisen bracket file `/bracket-svg/allstar-<league>-<year>...svg`, the games of a series, the facts, a table of the players picked for each side), the All-Star banner beside the champion's on each season page, a link on the league page, an All-Star Games section on a player's page; `web/src/lib/allStar.ts`, `allStarView.ts`, `allStarResult.ts`, `allStarSides.ts`, `allStarClubs.ts`, `allStarBracket.ts`, `web/src/components/AllStar.tsx`, `AllStarRosters.tsx`, `AllStarBracket.tsx`, `pnpm test:allstar` |

Where the raw files live: `~/Projects/backups/spx-stats/raw/wikipedia_all_star/<day>/` (`fetched.json` holds each article's revision id). They are archived to DS1's
`legacy_files.raw_archive` and Dropbox by the coordinating session before anything is loaded.

What the parsers read: each list's result table (a column per league; `scripts/all_star/lists.py`), the infobox of a game article (day, venue, city, attendance), and the
rosters (`scripts/all_star/game.py`): tables with a Player column, the Pro Bowl's position grids, and bulleted lines such as `* 4 - LW [[Name]] ([[Team]])`. Recap and box
score addresses and every reference are dropped. What cannot be read is left empty and written to `legacy_wikipedia_all_star.unparsed`, then to `meta.data_issue`
(`entity_kind = 'all_star'`); nothing is guessed. Coverage on 2026-10-20: 358 played events (NHL 70, NBA 75, MLB 96, Pro Bowl 81, CFL 14, WNBA 22), every one with a day;
rosters for 301 of them (the older NHL and Pro Bowl articles list none, or only in prose).

Build rules: keys are the league, the calendar year, the event number (two games in a year: MLB 1959 to 1962, the NFL's 1940 and 1942) and the game number, so no id ever
changes; a roster line is keyed by its line number in the article. A season is found from the day (NHL and NBA: the season that starts in the autumn before a winter game;
Pro Bowl before June: the season before; the others: their own year). A venue is the `core.venue` whose Wikidata id (`source_key`) its article has, else the one venue
whose name in `core.brand_venue_name` is the printed name that year; `venue_wikidata_id` is set only for a venue with a place on the map, because the site links
`/venue/Q...`. A player is linked to `core.person` by the Wikidata id of his article, else by his name when exactly one person of that name has a stat line or roster stint
in a team season of that league and season; otherwise the name stays unlinked. MLB days, scores and attendance are compared with Retrosheet's All-Star games and every
difference goes to `meta.data_issue` as "differs", without Retrosheet's numbers.

Release tables (production): `core.all_star_event`, `core.all_star_game`, `core.all_star_mvp`, `core.all_star_selection`. They are not Turso tables. Migration 145 must be on
production first; until then the site's All-Star sections stay hidden (a missing view reads as no rows).

Not covered yet: the Pro Bowl rosters of 1995 to 1999 (prose, not tables) and the 1950s to 1970s articles that list no players; NWSL and PWHL (English Wikipedia has no
All-Star Game article for either); the CFL games have no Most Valuable Player or roster in the source; a game's skills events; an All-Star list on a venue's page.

How the site draws them (`web/src/lib/allStarView.ts`): a game with a host club on one side puts the host on the right (the home side, `lib/sides.ts` `gameOrder`), any other game puts the western side on the left (`neutralOrder`); a tournament (three or more semifinal and final games whose final is between the semifinals' winners) is a bracket, a short series a banner with its games (the games each side won, the goals when those are level), anything else the game that decided it with the others as strips. A side with a franchise id is a club (its logo that season, its brand colours, a link); any other side (East, the American League, Team McDavid) is its letters on a colour, because the archive holds no conference or league mark. A club named in a roster or Most Valuable Player line is linked only when exactly one club of that league's season fits the text (`lib/allStarClubs.ts`: full name, nickname, city or abbreviation; "New York" or "Chicago" in a league with two such clubs stays plain text). The last line of the 1987 Rendez-vous list ("Soviet Union wins 8, on aggregate 7") is not a game and is dropped (`realGames`); the series result is added up from the games.

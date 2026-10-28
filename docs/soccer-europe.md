# Soccer: the European club leagues (proposal and first load)

Proposal for John's ticket "European soccer leagues (Premier League, La Liga, Bundesliga, Serie A, Ligue 1)" and the soccer part of "Import SPX archive extras"
([spx-extras-inventory.md](spx-extras-inventory.md)). The soccer family so far is the World Cup ([soccer.md](soccer.md)) and MLS ([mls.md](mls.md)). International stays the
FIFA side (national teams, `wc`/`wwc`); this adds club leagues next to MLS.

## What we hold, honestly: thin

- **SPX database** (`legacy_spx`, already on DS1): European Football is SPX sport 29, 92 leagues defined, but fixtures only for 2004-05 and 2005-06. SPX scheduled the
  seasons and recorded a final score for only part of the games. Listed seasons (11, at least 30 scores each; `db/build/220_soccer_europe_spx.sql`):

  | Season | Scores of the season's matches |
  |---|---|
  | Premier League 2004-05 / 2005-06 | 199 / 365 of 380 |
  | EFL Championship 2004-05 / 2005-06 | 113 / 96 of 552 |
  | EFL League One 2004-05 | 46 of 552 |
  | Scottish Premier League 2004-05 / 2005-06 | 105 / 213 of 228 |
  | La Liga 2005-06, Serie A 2005-06, Ligue 1 2005-06, Bundesliga 2005-06 | 38, 40, 69, 36 of 380, 380, 380, 306 |

  1,320 matches and 159 clubs in all. Everything else SPX filed under those leagues is either unscored (5,549 fixtures), a friendly filed under a league (left out
  and counted in `meta.data_issue`), or a cup. There is no standings table, no scorer, no lineup, no venue.
- **SPX folder** (John's Dropbox): one soccer results capture of 2004 (Data/efl, ESPN Soccernet pages): +962 scores for the same fixtures, needing John's decision on ESPN;
  and the daily Soccernet/BBC scoreboards 2005 to 2008-09 (ESPN/BBC, John decides). Nothing for earlier years and nothing with standings.
- So the leagues have to come from open sources. Wikipedia would have to fill all of the following (no allowed source holds them as data):
  season tables (position, played, won, drawn, lost, goals for/against, points, qualification and relegation marks) for every season of every league; champions
  and promoted/relegated clubs; the club identity and Wikidata id; per-match data before openfootball's coverage (England before 2000, Germany before 2010, Spain
  before 2012, Italy before 2013, France before the repository's start) from the "Results" cross-tables of the season articles; scorers and awards.

## Sources and tiers (AGENTS.md section 3: never FBref/Sports Reference, never ESPN, never the leagues' own sites)

| Source | Licence | Gives | Use |
|---|---|---|---|
| openfootball (`england` 2000-01 to now plus an `archive`; `deutschland` 2010-11 on; `espana` 2012-13 on; `italy` 2013-14 on; `europe` with country folders for France, Scotland, the Netherlands and others; `europe-champions-league` 2011-12 on) | CC0 | every match: date, score, half-time, which club is at home, in Football.TXT | the base for matches in those years; same parser style as MLS (`scripts/mls/openfootball.py`) |
| English Wikipedia season and club articles | CC BY-SA 4.0 | tables, champions, promotion/relegation, results cross-tables, leaders, awards | tables and honours for all years; matches before openfootball |
| Wikidata | CC0 | club, stadium and league ids, founded/dissolved dates, stadium and city | identity (`core.soccer_team.wikidata_id`), venues |
| SPX database | owned | 2004-06 scores above | the base where it has a score ("SPX wins"); others confirm it |
| Transfermarkt | grey (ticket's tier rule) | squads, transfers, market values | only if John allows; not for results |
| ESPN Soccernet, FBref, BBC Sport, the leagues' sites | no | | never (BBC: John decides) |

## League model

Same shape as MLS, so the existing soccer API and page code carry over; migration 139 adds what a pyramid needs.

- **A division is a league**, in `ref.league` (sport `soccer`): `premier_league`, `efl_championship`, `efl_league_one`, `efl_league_two`, `national_league`, `la_liga`, `bundesliga`,
  `serie_a`, `ligue_1`, `eredivisie`, `scottish_premiership`, `scottish_championship`, `scottish_league_one`, `scottish_league_two`. Names by period go in `ref.league_name`
  (the Football League Championship became the EFL Championship in 2016; the Wikipedia phase fills the periods). The pyramid is `ref.soccer_league_system`:
  `system_key` (england, scotland, spain, germany, italy, france, netherlands), `tier` (1 = top). Other countries follow the same way.
- **A season of a division is a `core.soccer_tournament`**: `tournament_id` = league code + start year (`premier_league2005`), `year` = start year, `complete` false until every
  match is in, `note` saying why a season is partial.
- **A club is a `core.soccer_team`** with `kind = 'club'` (`C-arsenal`), kept for ever once given; its identity in the end is its Wikidata item, mapped from each
  source's spelling by a seed list; `source_key` records how a source named it (`spx:team:1068`). Clubs are not `core.franchise` rows: a franchise is the five
  North American leagues' idea (one league at a time, `team_season`), and putting the European club-seasons there would put them into every team list, standings view
  and venue list that the five leagues use. The soccer tables are where MLS already lives, with the pages for it.
- **The clubs of a season** are `core.soccer_tournament_team` (with `team_name` as the club was called then: renames are a name per season, not a new club).
- **Promotion and relegation are derived, not stored.** `api.soccer_club_seasons` lists a club's division by season with its tier, and `api.soccer_club_moves` compares two
  consecutive seasons of one pyramid: lower tier number = promoted, higher = relegated, equal = stayed (null when the club is not in next year's data). A check on the
  first load, from SPX alone: Crystal Palace, Norwich and Southampton relegated and Sunderland, West Ham and Wigan promoted from 2004-05 to 2005-06, which is what happened. A club that
  disappears (financial collapse, leaving the pyramid) simply has no next season; play-offs, expulsions and league reconstructions (the Premier League's 1992 split, Germany's
  1963 start) are Wikipedia facts that go into `note`, not into the model.
- **A match is `core.soccer_match`** with `stage_key` `regular` (play-offs `playoff`, and `final`/`semi` for knockout matches) and `source_key` =
  `eu-<yyyymmdd>-<home team_id>-<away team_id>`, so every source meets on one row. SPX wins where it holds a value: a later source adds missing matches and writes
  `meta.verification` (confirmed / disputed) for the ones SPX has; a disagreement is a `meta.data_issue` and the SPX score stays.
- **Venues**: the stadium as the source names it, filled to `core.venue` later by Wikidata id (as for MLS and the World Cup).
- **Pages (after the data is in)**: `/soccer` lists the leagues; `/premier-league` (champions, seasons), `/premier-league/2005-06` (table, results, promoted/relegated
  clubs), `/soccer/club/<slug>` (the club's seasons across divisions with promotion/relegation arrows). The routing rules of AGENTS.md section 9 apply (kept pages, `QUERY_KEYS`);
  none of this is built yet, and nothing the first load adds is read by an existing page.

## What is built (this ticket)

- Migration 139 (`ref.soccer_league_system`, two columns on `core.soccer_team`, one on `core.soccer_tournament`, the two views), add-only.
- `db/build/220_soccer_europe_spx.sql`: the SPX seasons above, rerunnable, ids kept (tested: a second run leaves every id, slug and row identical).
- Migration 140 (`legacy_spx_extras.efl_result`) and `scripts/spx_extras/efl.py`: the loader for the EFL capture. **Not to be run before John decides about ESPN-origin files.**

## Built since (ticket "European soccer: fill from openfootball and Wikipedia", 2026-10-26)

- **openfootball (CC0)**: `scripts/openfootball_eu/` (fetch, parser tested against every file's own match count, loader into `legacy_openfootball`), build step
  `db/build/227_soccer_europe_openfootball.sql`. Read: England 1992-93 on (Premier League; the lower four divisions from 1998-99, the National League 2015-16 on), Germany
  2010-11 on (three divisions), Spain 2012-13 and Italy 2013-14 on (two each), France 2014-15 on (two): 108,093 matches in 255 files. The archive folder `england/archive/1990s`
  gives the Premier League back to 1992-93. A spelling of a club is one row of `db/seed/soccer_club_eu.csv`; the divisions, their names by period and a `matches` flag are
  `db/seed/soccer_league_eu.csv`.
- **Only the five top divisions have their matches built** (32,373 rows, about 18 MB on production); every division gets its seasons and clubs, so promotion and relegation
  read across the pyramid. Production was 395 MB of 500 MB on 2026-10-26 and a match row costs about 0.55 KB with its indexes (all divisions: 108,000 rows, 58 MB), so the
  lower divisions stay in `legacy_openfootball`; flip a division's `matches` flag to 1 and rerun 227 when there is room.
- **SPX wins**: a fixture SPX holds (same season, the same two clubs with either at home, dates at most 3 days apart) is not added again, even when SPX has the sides the other
  way round; each openfootball fixture is paired with one SPX match, nearest date first. openfootball writes `meta.verification` (field `score`, goals compared club by club:
  confirmed / disputed / not_found; field `home_away` when the sides differ) and a `meta.data_issue` for a score difference or a different date; sides that differ are their own
  finding (`soccer_match_side`), never a score dispute. SPX clubs keep their rows and ids and take the seed's name.
- **SPX home and away**: SPX lists the visiting club first for the whole of the English 2004-05 seasons (Premier League, Championship, League One) and for six Premier League matches
  of 2005-06; this was found on 2026-10-28 when step 227 built a second copy of 120 fixtures. It is SPX's own data (step 220 copies `home_team_id` as it is), proved by openfootball (same
  date, goals per club equal) and by the results tables of the Wikipedia season articles (179 of 179 settled matches of the Premier League 2004-05 reversed). `db/seed/soccer_spx_reversed.csv`
  names them (scope `season`, `match`) and the cup and European ties SPX filed under the league season (scope `other`, left out); step 220 swaps the sides before keying the matches and
  re-orients rows an earlier run stored the SPX way **in place** (`match_id` kept, `source_key`, sides and goals change). Unchecked: the Scottish Premiership 2004-05 (105 matches), for which
  no second source is loaded, is probably reversed too. `db/checks/103` returns any pair of clubs meeting twice on one day with the sides reversed (baseline 0).
- **English Wikipedia**: `scripts/wikipedia_eu/` (fetch of 378 season articles of the five top divisions, table parser, loader into `legacy_wikipedia_europe`), build step
  `db/build/228_soccer_europe_wikipedia.sql`: final league tables (`core.soccer_group_standing`), champions and top four, Wikidata ids of 314 clubs, seasons before openfootball's
  files as tournaments with a table and no matches, and a `meta.data_issue` wherever Wikipedia's table and the matches differ or a table's points are not 3/2 per win + draws.
  Not read yet: the second and lower divisions' articles (so a club relegated before 1998 shows no move), results cross-tables, scorers, awards, Scotland and the Netherlands.
- **Site**: `/soccer` lists the five leagues; `/soccer/premier-league`, `/soccer/premier-league/2005-06` (table, promotion and relegation, results grid, play-offs) and
  `/soccer/club/arsenal`; the soccer chips gain the five leagues. Migration 155 adds `api.soccer_league_seasons` and `api.soccer_clubs`. Each section draws nothing while its data is missing.

## Phases

1. **This load** (SPX, 2004-06): the model is live with 11 partial seasons. Recommended: do not release it to production yet; a release would publish tables nothing reads, and 11 half-empty
   seasons would be the first thing a page shows. Apply to DS1 and keep it as the base the next phases attach to.
2. **openfootball**, per country: fetch (CC0), archive, load into `legacy_openfootball_clubs`, build (steps numbered 220, before the last step 221): matches for England from 2000-01, Germany 2010-11, Spain 2012-13, Italy
   2013-14, France and Scotland from the `europe` folders; SPX confirms. A 20-club division is 380 matches a season, an 18-club one 306.
3. **Wikipedia**: season articles for all top divisions (Premier League 1992-93 on, La Liga 1929-30 on, Bundesliga 1963-64 on, Serie A 1929-30 on, Ligue 1 1932-33 on): tables, champions, promoted
   and relegated clubs, the results cross-table where the article has one; club identity and Wikidata ids. This is the bulk of the work and the only source for the older years.
4. **Pages**, then a data release (tables: `ref.league`, `ref.league_name`, `ref.soccer_league_system`, `core.soccer_team`, `core.soccer_tournament`, `core.soccer_tournament_team`,
   `core.soccer_match`, `core.soccer_group_standing`, `meta.verification`, `meta.data_issue`).
5. **EFL, Scottish and the other leagues** by the same steps; the UEFA competitions as their own tournaments (`europe-champions-league` from openfootball).

## Decisions for John

- ESPN-origin soccer files (EFL capture): load as confirm-only, or never. See the inventory.
- Whether to publish phase 1 before phase 2 exists (recommended: no).
- Transfermarkt (grey) for squads: not before the match and table data is in.

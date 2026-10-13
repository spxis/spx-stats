# Soccer: Major League Soccer

MLS 1996 to now, as the second competition of the soccer archive (the first is the World Cup, [docs/soccer.md](soccer.md)). It reuses the
`core.soccer_*` tables of migration 066 and adds only what clubs and leagues need (migration 076, add-only).

## Data model

An MLS season is a `core.soccer_tournament` (`tournament_id` `mls1996`, `league_code` `mls`), not a season of a franchise league: nothing here
touches `core.season`, `core.game`, `core.team_season`, `core.franchise` or a venue table (the five leagues' lists and the Stadiums work are unaffected).

| What | Where |
|---|---|
| A club | `core.soccer_team` with `kind = 'club'`, `team_id` `C-<slug>`, `wikidata_id`. A club is its English Wikipedia article after redirects, so a renamed club is one row (Tampa Bay Mutiny, Miami Fusion and Chivas USA are separate clubs; MetroStars to New York Red Bulls is one). 33 clubs. |
| The name a club carried | `core.soccer_tournament_team.team_name` per season; `api.mls_club_names` folds it into runs (Los Angeles Galaxy 1996-2006, LA Galaxy 2007-). `api.soccer_matches` and `api.soccer_team_matches` show the name of that season. |
| A season's clubs | `core.soccer_tournament_team`: conference, home stadium (the one most home regular-season matches were played in, with city and Wikidata id), `performance` (the stage it last played in: `champion`, `final`, `conference_final`, `conference_semi`, `round_one`, `wild_card`, `missed`; null while the season is in progress), `final_position` 1 / 2 |
| A match | `core.soccer_match`: `stage_key` `regular`, `wild_card`, `round_one`, `conference_semi`, `conference_final`, `final`; score at the end of play; `shootout` with a penalty score, or (1996-1999 regular season) `shootout_style = 'mls'` with a winner and no kick score; `attendance`; the stadium as the source names it (`venue_name`, `venue_city`, `venue_wikidata_id`), `venue_id` empty for the world stadium dataset to fill by Wikidata id |
| The tables | `core.soccer_group_standing`: stage 1 `conference` (Eastern / Western Conference), stage 2 `overall`; `shootout_wins` (1996-1999), `qualification` |
| Honours | `core.soccer_tournament.winner_team_id` / `runner_up_team_id` from the MLS Cup final, `shield_team_id` from the overall table's (S) mark; `complete = false` for a season in progress (2026) |
| Leaders and awards | `core.soccer_season_leader`: goals, assists, shutouts, and the individual awards, by name (no `core.person` row is made; `wikidata_id` where the link gave one) |
| API | `api.mls_seasons`, `mls_season_teams`, `mls_clubs`, `mls_club_names`, `mls_alltime`, `mls_leaders`, and the soccer views of 066 (`soccer_matches`, `soccer_team_matches`, `soccer_standings`) which carry a `league` column. `api.soccer_teams` now lists national teams only. |

Soccer people keep an empty `leagues`, so `PLAYER_LISTED` is unaffected: this load creates no person at all.

## Where each fact comes from

- **openfootball/world** (CC0, 2005-2025): the base for every match of those seasons: date, score, extra time, shootout, playoff round, which club is at home.
  Its 2025 file stops part way through the season (the repository's last commit is 2026-09-23); 2026 is not in it.
- **English Wikipedia** (CC BY-SA 4.0): the season articles give the conference and overall tables, leaders, awards and the playoff boxes of many seasons; the
  club-season articles give a match box per match (date, score, stadium, city, attendance). From 2005 the boxes are the second source (stadium, attendance,
  check of the score); for 1996-2004, 2025 after openfootball's file ends, and 2026 they are the only source. **Not every club has a season article** and
  some articles list only some matches.
- **Wikidata** (CC0): item ids of clubs, stadiums and players, from the Wikipedia pages' page properties.
- **mlssoccer.com is not used.** Its Terms of Service (https://www.mlssoccer.com/legal/terms-of-service, "As of September 30, 2023"), section 5.2, forbid
  "spidering, screen scraping, database scraping or other such activity" and the use of "browsers, spiders, robots, avatars or intelligent agents" to
  "harvest or otherwise collect information ... for any commercial purpose"; section 1 forbids reproducing, republishing, building on, modifying, posting or
  compiling its content. The terms page was read once by hand. Never FBref / Sports Reference, ESPN, Transfermarkt, NWSL / CPL sites or Kaggle FIFA ratings either.

Rules the build follows (db/build/204_mls.sql, header and comments): a club's article does not always list the home side first (about a third of the
two-article pairs disagree), so the home side of a Wikipedia-only match is the club whose own stadium it was played in; where openfootball has a season in full
(2005-2024: its match counts equal the seasons' own tables) a Wikipedia box with no openfootball line is another competition and is left out (a
meta.data_issue row names it), unless both clubs' tables say they played more than openfootball gives them (one 2020 match).

## Second check and what disagrees

`meta.verification` (`entity_kind = 'soccer_match'`): `score` is openfootball against the Wikipedia box(es) (confirmed / disputed / not_found);
`score_two_articles` is the two clubs' articles against each other for a Wikipedia-only match. A disagreement is a `meta.data_issue` row and the first
source's value is kept (openfootball's, or the home club's article). Also in `meta.data_issue`: a Wikipedia box dated differently from openfootball's
(one article dated the 2006 MLS Cup 28 October), a Wikipedia box left out, and every club-season whose table says more games than we hold (1996-2004, 2025, 2026).
On DS1 on 2026-10-13: see "Row counts".

## Not complete

- **1996-2004 regular seasons hold 59 to 92 percent of their results**, recorded per season on the pages ("138 / 160") and in `api.mls_seasons.expected_regular`:
  Wikipedia has no season article for some clubs in those years and some articles list only part of the schedule; no source we may use has the rest. A finished
  season's table is complete either way. The 2005-2024 seasons match their tables exactly (one 2020 match short).
- 2025's regular season is 496 of 510 (openfootball stops part way, the Wikipedia articles lack the rest); 2026 is in progress (417 of 420 played so far at the
  last read, no playoffs).
- No player statistics beyond each season's top goal scorers, assists and shutouts and the individual awards, as the season article lists them; no goals, lineups,
  cards or referees for any match.
- A stadium is missing on 93 matches (clubs with no article that year); the stadium name is the article's, so the same ground can carry two names over the years.
- Match orientation in a final is the box's (the final is not at a home ground); the pages show the score from the champion's side.

## Pages (web/)

`/mls` (every season with its Supporters' Shield and MLS Cup winners, runner-up, final, results held, goals, attendance; every club's all-time record), `/mls/<year>`
(tables, playoff ties, clubs and stadiums, every result, leaders, awards), `/mls/team/<slug>` (names by period, titles, seasons, every match),
`/mls/<year>/match/<id>-<slug>` (score, stage, stadium, attendance, whether a second source confirms it). All are kept pages (`app/[locale]/s/mls`, with `q/`
twins for the sub-pages; `mls` is in `ALWAYS_STATIC` and `PAGE_ROOTS`). `/soccer` links to it and the footer carries the link. With no MLS data in
production the pages say so and nothing breaks; the World Cup readers (`getTournaments`, `getMatch`) filter on `league in (wc, wwc)` so MLS rows never appear there.
No club or league logos.

## Size

On DS1 (2026-10-13), MLS rows: `core.soccer_match` 9,071 rows about 6.8 MB with indexes, `meta.verification` 8,166 rows about 3.2 MB, standings, leaders,
club-seasons, clubs, seasons and data issues about 1.3 MB: about **12 MB** on production, of the 500 MB plan.

## Commands

See `scripts/mls/README.md`. Production only through a data release (AGENTS.md section 8, item 5), after migration 076 is on production (add-only) and after
the World Cup release (both name `meta.source`, `ref.sport`, `ref.league`, `ref.league_name`, `core.soccer_*` and `meta.*`). Tables:
`meta.source,ref.sport,ref.league,ref.league_name,core.soccer_team,core.soccer_tournament,core.soccer_tournament_team,core.soccer_group_standing,`
`core.soccer_match,core.soccer_season_leader,meta.verification,meta.data_issue`.

# The Stanley Cup Final, from Wikipedia

Every Stanley Cup Final from 1915 on, one row per final and one per game, from the English Wikipedia article about each final (CC BY-SA 4.0).
It exists because the game rows of the NHL's finals in `core.game` come from the NHL API, which may only be read to confirm, so they cannot be
republished. These tables are the open record. Nothing in `core.game` is written or copied.

| Piece | Where |
|---|---|
| Fetch (one request per 2.5 s, API with the revision id) | `scripts/stanley_cup_final/fetch.py <raw dir>` |
| Parse to SQL for the legacy tables | `scripts/stanley_cup_final/parse.py <raw dir> <out.sql> [<out.json>]`, tests `python3 -I scripts/stanley_cup_final/test_parse.py` |
| Legacy tables, core tables, `api.cup_final`, `api.cup_final_game` | `db/migrations/142_legacy_wikipedia_stanley_cup_final.sql` (DS1 only), `db/migrations/143_cup_final.sql` |
| Build into core | `db/build/223_cup_final.sql` |

What the parser reads: the infobox (teams, games won, dates, format, `mvp` = the Conn Smythe winner, `series_winner` = who scored the Cup winner,
the per-game scores `team1_1` ... `team2_7` where each star after a score is an overtime period, the arena lines) and the `{{NHLPlayoffs}}`
game summaries (the day, the overtime count). The recap addresses in those templates point at nhl.com and are never read or stored. A date that
cannot be right (the same day as the game before, outside the series dates) is left empty and written to `legacy_wikipedia_stanley_cup_final.unparsed`,
then to `meta.data_issue` (`entity_kind = 'cup_final'`). 2005 has no article (no final). 1919 has no winner (the series was stopped).

Build rules: keys are the year and the game number (no id ever changes); a club is found by its name in the NHL season (accents and spacing ignored,
three names aliased in the step); a game points at `core.game` only when the two clubs' playoff games there are as many as the article lists; every
disagreement (a date, a score, the winner, the Conn Smythe row) goes to `meta.data_issue` as "differs", without the other source's numbers.

Release tables: `core.cup_final`, `core.cup_final_game` (production). `meta.data_issue` goes to Turso with the rest of that table.

# Season length (MLB and NFL)

`db/build/222_season_length.sql` fills `core.season.games_per_team` (MLB, from English Wikipedia's "Major League Baseball schedule":
`scripts/mlb_schedule/` writes `db/seed/mlb_season_length.csv`) and `regular_starts_on` / `regular_ends_on` (MLB and NFL, from the games themselves,
only for a finished season whose clubs all have about the same number of games). It fills a null and never overwrites.

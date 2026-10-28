# College football from CollegeFootballData.com (CFBD): what was fetched and what it changes

Tickets cmveusfgn0008kw06569ggz2p (college football) and cmveusf6k0007kw06f34fcddt (`scripts/grey/cfbd.py`). Fetched 2026-10-28 with John's free key (1,000 requests a
calendar month, resetting 2026-11-01). Nothing here is built into `core`, loaded to DS1 or published; the section "Model" is a proposal that updates
[college-football.md](college-football.md).

## 1. What was fetched (865 of the 1,000 requests; 135 left unused)

Raw answers, byte for byte: `~/Projects/backups/spx-stats/raw/cfbd/2026-10-28/<endpoint>/<params>.json` (864 files, 535 MB with the log), `fetched.json` (url, sha256, bytes, time) and the
request log `~/Projects/backups/spx-stats/raw/cfbd/request-log.tsv` (its header holds the plan). The key never appears in a file, URL or log.

| Endpoint | Requests | Answer |
|---|---|---|
| `/games?year=Y&seasonType=both` | 158 (1869 to 2026) | **one request is a whole season**: every game of both season types, all divisions: 112,674 games (3,678 of them the 2026 schedule, 2,530 played) |
| `/records?year=Y` | 157 (1869 to 2025) | every team's record by season: total, conference, home, away, neutral, regular season, postseason, with classification, conference, division: 33,360 team seasons |
| `/rankings?year=Y` | 90 (1936 to 2025) | every weekly poll of the season, all polls (AP, Coaches, CFP, FCS, AFCA D-II and D-III): 49,723 poll rows |
| `/stats/season?year=Y` | 22 (2004 to 2025) + 22 with `classification=fcs` | team season totals as `statName`/`statValue`: 270,314 rows |
| `/roster?year=Y` | 23 (2004 to 2026) | 371,961 roster lines (FBS and FCS) |
| `/stats/player/season?year=Y` | 22 (2004 to 2025) | 1,424,558 player stat lines, 236 MB (**thin before 2009**: 2004 has 54 lines, 2005 451, 2010 31,955) |
| `/games/teams?year=Y&week=W` | 363 (2004 to 2025, every regular-season week, plus the postseason) | team box scores, all divisions: 1,181,592 stat rows after dropping 48,203 identical repeats (a regular-season request for week 1 or 11 to 15 also returns that week's postseason games, so the dedicated postseason requests partly repeated them) |
| `/conferences/affiliations?minYear=1869&maxYear=2026` | 1 | **all history in one answer**: 3,604 team-conference stretches with division and classification |
| `/coaches?minYear=1869&maxYear=2026` | 1 | **all history in one answer**: 1,816 head coaches, 12,564 coach seasons (1886 to 2026) with record, ranks, SRS |
| `/draft/picks` (no year) | 1 | **all history in one answer**: 13,080 NFL draft picks 1967 to 2026 with the college team |
| `/teams`, `/conferences`, `/venues` | 3 | 1,933 teams (1,251 historical ones with no classification), 256 conferences, 852 venues |
| `/info` | 1 | the key's allowance (free, not counted by the server) |

The server counts calls itself (header `x-calllimit-remaining`); the fetcher stops 50 below its own limit as well as at 950 used in the month.

## 2. Coverage, read from the answers (what the data can and cannot say)

- **Games are complete for FBS teams, thin elsewhere.** Every game with a team CFBD classes as FBS today is there from 1869 (82,965 of 108,996 games to 2025). Games between two lower-division
  teams appear only in part: FCS-only games from 1978 (15,084 by 2025), D-II and D-III from 2020 (11,742 games with neither side FBS or FCS, 2020 to 2025, all but a few in 2023 to 2025). "All divisions"
  holds for the 2020s only.
- **Classification is a label on each side of a game** (`homeClassification`, `awayClassification`: `fbs`, `fcs`, `ii`, `iii`, `ii/iii`, null). Before 1978 it is not a season fact (1869: both sides `fbs`
  because those schools are FBS today); null or `ii/iii` for old non-FBS teams. Do not take a pre-1978 "FBS season" from it.
- **Played games carry scores.** Line scores by period (`homeLineScores`) exist from 2001 (partial that year: 435 of 709 games) and for most games after; none before. Pregame and postgame Elo
  from the 1890s, win probability and an excitement index for modern games.
- **Venue, attendance, neutral site:** venue ids and attendance start in 2001 (venue 80 percent of games in the 2000s, 98 percent in the 2010s; attendance 38 percent in the 2000s, 45 in the 2010s,
  28 in the 2020s). `neutralSite` is true for the postseason and a few hundred regular-season games a decade (before 2000 it marks only the postseason).
- **Postseason:** `seasonType` is `postseason` with a week; bowl names are in `notes` from 2002 on ("ALLSTATE SUGAR BOWL", "Division III Championship - First Round"), the College Football Playoff
  in `playoff` (competition, format `four_team`, round, bracket slot, seeds, bowl name) from 2014. Before 2000 postseason games have no name.
- **Games are not ESPN-free in id space.** CFBD's game, team and venue ids are the ids ESPN uses (a game id like 401525434). We store them as CFBD's own ids (`source_key` is `cfbd:<id>`); nothing
  may build an espn.com address from them or call ESPN (AGENTS.md section 3).
- 12 games up to 2025 are not marked completed (cancelled or never played); the loader keeps them with no score.
- **Rankings:** from 1936 (7 weeks in 1936); the final poll of a season is `isFinal` only where CFBD marks it (null on most rows).
- **Coaches** go back to 1886; the `hireDate` is deprecated and null.

## 3. Tables (`legacy_cfbd`, DS1 only; migrations 154 and 157)

`game` (extended: classification, line scores, Elo, win probability, excitement, notes, playoff as jsonb), `team`, `venue`, `conference`, `conference_affiliation`, `coach`, `coach_season`, `team_record`,
`poll_rank`, `draft_pick`, `team_season_stat`, `roster_player`, `player_season_stat`, `team_game_stat` (box scores, one row per team, game and category). Provenance in `source_key`
(`cfbd:<kind>:<ids>`). Expected counts (the loader writes `expected-counts.tsv`; a second run changes nothing; checked on a scratch Postgres with the real answers):

| Table | Rows | Table | Rows |
|---|---|---|---|
| `game` | 112,674 | `team_record` | 33,360 |
| `team` | 1,933 | `poll_rank` | 49,723 (150 identical repeats from the API dropped) |
| `venue` | 852 | `draft_pick` | 13,080 |
| `conference` | 256 | `team_season_stat` | 270,314 |
| `conference_affiliation` | 3,604 | `roster_player` | 371,961 |
| `coach` | 1,816 | `player_season_stat` | 1,424,558 |
| `coach_season` | 12,564 | `team_game_stat` | 1,181,592 |

Load files: `python3 -I scripts/grey/cfbd_load.py <raw day dir> --out-dir <dir>` writes 37 files (about 430 MB of COPY text, split on season boundaries at 150,000 rows). They are not for git.
Each one is one transaction (temp table, COPY, delete of the seasons it carries, insert), applied with `ds1-apply.sh --force` (the files live outside `db/`).

## 4. Model (proposal; updates college-football.md)

1. **Games come from CFBD, not from 6,400 Wikipedia articles.** One request per season gives what the earlier plan would have scraped (about 40,000 FBS games 1978 to now, here 36,178 with an FBS side),
   from 1869 and with venue, neutral site and (from 2001) attendance. Wikipedia stays the source of record for champions, split titles, bowl lineage and as the cross-check
   (`meta.verification` where the two agree, `meta.data_issue` where they differ). SPX wins where it holds a value (2003, 2005 and bowls 2003 to 2010).
2. **Leagues as before: `fbs` with child `fcs`**, but a game's league comes from its sides: a game with an `fbs` side is an FBS game (a lower-division opponent gets a guest team season, as in
   college-football.md section 4); a game of two `fcs` sides is an FCS game. From 1978 on; before 1978 CFBD's classification is today's, so 1869 to 1977 is one `fbs` league
   ("major college"), as Wikipedia calls it, and the loader's null and `ii/iii` sides are guests.
3. **Franchises and clubs:** `legacy_cfbd.team` (id, school, mascot, abbreviation, alternate names, colours, logos) and `conference_affiliation` give the club-to-conference history by year with
   divisions; they replace the hand-built alignment from standings templates for the seasons CFBD covers. A program that moved up (App State, James Madison) shows as two classifications in
   `conference_affiliation`. The `team_id`s are the key for `core.external_id` (entity kind franchise).
4. **Standings** can be computed from the games and checked against `team_record` (total, conference, home, away, neutral, regular season, postseason by team and year; 33,360 rows).
5. **Polls:** `final_rank` from the last regular-season or `isFinal` poll week; the other weeks make a weekly polls page. National champion: still from Wikipedia and the NCAA's list; CFBD has no champion field.
6. **Production room (first release, John's rule):** FBS 2000 to now. Games with an FBS side 2000 to 2025: 21,281 (plus 14,932 FCS-only games if `fcs` follows), at about 290 bytes a game with indexes
   (college-football.md section 6) is about 6 MB for FBS and 4 MB more for FCS; team seasons and box scores are the bigger line: `team_game_stat` has 1.18 million rows from 2004 and is
   **not a candidate for production** (DS1 only, or a per-game summary). Decide the box-score summary (first downs, yards, penalties, possession, turnovers per team and game) when the site page is designed.
7. **Players:** rosters and player season lines are DS1 only and need a person-matching step (CFBD player ids, no Wikidata ids) before they can touch `core.person`; the NFL draft table has the college
   team and `nflAthleteId`, which can tie a college player to an NFL player.

## 5. Terms and credit

The registry row `cfbd` (scripts/daily/sources.py) is green with the clause "Seeded green by John 2026-10-19; a key is needed" and migration 154's licence text says "no bulk redistribution". John's
note of 2026-10-28 is that CFBD's terms permit commercial use. The registry clause and `checked_on` should be updated by the coordinating session to say so (not changed here: the registry also feeds
`web/src/lib/liveSources.ts` and `meta.source`). Credit line: "College football data from CollegeFootballData.com" wherever the data shows. Creating extra keys is barred by CFBD's terms and was not done.

## 6. Re-running

`python3 -I scripts/grey/cfbd_fetch.py plans|budget|get|run <plan>` (the monthly budget, the request log, create-only raw files; November's 1,000 start on 2026-11-01). A season's refresh
is one request (`get games year=2026 seasonType=both` after moving `CFBD_RAW_DAY`), a weekly `/games/teams?year=Y&week=W` for box scores.

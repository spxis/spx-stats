# Daily scores (stage 1: dry run)

Once a day, collect the game scores of the NHL, NBA, MLB, NFL and CFL from sources whose terms allow automated
collection and reuse, without asking any league. This directory is **stage 1**: it fetches, parses, cross-checks and
compares with DS1. It **writes nothing** to DS1 or production. Ticket: "Daily scores from Wikipedia and allowed sources".

## Run it

    scripts/daily/run.py --self-test                 # parsers and pairing on saved excerpts (fixtures/), no network
    scripts/daily/run.py --dry-run                   # fetch what changed, parse, cross-check, compare with DS1 (read-only)
    scripts/daily/run.py --dry-run --since 2026-10-09 --league nhl,nfl -v
    scripts/daily/run.py --dry-run --offline         # parse the cached pages only, no request at all
    scripts/daily/run.py --dry-run --no-ds1 --json /tmp/games.json

Python 3 stdlib only, plus `psql`. DS1 is reached through `ds1.sh`: it finds the host with `ds1_host` from
`scripts/mac/spx-checks.sh` (hosts-file name `ds1`, home LAN, then Tailscale) and reads the password from the keychain
item `spx-stats-db DS1 55440` inside its own process; nothing is printed. Club names come from DS1 (current franchise
names) and are cached in `rosters.json` next to the state file, so a run still parses when DS1 is away (`--no-ds1`).

State and downloads live outside the repo, in `~/Library/Caches/spx-stats-daily/` (`SPX_DAILY_CACHE`, or `--state` and
`--raw-dir`): `state.json` holds the revision id of every page as last downloaded and the nflverse ETag; `raw/<league>/`
holds the wikitext exactly as served.

## What a run does

1. The season each league is in today (NHL/NBA: starts in Aug-Dec; MLB: Feb-Jan; NFL: Mar-Feb; CFL: calendar year;
   override with `--season mlb=2026`).
2. The pages to watch: every club's season article (`2026–27 Toronto Maple Leafs season`, `2026 New York Yankees season`,
   ...) from DS1's club list, plus `2026 Major League Baseball postseason`. 134 pages today.
3. **One `prop=revisions` call per 50 titles** (all leagues together: 3 requests) asks for each page's latest revision id.
   Only pages whose id differs from `state.json` are downloaded, 10 per request, as wikitext through the API.
4. Every cached page is parsed to *claims* (one source's statement about one game), claims about the same two clubs one
   day apart are paired into games, and the games are cross-checked (below).
5. The games are compared with DS1's `core.game` and a per-league summary is printed.

**Requests per run** (measured 2026-10-12): the very first run, every page new, was 17 Wikipedia API requests (3 revision
checks + 14 content batches of 10 pages); a run when nothing changed is 3 API requests plus 1 conditional nflverse request
(answered 304, no body). A busy day, with every club article edited, is 3 + about 14, plus nflverse. One request at a time,
1 s apart, `maxlag=5`, wait for `Retry-After` on 429/5xx. User-Agent
`spx-stats/1.0 (https://spxn.com; john@spxis.com)` (`SPX_WIKI_UA` overrides).

## Sources, licences and credits

| Source | Used for | Licence / credit |
|---|---|---|
| English Wikipedia, MediaWiki API | main source: club-season articles' game logs, MLB postseason page | CC BY-SA 4.0; authors are each article's history; `meta.source` code `wikipedia`. Pages and revision ids are kept as provenance. |
| nflverse `games.csv` (nflverse-data release `schedules`) | NFL second check | CC BY 4.0; credit "NFL data from nflverse (github.com/nflverse), CC BY 4.0." (`meta.source` code `nflverse`) |
| balldontlie free tier | NBA second check, only when `BALLDONTLIE_API_KEY` is set | **untested** (no key). Its terms must be read before stage 2 enables it. Nobody signs up for it here. |

**Never fetched, not even to test:** NHL API (`api-web.nhle.com`, `api.nhle.com`), MLB statsapi, NBA.com and
`cdn.nba.com`, NFL.com, `cfl.ca` / `api.cfl.ca`, Yahoo, ESPN, Sports Reference sites, newspapers and TV sites. Articles
link to some of those (the "Recap" columns); the parsers drop external links and nothing follows them. The NHL API stays
as the historic source behind `db/build/145_nhl_from_nhlapi.sql`; the daily job must not use it.

## Where each league's scores are (checked 2026-10-12)

The league season articles (`2026 NFL season`, `2026–27 NHL season`, `2026 CFL season`, `2026 Major League Baseball
season`, `2026–27 NBA season`) carry **no game-by-game scores**: they transclude standings and bracket templates only.
The scores are in the clubs' season articles, so every game appears in two articles, which is the free consistency check.

| League | Pages | Layout read | Postseason |
|---|---|---|---|
| NHL | 32 `2026–27 <club> season` | game log tables, two layouts (Visitor/Score/Home, and Opponent with `@`) | the same tables under a Playoffs heading: **untested** (starts April 2027) |
| NBA | 30 `2026–27 <club> season` | `{{NBA game log}}` tables, read by `scripts/nba/parse.py` | same reader; **untested** for 2026-27 beyond preseason (season starts about Oct 20) |
| MLB | 30 `2026 <club> season` (`2026 Athletics season` for Sacramento) + `2026 Major League Baseball postseason` | `{{Game log}}` tables (result by row colour, `W`/`L` in the cell, or the bold pitcher); the postseason page's `{{MLB Playoff Summary}}` blocks | read now, from both the club articles and the postseason page |
| NFL | 32 `2026 <club> season` | "Schedule and results" tables (`at` = away, `W 36–31`) | **not read yet**: the clubs' postseason tables will need a look when the playoffs start |
| CFL | 9 `2026 <club> season` | schedule tables, read by `scripts/wikipedia/parse.py`; future rows become scheduled games | **not read yet**: the old reader skips post-season tables (starts Oct 31) and the Grey Cup |

Freshness (edit timestamps of sample articles): the clubs' articles are edited **once a day after games** for the NHL (6-10 h
after the last puck, overnight US time), within about **1 h** of the final whistle for the NFL (the Bills article was edited
3.5 h after kickoff and again within the hour), within hours for the MLB postseason, and the day after for the CFL. A run at
10:00 ET sees yesterday's games in most club articles; one club's article being a day behind is normal, which is why a game is
`single-source` until the second club's article catches up and why stage 3 re-checks the last 7 days.

## Cross-check classes

`confirmed` two or more sources give the same score (each club's article is one source; nflverse and, for the MLB
postseason, the league page are others) · `single` one source only · `disputed` sources differ: the best-ranked source is
kept (nflverse/balldontlie, league page, the home club's article, any other) and every other value is listed. A row whose
own colour contradicts its score (a lost game coloured as won) ranks last. 2026-10-12 found a real one: the Maple Leafs
article had Ottawa 2, Toronto 3 for Oct 3 on a row coloured as a loss, while Ottawa's article has Ottawa 3, Toronto 2.

A game's `source_key` is `wpdaily:<league>:<season>:<phase>:<date>:<home>:<away>:<n>`, and its provenance is the list of
`<page title>@<revision id>` of every claim behind it (`--json`).

## Output summary (dry run)

Per league: new games (final / scheduled), scheduled to final, same result already in DS1, score differences, disputed,
postponed or cancelled, rescheduled, DS1 final games since `--since` that Wikipedia lacks, unreadable rows (an unmatched
team name lands there), and the clubs that have no `core.team_season` for the season (MLB, CFL and NBA 2026 have no
`core.season` row at all in DS1).

## Not done in stage 1 (stages 2 and 3)

**Stage 2 (writes, needs John's go):**
- archive each downloaded page to `legacy_files.raw_archive` (name `wikipedia/<date>/<league>/<file>`) and Dropbox
  (`scripts/archive_raw.py`, `scripts/dropbox_put.py`) *before* parsing for load; the cached files in `raw/` are the input;
- create `core.season` and `core.team_season` for MLB 2026, CFL 2026, NBA 2026-27;
- insert new games, update scheduled to final on games that already exist (NHL, NFL), record `meta.verification`
  (confirmed) and `meta.data_issue` (disputed, with both values), `core.external_id` for the `source_key`;
- read the CFL and NHL/NFL postseason tables; test the NBA path on real 2026-27 games; test balldontlie if a key exists.

**Stage 3 (schedule):** runs once a day in Docker on DS1 (about 10:00 ET, re-checking the last 7 days for late edits),
DS15 as watchdog. A push to **production** needs John's OK: changing a game from scheduled to final is an UPDATE, and
AGENTS.md says production loads are insert-only.

## Files

`run.py` command line and reporting · `wikiapi.py` the API client and state file · `teams.py` club lists and name matching ·
`parsers.py` wikitext to claims (NHL, MLB, NFL here; CFL and NBA wrap the older readers) · `games.py` pairing and cross-check ·
`compare.py` DS1 comparison (SELECTs only) · `ds1.sh` read-only DS1 `psql` · `selftest.py` + `fixtures/` the tests.
Fixtures are excerpts of Wikipedia articles (CC BY-SA 4.0); the first line of each names the article and revision, and the
authors are in the article history.

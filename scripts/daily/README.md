# Daily scores (stage 1: dry run, stage 2: report to DS1)

Once a day, collect the game scores of the NHL, NBA, MLB, NFL and CFL from sources whose terms allow automated
collection and reuse, without asking any league. **Stage 1** fetches, parses, cross-checks and compares with DS1 (`--dry-run`,
read-only). **Stage 2** (`--rehearse`, `--apply`) writes to **DS1 only**: the raw pages to the archive, the parsed rows to
`legacy_wikipedia_daily`, the seasons and team seasons to `core`, and the games' results through the database function
`ingest.report_results` ([The ingest API](#the-ingest-api-migrations-044-and-046)), never directly into `core.game`. **Production** is never written by this job;
results reach it through a data release ([Production](#production-data-releases)). It runs once a day in
Docker on the NAS ([Stage 3](#stage-3-the-docker-job-on-the-nas), `daily/README.md`). Ticket: "Daily scores from Wikipedia and allowed sources".

## Run it

    scripts/daily/run.py --self-test                 # parsers and pairing on saved excerpts (fixtures/), no network
    scripts/daily/run.py --dry-run                   # fetch what changed, parse, cross-check, compare with DS1 (read-only)
    scripts/daily/run.py --dry-run --since 2026-10-09 --league nhl,nfl -v
    scripts/daily/run.py --dry-run --offline         # parse the cached pages only, no request at all
    scripts/daily/run.py --dry-run --no-balldontlie  # Wikipedia and nflverse only (no NBA, MLB or NFL second check)
    scripts/daily/run.py --dry-run --no-ds1 --json /tmp/games.json
    scripts/daily/run.py --rehearse                  # stage 2 as a rehearsal: one DS1 transaction that ends in ROLLBACK, with the checks
    scripts/daily/run.py --apply                     # stage 2: the same rehearsal first, then archive + load + report, commit (DS1 only)
    scripts/daily/run.py --apply --league nhl,nfl    # only some leagues (the others' rows are left alone)

Python 3 stdlib only, plus `psql`. DS1 is reached through `ds1.sh`: it finds the host with `ds1_host` from
`scripts/mac/spx-checks.sh` (hosts-file name `ds1`, home LAN, then the VPN: the addresses are in the private host mapping) and reads the password from the keychain
item `spx-stats-db DS1 55440` inside its own process; nothing is printed. On Linux (the Docker job) there is no keychain: `ds1.sh` uses
`PGHOST`, `PGPASSWORD` (and `PGPORT` 55440, `PGUSER` postgres, `PGDATABASE` spx_stats) from the environment. On a Mac the `PG*` variables
are ignored on purpose, so a stray `PGHOST` for another database can never be written to. Club names come from DS1 (current franchise
names) and are cached in `rosters.json` next to the state file, so a run still parses when DS1 is away (`--no-ds1`).

State and downloads live outside the repo, in `~/Library/Caches/spx-stats-daily/` (`SPX_DAILY_CACHE`, or `--state` and
`--raw-dir`; in the Docker job `/data/cache`): `state.json` holds the revision id of every page as last downloaded and the nflverse ETag; `raw/<league>/`
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
| balldontlie, free tier (`api.balldontlie.io/v1`, `/mlb/v1`, `/nfl/v1`, docs `docs.balldontlie.io`) | the NBA schedule and scores (second check beside the clubs' articles, and the only source for a season the articles do not carry yet); the MLB and NFL games as an independent second check | John's free account (teams and games endpoints only; never a paid endpoint, never a trial). Its terms allow storing and publishing the data (John, 2026-10-12). Credit "NBA schedule and scores from balldontlie.io". Provenance: `balldontlie@<sha256 of the archived file>`. See [balldontlie](#balldontlie-the-nba-schedule) and [MLB and NFL](#balldontlie-mlb-and-nfl-the-second-check) |

**Never fetched, not even to test:** NHL API (`api-web.nhle.com`, `api.nhle.com`), MLB statsapi, NBA.com and
`cdn.nba.com`, NFL.com, `cfl.ca` / `api.cfl.ca`, Yahoo, ESPN, Sports Reference sites, newspapers and TV sites. Articles
link to some of those (the "Recap" columns); the parsers drop external links and nothing follows them. The NHL API stays
as the historic source behind `db/build/145_nhl_from_nhlapi.sql` (data already loaded stays, credited "NHL"); no new request
may go to any NHL endpoint (AGENTS.md section 3), and the fetch scripts refuse to run. The daily job must not use it.

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

`confirmed` two or more sources give the same score (each club's article is one source; nflverse, balldontlie and, for the MLB
postseason, the league page are others) · `single` one source only · `resolved` sources differ but nflverse agrees with one club's page, so that score holds · `disputed` sources differ: the best-ranked source is
kept (nflverse/balldontlie, league page, the home club's article, any other) and every other value is listed; stage 2 applies nothing from it. A row whose
own colour contradicts its score (a lost game coloured as won) ranks last. 2026-10-12 found a real one: the Maple Leafs
article had Ottawa 2, Toronto 3 for Oct 3 on a row coloured as a loss, while Ottawa's article has Ottawa 3, Toronto 2.

A game's `source_key` is `wpdaily:<league>:<season>:<phase>:<date>:<home>:<away>:<n>`, and its provenance is the list of
`<page title>@<revision id>` of every claim behind it (`--json`).

## Output summary (dry run)

Per league: new games (final / scheduled), scheduled to final, same result already in DS1, score differences, disputed,
postponed or cancelled, rescheduled, DS1 final games since `--since` that Wikipedia lacks, unreadable rows (an unmatched
team name lands there), and the clubs that have no `core.team_season` for the season (MLB, CFL and NBA 2026 have no
`core.season` row at all in DS1).

## balldontlie: the NBA schedule

`balldontlie.py`. Only the free tier's endpoints (`/v1/games`; `/v1/teams` was read once to build the fixed table). 5 requests a minute, so
requests are 13 s apart; a 429 waits at least 30 s (up to 3 retries); a 401/403 stops the source for the run with one line, the rest of the
run goes on without it.

- **Key.** On a Mac the keychain item `spx-stats balldontlie api key`, read inside the process (`security find-generic-password -s ... -w`);
  anywhere else `BALLDONTLIE_API_KEY` from the environment (the NAS: `$NAS1_DOCKER_DIR/spx-daily-scores/daily.env`, see `daily/daily.env.example`).
  It is never printed or logged. **No key: the source is skipped with one line** (`balldontlie skipped (no key ...)`) and nothing is requested.
- **What is read.** The first run of a season, and one a week, reads the whole season (`seasons[]=<start year>`, 100 a page: 13 requests for 1,200
  games, about 3 minutes). The other days read only the games from `--since` to tomorrow (a result can only be there): 0 or 1 request
  before the season starts, 1 or 2 during it. Games merge by id into `balldontlie/games-<season>.json` in the raw cache (each game object as
  returned).
- **Teams.** A fixed table in the script (balldontlie team id -> abbreviation and the club's full name in DS1, ids 1 to 30), checked by the
  self-test against a roster built from it. A game with a team outside the table (balldontlie also lists defunct clubs and foreign clubs that
  play NBA preseason games) is skipped without a word; a table club the DS1 roster lacks is an unreadable row, never a guess.
- **Statuses.** `status_state` `final` is a final (scores by team, `period` above 4 is overtime), `postponed` is postponed, anything else
  (scheduled, being played) is scheduled with no score. `postseason` is a playoff game.
- **Archive and provenance.** The season file (without fetch times, so it changes only when a game does) goes to `legacy_files.raw_archive`
  as `balldontlie/<day>/games-<season>.<sha12>.json` and one `legacy_wikipedia_daily.page` row (`source = 'balldontlie'`, title `games.json`,
  revision = the sha256; migration 055 lets the table hold it). Claims, staging games and observations name it `balldontlie@<sha256>`.
- **Cross-check.** balldontlie ranks first, like nflverse. It plus one club article agreeing is `confirmed`; alone it is `single` (the flag
  text is still the Wikipedia one); balldontlie agreeing with one article against another is `resolved`. New games come from the bulk step
  (`ingest.replay(true, true)`), because no other source holds the season; scheduled games of a season another source holds are not made.
- **Dry run:** `scripts/daily/run.py --dry-run --league nba -v` (reads the key, does the whole-season read once). `--rehearse --league nba` proves the
  DS1 side and rolls back.

## balldontlie: MLB and NFL, the second check

`bdlsports.py` (the NBA stays in `balldontlie.py`; the key, the request function and the clock are shared). Same free account and key, only the
free endpoints (`/mlb/v1/games`, `/nfl/v1/games`, and `/teams` once to build the tables). **The 5 requests a minute are the account's, not a
sport's:** every request waits 13 s after the previous one of any sport (`balldontlie.pace()`), so NBA, MLB and NFL together stay at
4.6 a minute at most, and a 429 waits at least 30 s. A run never has the sports read in parallel.

- **Requests per run** (measured 2026-10-13). A day: **1 request each for MLB and NFL** (plus the NBA's 1 or 2), 2 for a busy MLB week
  (more than 100 games in the window). The first run of a season, and one a week, reads the whole season: MLB **26 requests** (regular season
  25 pages of 100, then the postseason, about 5.5 minutes), NFL **3**. No `start_date` or `end_date` exists for MLB and NFL (a request with them
  is answered with the oldest games, unfiltered); `dates[]` takes any number of days, so the window `--since` to tomorrow is one request listing
  its days. A `--since` more than 14 days back reads the whole season. MLB spring training games are neither kept nor archived.
- **How far back the free tier goes** (one real call each, 2026-10-13): **MLB regular season from 2001** (the first game is 2001-04-01; 2000 has
  spring training only) and **MLB postseason from 2002**; **NFL from the 2002 season** (first game 2002-09-06, its playoffs from 2003-01-04). The
  daily job reads the season each league is in, so this matters for a backfill, not for the daily run.
- **Days.** A game's `date` is its UTC start. The club's local date is that minus 9 hours (a game starts between noon ET and 10:30 pm PT), so
  a 00:20Z start is the day before. A game with no time yet (NFL status `TBD`, an MLB playoff game not placed) is stored at 04:00 or 05:00Z
  and keeps its UTC day. The pairing tolerates a day either way, and a different day is noted (`date differs by source`).
- **Teams.** Fixed tables in `bdlsports.py` (balldontlie id -> abbreviation and the club's full name in DS1: MLB ids 1 to 30, NFL ids 1 and 3
  to 33), checked by the self-test against the saved responses `fixtures/balldontlie_mlb_teams.json` and `balldontlie_nfl_teams.json`
  (verbatim `/teams`). balldontlie's "Oakland Athletics" (20) is DS1's Sacramento Athletics. A game with a club id of -1 (the All-Star Game, a
  playoff pairing not decided yet) is skipped without a word; an id outside the table, a club the DS1 roster lacks, a final without both
  scores and a state we do not read (`abandoned`, `unknown`) are unreadable rows, never guessed.
- **Statuses.** `status_state` `final` is a final; `scheduled`, `in_progress` and `delayed` are scheduled (no score until it ends);
  `postponed`, `canceled` and `suspended` are what they say. MLB overtime is more than 9 innings (`period`, `ot_n` the extra innings); NFL
  overtime is a score in `home_team_ot` or `visitor_team_ot`, or `Final/OT`. A playoff game is `postseason`. balldontlie does not number
  doubleheaders: two games of the same pair on one local day are numbered by start time. It dates a suspended game by its start, where an
  article may date the resumed part (2026-06-16/17, Braves and Giants), so the games sit a day apart for the two sources.
- **Archive and provenance.** As the NBA's: the season file (without fetch times, so it changes only when a game does) goes to
  `legacy_files.raw_archive` as `balldontlie/<day>/games-<league>-<season>.<sha12>.json` and one `legacy_wikipedia_daily.page` row
  (`source = 'balldontlie'`, title `games-mlb.json` or `games-nfl.json`, revision = the sha256). Observations name it `balldontlie@<sha256>`.
- **Cross-check.** balldontlie ranks first, like nflverse. **balldontlie plus one club article agreeing is `confirmed`** (so is balldontlie plus
  nflverse for the NFL); alone it is `single`; balldontlie agreeing with one article against another is `resolved`, and that score is what
  stage 2 reports. **Disagreements are held and logged as before:** balldontlie against the only article that has the game, or against
  nflverse, is `disputed`, applies nothing and leaves the `meta.data_issue`. A final in DS1 is never changed (the state machine above): a
  different balldontlie score is `rejected` and flagged.
- **First look (2026-10-13, MLB 2026 and NFL 2026).** MLB: 2,497 balldontlie games read, 2,453 final games confirmed (two or more sources agree), 1 single-source,
  and all 2,454 finals DS1 holds carry the same score; the 4 games the articles disagreed on (2026-05-18, 07-08, 08-12, 08-14, all
  held out of DS1 until now) are `resolved` by balldontlie. NFL: 272 games, all 79 finals confirmed (balldontlie, nflverse and the articles agree),
  no difference in DS1, and the 193 scheduled games agree with nflverse on the day.
- **Dry run:** `scripts/daily/run.py --dry-run --league mlb,nfl -v`. `--no-balldontlie` skips all three sports (offline runs, tests).

The pairing in `games.py` (`pair_claims`) works in three passes since balldontlie joined (it sorts before the Wikipedia sources and used
to start clusters in the wrong order): the same day without a clash, then same-day clusters that share no source, then a day apart. A
rain-out and its make-up the next day stay two games; a game two sources date a day apart is still one. NHL, CFL, NBA and NFL results are
identical to the old pairing on the current data.

## Stage 2: what `--apply` writes to DS1, and where

History is bulk (loads and `db/build` steps). **Daily scores are reported through one narrow database API**, `ingest.report_results`
(below): the job calls a function, it does not write `core.game`. Order, each step stopping the run when it fails (`apply.py`):

1. **Rehearsal** (always first; `--rehearse` stops here): one transaction that applies migrations `043`, `044` and `046` (rerunnable), the archive
   rows, the raw load, `db/build/152` (seasons and team seasons only), **reports every game as an observation, as the restricted role
   `ingest_writer`**, runs the bulk step for the games the report found no row for (`ingest.replay(true, true)`), reports everything a
   second time (it must add no row and change no game), prints before/after counts and the checks (`snapshot.sql`, `checks.sql`), and
   **rolls back**. Any failed check or error means nothing was written.
2. **Archive** first: the exact wikitext of every page revision DS1 does not hold yet goes to `legacy_files.raw_archive`
   (name `wikipedia/<day>/<league>/<title>.r<revision>.wikitext`; the nflverse file is stored as the season's rows, verbatim, under the
   file's header line: `nflverse/<day>/games-<season>.<sha12>.csv`, because the whole file is 2 MB and changes daily). Committed on its own.
3. **Load + report** in one transaction, the same SQL as the rehearsal, `COMMIT` only if every check passed: `legacy_wikipedia_daily.page`
   (one row per revision, pointing at its archive row), `.claim` (every game row of every revision as parsed), `.game` (the paired,
   cross-checked games of the league-season, replaced whole; kept as the evidence behind the observations), `db/build/152`, the report.
4. `select api.refresh();`.
5. On the Mac, `scripts/mac/spx-raw-export.sh` copies the new archive rows to Dropbox (`Backups/spx-stats/raw/`); it never overwrites.

Re-running is a no-op: a revision DS1 holds is neither archived nor loaded again, an observation already reported adds no row (it bumps
`last_seen` and `seen_count`), and the state machine changes nothing it has already done. The output shows the second report of the same
transaction: 0 new observations, 0 games changed.

**One league, club or game never stops the others.** `--apply` runs stage 2 once for each league (`write_leagues` in `run.py`): its own rehearsal,
its own checks (`checks.sql` looks only at that league, psql variable `:league`) and its own commit. In order of scope:
- **League:** a league that cannot be read, has pages missing, or fails a check is `failed` or `skipped` in the heartbeat; the other leagues are
  saved. The run then exits 1, so the next try of the day (and the next day) runs that league again; leagues already saved change nothing.
- **Season:** the job writes the one season each league is in, so a season is the league's scope.
- **Club:** the club-count check (`clubcheck.sql`) compares each club's article rows with the club's games in core; games core holds that the club's own
  article does not list yet (the later games of an MLB series, balldontlie-only games) are explained, held and single-source games are explained. A club
  still unexplained (one, or up to 3 percent of the clubs) passes the check with a WARN and is **left out of that league's load**: the rehearsal runs
  again without its games and the load saves everything else. One `meta.data_issue` row per club and season (`entity_kind = 'club'`, key
  `<league>:<season>:<club>`, issue starting `daily: left out`) records it and is closed by the first run that no longer leaves the club out. More than
  3 percent of the clubs unexplained is a mapping fault: the check fails and that league is blocked.
- **Game:** a page that cannot be parsed costs that page; a game that cannot be staged is left out and named in `league_results.<league>.games_unreadable`.
- **Corrupt data still blocks:** every other check (a final game changed, a game of another source deleted, a second report that is not a no-op, the
  raw archive's hashes, ...) failing blocks its league and writes nothing for it.

The heartbeat `summary.league_results` has, per league, `outcome` (`ok`, `warning` when something was left out, `skipped`, `failed`), `reason`,
`games_skipped`, `clubs_skipped`, `games_changed`; `summary.games_skipped` is the total. The Cleveland Guardians case (2026-10-16 to 18, 174 article rows
against 181 games in core): the 7 extra games were games core holds that the club's article does not list yet (most likely the ALCS games from the
league page); they are now counted as off-page games, and any club still unexplained is left out alone. Tests: `run.py --self-test`
(one club, one league, all leagues pass, all fail, one game, one page) and `bash scripts/daily/test/clubcheck-test.sh` (scratch Postgres in Docker).

## The ingest API (migrations 044 and 046)

Decision (John, 2026-10-12): history stays bulk; **daily and later live scores go through a narrow API**, not through table privileges
with exceptions. The function exists on DS1 only; production gets the results through data releases.

**What it is.** The `ingest` schema (not exposed through PostgREST; production exposes only `api`), the append-only table
`ingest.game_observation`, and **one** function the writer may call:
`ingest.report_results(observations jsonb) returns jsonb`, `SECURITY DEFINER` with `search_path = pg_catalog, pg_temp` and every other
object schema-qualified. It (1) appends the observations, (2) matches each to a `core.game` and applies the state machine, (3) writes
`meta.verification` and `meta.data_issue`, (4) returns a summary: counts (`new`, `repeat`, `outcomes`) and `changed`, the list of games
that changed with `league`, `season`, `game_date`, `from`/`to` status, the score and a reason (for logs now, page refresh later).
It does not run caller SQL, so AGENTS.md's "never build a public endpoint that runs SQL" is not touched; and it is not public.

**Who may call it.** `ingest_writer` (migration 046), `NOLOGIN` here. It can execute that one function and nothing else: no table
privilege, no other function, no create anywhere; `PUBLIC`, `anon`, `authenticated` and `service_role` are revoked; row level security is on
for the table. `db/tests/run-ingest-tests.sh` proves it by running as the role. The daily job connects as the DS1 admin user and does `set local role ingest_writer` for the report, so it needs no login for the role;
`ingest-writer-login.sh ds1` can still give it one (not used by the job).

**Observation shape** (one element of the array; a key is the column of the same name). `game_ref` is the writer's own key for the game
(`wpdaily:<league>:<season>:<phase>:<date>:<home>:<away>:<n>`); `league`, `season`, `phase` (regular|playoffs), `round`, `game_date`,
`game_no` (0, or 1 for the second game of a doubleheader); **`home_key`, `away_key`: franchise keys**; `home_name`, `away_name` (display);
`home_known`, `neutral`; `status` (scheduled|in_progress|final|postponed|suspended|cancelled); `home_score`, `away_score` (a final needs
both), `overtime`, `shootout`, `ot_periods`; `starts_at` (the scheduled start in UTC when a source recorded a clock, otherwise null;
never inferred from the date); `verdict` (the Python cross-check: none|single|confirmed|resolved|disputed; a final needs
one); `source` (the best-ranked source) and `ref` (its `page@revision` / file sha256); the evidence: `agree` (references of every source
that gave the reported score), `conflict` (`[{ref, source, home_score, away_score}]`), `dissent` (the same as sentences), `notes`.
Parsing, pairing and the cross-check stay in Python (`scripts/daily`); the database owns the invariants and the transitions.

**The game key, and why it is stable across DS1 and production.** A franchise is `'<meta.source code>:<core.franchise.source_key>'`
(`spx_database:26` is the Maple Leafs). It is provenance from the data the franchise was built from, immutable, present in every copy of
`core.franchise` and `meta.source`, and it survives `build_core.sh` (which recreates `franchise_id`s). Database ids appear nowhere in an
observation. A game is found, in order, by (0) its `source_key` or external id equal to `game_ref`, (1) the same two clubs the same day,
(2) a day either side, (3) a day either side with the sides reversed, (4) up to 3 days apart for a game with no result, (5) a postponed game
waiting for a new date. A game another observation chain already holds is not available (and from pass 2 on neither is a game another
chain names by its day), so a May 10 report cannot take the May 11 game when a May 11 report exists. The same matching
(`ingest.match_game`) serves the live path and the replay.

**State machine** (`core.game.status` down the side; the reported status across):

| now \ reported | scheduled | in_progress | final | postponed | suspended | cancelled |
|---|---|---|---|---|---|---|
| scheduled | same (date move if >1 day) | start, live score | final | postponed | suspended | cancelled |
| in_progress | ignored (behind) | live score | final | postponed | suspended | cancelled |
| postponed | scheduled on the new date, `original_date` set | in_progress | final on the new date | same | ignored | cancelled |
| suspended | ignored | resume | final | ignored | same | cancelled |
| cancelled | rejected | rejected | rejected | rejected | rejected | same |
| final / forfeit | ignored (behind) | ignored | **terminal**: same score `confirmed`, other score `rejected` + dispute | ignored | ignored | ignored |

- **Final is terminal.** A different final score is never written: the game keeps its result, `meta.verification` becomes `disputed`
  (and stays disputed until a person clears it) and `meta.data_issue` says `Existing result a-b, reported c-d` /
  `Kept existing; needs a third source`. The same score from another source is `confirmed`.
- A final needs both scores (a table check) and a verdict. **`disputed` between the sources never finalizes anything**: outcome `held`, a
  data issue `Wikipedia sources disagree on ...` (closed when the sources agree). `single` finals are allowed and flagged exactly as in
  stage 2 (`Only one club's Wikipedia page lists this result`, or `No result in DS1` / `Filled from Wikipedia: h-a (one club page so far)`
  on a game of another source), and the flag closes when a confirmed report of the same score arrives.
- SPX-era and other sources' finals are never changed, only confirmed or disputed. A game of another source with no result is filled in
  place (its source stays), as in stage 2.
- **No game in core** (a new game, a new season, a club key nobody has): the observation is stored with outcome `unmatched` and a data
  issue (`No game in core for ...`, `Postponed per Wikipedia: ...`, `Club not matched to a franchise ...`); nothing is made. A scheduled
  game with no row is stored without an issue. The same observation reported again is applied once the game exists. New games and
  seasons stay on the bulk path: `db/build/152` makes seasons and team seasons, `ingest.replay(true, true)` (owner only) makes the games
  the report found no row for, by the rules stage 2 used (finals, cancelled and live games always; scheduled games only in a season no
  other source holds; never a postponed, suspended or sources-disagree game).
- Changed from stage 2, on purpose: a result is never taken back or followed after it is final (stage 2 re-followed Wikipedia for its own
  fills and took back a fill whose sources later disagreed). A scheduled game of an owned season whose date moves with no postponement
  row appears as a second game, and the old one stays scheduled until a person removes it (stage 2 deleted it).

**Outcomes** (`ingest.game_observation.outcome`): `applied` (a game changed), `unchanged`, `confirmed`, `rejected` (illegal or disputed),
`held`, `ignored` (the report is behind the game), `unmatched`.

**Idempotency.** `content_hash` covers everything except references and display names. A report whose hash equals the game's latest
observation adds no row; it bumps `last_seen` and `seen_count`. Only a changed state adds a row, so A, B, A is three rows and the log
replays in order. Calls are serialized by an advisory lock; a bad element rolls the whole call back (`22023`, naming the index).

**Growth.** One row per change of a game's reported state, measured on DS1: 532 bytes of row, 857 with its indexes and free space. A game costs 2 to 3 rows over its
life (scheduled, final, a single -> confirmed upgrade). Daily: about 4,200 rows the first time (3.5 MB), then about 60 a day over the five
leagues (25,000 a year, 21 MB). A 5-minute live poll adds a row per score change while a game is on: about 700 a day in season (250,000
a year, 175 MB) unless superseded `in_progress` rows are pruned (delete an `in_progress` row when a later row exists for the same
`game_ref`, after 30 days); nothing prunes them yet. Indexes: `(game_ref, observation_id desc)` for a game's latest state,
`(league, season, game_date)` for matching, a partial index on the unmatched. A repeat sighting rewrites its row (`last_seen`, `seen_count`);
no indexed column changes, and the table has `fillfactor = 80`, so these are in-page (HOT) updates and do not bloat it.

**Rebuild.** `scripts/build_core.sh` deletes and rebuilds `core`. `db/build/152` (seasons, team seasons) then
`db/build/153_replay_daily_observations.sql` replays the whole log through the same function (it also makes the games the bulk step would
have added, in observation order), so every result, verification and flag comes back. `ingest` itself is not part of the build.
`bash db/tests/run-rebuild-proof.sh` proves it on the real data: it deletes the daily games, verifications and external ids, puts the
filled games of other sources back as they were, runs 152 and 153, and compares one signature of everything the daily source owns or
touched, before and after (rolled back).

**Tests.** `bash db/tests/run-ingest-tests.sh` (SQL, one rolled-back transaction on DS1, applies 044 and 046 first): every transition, the
terminal final, idempotency, unmatched, invalid input, the replay equivalence, and the privilege model as `ingest_writer`.

## Production: data releases

DS1 is the only place data is written, and production changes only through approved data releases (AGENTS.md section 8, item 5;
`scripts/release/README.md`). Daily results on DS1 (`core.game`, `meta.verification`, `meta.data_issue`, and any new seasons, team seasons
and external ids) are ordinary tables in a release. `ingest` is not in the release schemas (core, meta, ref) and never leaves DS1. The
ingest function is **not** installed on production, there is no production login for `ingest_writer`, and the earlier "phase B"
(reporting to production directly) is dropped.

- **Release hook.** After a `--apply` that committed, `release_hook.prepare_release()` prepares a release for the release tables the run wrote
  to (`pg_stat_xact_all_tables` inside the load transaction: rows inserted, updated or deleted in core, meta, ref), so a run that changed
  no game prepares nothing. It never approves, and always passes `--by daily-job` (before `prepare`). Two routes:
  - **Auto.** Every table the run wrote to is `core.game`, `meta.verification` or `meta.data_issue`, and `DAILY_RELEASE_KIND` is set:
    `python3 -I scripts/release/release.py --by daily-job prepare --kind daily_scores --title "Daily scores <date>" --notes ...`, with no
    `--tables` (the kind's default is those three). The runner approves it after a hold if it only changes status, score, overtime/shootout and the scheduled start
    on games not final in production (`scripts/release/README.md` has the exact lane).
  - **Review.** Anything else (a new season, `core.season`, `core.team_season`, `core.external_id`, `meta.source` ..., or no
    `DAILY_RELEASE_KIND`): a normal publish release, `prepare --title "Daily scores <date> (needs review)" --tables <all the tables the run
    wrote to>`. It waits for John at `/admin/data`.
  - **Switches.** **Off** unless `DAILY_PREPARE_RELEASE=1`. It also needs `SUPABASE_ACCESS_TOKEN`, `PGHOST` (or `SPX_DS1_HOST`) and
    `PGPASSWORD` in the environment; when any is missing it logs `left to the nightly drift check` and carries on.
  - **Outcomes** (log and heartbeat `summary.release`, with the `route`): `prepared`; `nothing` (release.py exit 1 saying "nothing to release":
    DS1 and production already match); `refused` (any other exit 1); `failed`; `skipped`; `off`. None of them fails the daily run (DS1 is
    already committed).
- **Release kind.** Set `DAILY_RELEASE_KIND=daily_scores` to enable the auto route; unset, every run takes the review route.
- **Until then** the nightly drift check on the release runner proposes the difference and John approves it at `/admin/data`.

## Known gaps (stage 2)

- The NFL article parser skips rows without a date yet (flexible-scheduling weeks 16-18 of some clubs), so the per-club row counts
  differ from the 17 games; every NFL game is in the staging because nflverse supplies all 272. The row-count check leaves the NFL out.
- NBA 2026-27: the clubs' articles hold no regular-season schedule yet (one stray Dallas row is unreadable), so balldontlie supplies it:
  1,200 regular-season games, 80 per club (checked 2026-10-12; a full season is 82 per club, so 30 games are missing there: probably the
  NBA Cup ones, not looked into). The articles' rows replace nothing: where an article lists a game too, the two agree (confirmed) or are
  disputed like any two sources. Rehearsed on DS1 (rolled back), not yet applied.
- Live (in_progress) states and the second game of a doubleheader as a live game are accepted by the function but nothing reports them yet;
  the daily job reports scheduled, final, postponed, cancelled and suspended games.
- MLB and NFL from balldontlie: no neutral-site flag (the NFL Super Bowl and international games use balldontlie's home side; a different home side from nflverse is noted), no NFL playoff round names (nflverse supplies them), MLB doubleheader numbers are by start time. The free tier holds MLB from 2001 and the NFL from 2002.
- The CFL postseason and the NHL/NFL playoffs are not read yet (they start Oct 31, April, January). balldontlie's playoff games (`postseason`) are read but untested until April.
- Wikipedia revisions between two runs are not archived: only the revision used is. The raw cache is overwritten by the next fetch.

## Stage 3: the Docker job on the NAS

`daily/` (Dockerfile, `entry.sh`, `docker-compose.yml`, `daily.env.example`, `README.md` with the click-by-click setup) is a container
modelled on `runner/`: the public repo fetched from GitHub at each run, `PGPASSWORD` and the other `PG*` names from an env file kept on
the NAS, host networking, state on a mounted `data/` folder. It sleeps until 10:00 America/Toronto and runs `run.py --apply` once (the run
re-checks the last 7 days itself), retrying a failed day after an hour up to 3 times. $0, no cloud. Nothing is fetched or polled between runs.

**Heartbeat.** Each `--apply` writes a row to `ingest.daily_run` (migration 048, DS1 only): started, finished, outcome
(`running`/`ok`/`failed`), host, code version and a `summary` (counts, tables written, per-league outcome, release hook result, requests, error). No row for a day
means the job did not start; a row left `running` means it died. The release side can show it on `/admin/data` later; no UI here.
It is not `meta.load_run`: `meta` is a release schema (the row would count as drift) and that table's `kind` has no `daily`.

## Files

`run.py` command line and reporting · `balldontlie.py` the NBA source (key, the shared request clock, throttled reads, cache, claims, the fixed team table) · `bdlsports.py` the MLB and NFL source (fixed tables, window and whole-season reads, claims) · `wikiapi.py` the API client and state file · `teams.py` club lists and name matching ·
`parsers.py` wikitext to claims (NHL, MLB, NFL here; CFL and NBA wrap the older readers) · `games.py` pairing and cross-check ·
`compare.py` DS1 comparison (SELECTs only) · `ds1.sh` DS1 `psql` (host and password found inside) · `apply.py` stage 2: rehearsal,
archive, load, report, refresh (`observation()` builds what `ingest.report_results` takes) · `snapshot.sql` + `checks.sql` the report and the
checks · `selftest.py` + `fixtures/` the tests · `heartbeat.py` the `ingest.daily_run` row · `release_hook.py` `prepare_release()` ·
`ingest-writer-login.sh` an optional DS1 login for the role · `../../daily/` the Docker job · `db/migrations/048_ingest_daily_run.sql` the heartbeat table ·
`db/migrations/043_legacy_wikipedia_daily.sql` the staging schema · `055_daily_balldontlie.sql` lets it hold balldontlie's file · `044_ingest_report_results.sql` the API · `046_ingest_writer_role.sql` the
role · `114_game_starts_at.sql` the recorded start, applied last so a run does not put 044's functions back · `db/build/152_games_from_wikipedia_daily.sql` seasons and team seasons · `db/build/153_replay_daily_observations.sql` the replay ·
`db/tests/` (`run-ingest-tests.sh`, `run-rebuild-proof.sh`).
Fixtures are excerpts of Wikipedia articles (CC BY-SA 4.0); the first line of each names the article and revision, and the
authors are in the article history.

## Source registry, terms gate and shared limiter (migration 137)

`sources.py` is the registry (tier green / grey / red, terms notes, evidence link, spacing, cache time, hosts); `python3 -I scripts/daily/sources.py [--json]` prints it.
Red is never fetched, grey only by the once-a-day job and manual requests (never a default, `daily_cap` is stored but not yet enforced), green may be a default.
`limiter.py` is the one token bucket, queue and 60 s cache for every request (Wikipedia, balldontlie, nflverse go through it): state in DS1 `ingest.source_limiter` / `ingest.source_cache`
for `--apply` and `--rehearse` runs (the scheduled job and the runner are separate containers), a lock file for read-only runs. `--force-fetch` skips the cache and still queues.
Tests: `python3 -I scripts/daily/limiter_test.py [--ds1 "<scratch dsn>"]` (also part of `run.py --self-test`).

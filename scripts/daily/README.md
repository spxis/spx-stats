# Daily scores (stage 1: dry run, stage 2: report to DS1)

Once a day, collect the game scores of the NHL, NBA, MLB, NFL and CFL from sources whose terms allow automated
collection and reuse, without asking any league. **Stage 1** fetches, parses, cross-checks and compares with DS1 (`--dry-run`,
read-only). **Stage 2** (`--rehearse`, `--apply`) writes to **DS1 only**: the raw pages to the archive, the parsed rows to
`legacy_wikipedia_daily`, the seasons and team seasons to `core`, and the games' results through the database function
`ingest.report_results` ([The ingest API](#the-ingest-api-migrations-044-and-046)), never directly into `core.game`. **Production is stage 3** and needs John's separate OK:
nothing here knows production. Ticket: "Daily scores from Wikipedia and allowed sources".

## Run it

    scripts/daily/run.py --self-test                 # parsers and pairing on saved excerpts (fixtures/), no network
    scripts/daily/run.py --dry-run                   # fetch what changed, parse, cross-check, compare with DS1 (read-only)
    scripts/daily/run.py --dry-run --since 2026-10-09 --league nhl,nfl -v
    scripts/daily/run.py --dry-run --offline         # parse the cached pages only, no request at all
    scripts/daily/run.py --dry-run --no-ds1 --json /tmp/games.json
    scripts/daily/run.py --rehearse                  # stage 2 as a rehearsal: one DS1 transaction that ends in ROLLBACK, with the checks
    scripts/daily/run.py --apply                     # stage 2: the same rehearsal first, then archive + load + report, commit (DS1 only)
    scripts/daily/run.py --apply --league nhl,nfl    # only some leagues (the others' rows are left alone)

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

## The ingest API (migrations 044 and 046)

Decision (John, 2026-10-12): history stays bulk; **daily and later live scores go through a narrow API**, not through table privileges
with exceptions. Production gets the same function from the same migration file, so both databases apply identical rules.

**What it is.** The `ingest` schema (not exposed through PostgREST; production exposes only `api`), the append-only table
`ingest.game_observation`, and **one** function the writer may call:
`ingest.report_results(observations jsonb) returns jsonb`, `SECURITY DEFINER` with `search_path = pg_catalog, pg_temp` and every other
object schema-qualified. It (1) appends the observations, (2) matches each to a `core.game` and applies the state machine, (3) writes
`meta.verification` and `meta.data_issue`, (4) returns a summary: counts (`new`, `repeat`, `outcomes`) and `changed`, the list of games
that changed with `league`, `season`, `game_date`, `from`/`to` status, the score and a reason (for logs now, page refresh later).
It does not run caller SQL, so AGENTS.md's "never build a public endpoint that runs SQL" is not touched; and it is not public.

**Who may call it.** `ingest_writer` (migration 046), `NOLOGIN` here. It can execute that one function and nothing else: no table
privilege, no other function, no create anywhere; `PUBLIC`, `anon`, `authenticated` and `service_role` are revoked; row level security is on
for the table. `db/tests/run-ingest-tests.sh` proves it by running as the role. Giving it a login and a password is phase B
(`ingest-writer-login.sh`, not run).

**Observation shape** (one element of the array; a key is the column of the same name). `game_ref` is the writer's own key for the game
(`wpdaily:<league>:<season>:<phase>:<date>:<home>:<away>:<n>`); `league`, `season`, `phase` (regular|playoffs), `round`, `game_date`,
`game_no` (0, or 1 for the second game of a doubleheader); **`home_key`, `away_key`: franchise keys**; `home_name`, `away_name` (display);
`home_known`, `neutral`; `status` (scheduled|in_progress|final|postponed|suspended|cancelled); `home_score`, `away_score` (a final needs
both), `overtime`, `shootout`, `ot_periods`; `verdict` (the Python cross-check: none|single|confirmed|resolved|disputed; a final needs
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

## Phase B (production): prepared, not run

Main now says production changes only through approved data releases (AGENTS.md section 8, item 5; `scripts/release/README.md`). Daily
results on DS1 (`core.game`, `meta.verification`, `meta.data_issue`) are ordinary tables in a release, so **the default path to
production needs nothing from this work**. `ingest` is not in the release schemas (core, meta, ref) and never leaves DS1 that way. What
follows is the second option, the same function on production, prepared so John can choose; it adds a write path beside releases and is
**not to be run without his decision**.

1. John's decision, then apply `db/migrations/044_ingest_report_results.sql` and `046_ingest_writer_role.sql` to production (as `ds1_step`
   style migrations or the Supabase MCP `apply_migration`, in that order; both are rerunnable). Check `ingest` is not in the project's
   exposed schemas (it must stay `api` only).
2. A release brings the games, seasons, franchises and the `meta.source` row `wikipedia_daily` to production first, so the franchise keys
   and games exist there before anything is reported.
3. `bash scripts/daily/ingest-writer-login.sh production` (needs `SUPABASE_ACCESS_TOKEN` and `SPX_PROD_POOLER_HOST`): makes a 40-character
   password with openssl, `alter role ingest_writer login password ... connection limit 3` through the Management API, stores it in the Mac
   keychain item `spx-stats ingest_writer production`, proves it by calling `report_results('[]')` and by failing a `select` on `core.game`.
   The password is never printed, written to a file or logged. `... ds1` does the same for DS1 (keychain item `spx-stats ingest_writer DS1 55440`).
4. DS1 (stage 3, the job in Docker): the password sits in a root-only file `/volume1/docker/spx-stats-daily/secrets/ingest_writer.pw`
   (mode 0600, mounted read-only as a Docker secret and read into `PGPASSWORD` by the entrypoint); the header of the script has the one
   command that copies it there from the keychain without showing it.
5. Point `run.py` at production: a `--target production` that reports only (`report.sql` with a connection as `ingest_writer`, no archive,
   no staging load, no `152`); games the report finds no row for need a release first, then `select ingest.replay(true, true)` as the owner.
   Not written yet.

## Known gaps (stage 2)

- The NFL article parser skips rows without a date yet (flexible-scheduling weeks 16-18 of some clubs), so the per-club row counts
  differ from the 17 games; every NFL game is in the staging because nflverse supplies all 272. The row-count check leaves the NFL out.
- NBA 2026-27: the clubs' articles hold no regular-season schedule yet (one stray Dallas row is unreadable), so the step creates the season
  and the 30 team seasons and no games. Re-run `--apply` when the schedule is published; the NBA path with real games is **untested**.
- Live (in_progress) states and the second game of a doubleheader as a live game are accepted by the function but nothing reports them yet;
  the daily job reports scheduled, final, postponed, cancelled and suspended games.
- The CFL postseason and the NHL/NFL playoffs are not read yet (they start Oct 31, April, January); balldontlie is not enabled (no key).
- Wikipedia revisions between two runs are not archived: only the revision used is. The raw cache is overwritten by the next fetch.

## Stage 3 (not built)

Runs once a day in Docker on DS1 (about 10:00 ET, re-checking the last 7 days for late edits), DS15 as watchdog. **Production** gets the
results like any other data, in a release of the tables DS1 changed (AGENTS.md section 8). Calling the same function on production is
phase B of the ingest API (above), a second write path that needs John's decision.

## Files

`run.py` command line and reporting · `wikiapi.py` the API client and state file · `teams.py` club lists and name matching ·
`parsers.py` wikitext to claims (NHL, MLB, NFL here; CFL and NBA wrap the older readers) · `games.py` pairing and cross-check ·
`compare.py` DS1 comparison (SELECTs only) · `ds1.sh` DS1 `psql` (host and password found inside) · `apply.py` stage 2: rehearsal,
archive, load, report, refresh (`observation()` builds what `ingest.report_results` takes) · `snapshot.sql` + `checks.sql` the report and the
checks · `selftest.py` + `fixtures/` the tests · `ingest-writer-login.sh` phase B, not run ·
`db/migrations/043_legacy_wikipedia_daily.sql` the staging schema · `044_ingest_report_results.sql` the API · `046_ingest_writer_role.sql` the
role · `db/build/152_games_from_wikipedia_daily.sql` seasons and team seasons · `db/build/153_replay_daily_observations.sql` the replay ·
`db/tests/` (`run-ingest-tests.sh`, `run-rebuild-proof.sh`).
Fixtures are excerpts of Wikipedia articles (CC BY-SA 4.0); the first line of each names the article and revision, and the
authors are in the article history.

# Storage plan B: keeping production under 500 MB

Written 2026-10-13 for John to decide. Design only: nothing here has been applied. Sizes are from read-only queries on
production (Supabase project `njpvfrceahkvnrduerkk`) and DS1 on 2026-10-13. Provider limits were read from the providers' own pages
on the same day (URLs inline).

## Short answer

- **Do not add a second database now.** Three small steps free about **119 MB** (production 413 MB to about 294 MB), cost nothing,
  and cannot slow a page or use Vercel CPU. With the soccer and MLS data still to be released (about +38 MB) production sits near
  **332 MB**, which is **168 MB under the 500 MB plan** and 118 MB under the release tool's own 450 MB stop.
- A second store is worth building only when bulky event-level data arrives (play-by-play, shots, pitch data). Then use **Turso**
  for it, and keep everything the site already joins on in Postgres. The second Supabase project is not available (section 2b).

## 1. What production holds today

Database 413.2 MB (`pg_database_size`); the four app schemas (`core`, `meta`, `ref`, `api`) hold 397.2 MB of it.
Release stop in `release.py`: 450 MB (`RELEASE_MAX_DB_MB`). Plan limit: 500 MB.

| Object | Rows | Total MB | Heap | Indexes | What the site uses it for |
|---|---|---|---|---|---|
| `core.player_season_stat` | 267,459 | 107.8 | 89.1 | 18.7 | Player pages and career totals (`api.person_stats`, `person_career_totals`, `season_roster`, `people`); feeds the matviews `player_index`, `stat_reference`, `country_franchise`. MLB and NHL only. |
| `core.game` | 356,604 (DS1: 386,976) | 103.3 | 54.2 | 49.0 | Every schedule, score, H2H, series and venue page (`api.games`, 16 call sites; `game_venue`, `venue_game`, `season_summary`, `games_by_source`, `provenance`, `totals`) |
| `core.external_id` | 472,996 | 91.7 | 34.6 | 57.0 | **Nothing.** No `api` view, no production function and no `web/src` file reads it. It is a DS1 build and ingest aid. 437,456 of its rows are games. |
| `meta.verification` | 55,068 | 13.5 | 5.6 | 7.9 | "Verified by" on `api.games` and `soccer_matches`; `quality`, `provenance`, `totals` matviews |
| `api.player_index` (matview) | 30,507 | 12.5 | 3.5 | 8.9 | `/players` list, search, `/api/players` |
| `core.betting_line` | 50,127 | 12.4 | 8.5 | 3.8 | Only input to the tiny `api.totals` matview (under 0.2 MB), read once in `lib/data.ts` |
| `core.batted_ball_player` | 57,880 | 12.3 | 10.3 | 1.9 | No site reader yet (data ahead of the pages) |
| `core.person` | 31,578 | 6.4 | 5.4 | 0.9 | Player names, birth data |
| 8 more tables (`person_career`, `roster_stint`, `data_issue`, `pass_run_player`, and the matviews `stat_reference`, `standing_index`, `team_season_index`, `country_team_season`) | | 2 to 3 each | | | |
| About 60 small tables, views' base data | | 37 together | | | teams, seasons, awards, standings, venues, cities |

The three biggest objects are **302.7 MB, 73 percent**; `external_id` is the only one the site never reads.
Soccer tables exist on production but are empty (0.05 MB): the World Cup and MLS data are still on DS1.

Waste found by `pg_stat_user_indexes` (counters since 2026-10-02, so 11 days, including a busy week of builds):

| Index | MB | Scans | Verdict |
|---|---|---|---|
| `core.game (source_id, source_key)` unique | 25.8 | 7 | DS1 upsert key. `release.py` upserts on the primary key, so production never needs it. |
| `meta.verification (entity_kind, entity_id, field, source_id)` unique | 3.7 | 1 | same |
| `core.betting_line (source_id, source_key)` unique | 2.7 | 1 | same |
| `api.player_index_awards_idx` | 1.1 | 0 | too small to bother |

Everything else hot is hot: `player_season_stat_pkey` 3.2 M scans, `verification_entity_idx` 7.4 M, `game_season_date_idx` 569 k.
Do not touch those.

Not waste, but note: `player_season_stat.stats` is `jsonb` holding 17 small integers per row (batting) with the key names repeated
in every row: 69.3 MB as jsonb against 46.4 MB for the bare values, so the keys cost about 23 MB, and the row overhead around them
a lot more (see step 4).

### Growth expected

| Source | Estimate on production |
|---|---|
| Daily scores (all five leagues) | Updates existing game rows in place; a new season adds about 7,000 games, about 2.5 MB a year. Negligible. |
| Soccer: World Cup (`docs/soccer.md`) | about 35 MB estimated, of which about 9 MB is `external_id` (not needed, step 2) |
| Soccer: MLS (`docs/mls.md`) | about 12 MB |
| NBA, NFL, CFL player seasons (not loaded yet) | at the MLB/NHL rate of about 400 bytes a row with indexes: about 100,000 rows, **+40 to 60 MB** |
| Batted-ball and pass/run detail by game or play | the one thing that could be hundreds of MB; this is where a second store pays |
| Future leagues | about 100 to 150 MB each at today's density if they carry player stats |

## 2. Options, with limits as read on 2026-10-13

### (a) Turso (libSQL / SQLite)

- Free plan ([turso.tech/pricing](https://turso.tech/pricing)): $0, 100 databases, **5 GB storage**, **500 M rows read a month**, 10 M rows
  written, 1 day point-in-time restore. The page does not mention sleeping. Turso's CLI and scale-to-zero docs still describe free
  databases sleeping after 10 days of inactivity and needing an "unarchive", while its 2025 plan announcement says databases stay
  responsive; I could not confirm which is current. Treat inactivity as a risk to test, not a fact.
- A row read counts every row scanned, so an unindexed query over 100,000 rows costs 100,000 of the 500 M
  ([docs.turso.tech/help/usage-and-billing](https://docs.turso.tech/help/usage-and-billing), written about paid plans). At hourly ISR
  this is far inside the cap if every query uses an index.
- Read path: plain HTTPS `POST https://<db>-<org>.turso.io/v2/pipeline` with a bearer token and JSON statements
  ([docs.turso.tech/sdk/http/quickstart](https://docs.turso.tech/sdk/http/quickstart)). It is an ordinary `fetch` from a Next server
  component, so there is no driver and no connection pool. Whether Next's data cache and `revalidateTag` keep a POST answer the way
  they keep today's GETs must be tested before committing to this (I could not check it; `web/node_modules` is not installed here).
- Against what we use in Postgres: no matviews, no `jsonb` operators (SQLite `json_extract` exists), no arrays, no `tsrange`, no
  enums, no `pg_trgm`, no PostgREST. Every view the site reads from it would be a SQL string in the site, and its Zod schema would
  have to cope with SQLite types (integers as strings in the pipeline answer). Fine for flat event tables; poor for anything
  joined to `core.game` or `core.person`, because a join cannot cross databases.
- The project's existing Turso database `spx-stats` (one `health` table, unused) is already on this free plan.

### (b) A second Supabase Free project: not available

- Free plan ([supabase.com/pricing](https://supabase.com/pricing)): **2 active projects**, 500 MB each, unlimited API requests, projects
  **pause after 1 week without activity**. The limit is **per account across all organizations**, and a paused project does not count
  ([supabase.com/docs/guides/platform/billing-on-supabase](https://supabase.com/docs/guides/platform/billing-on-supabase)).
- John's account has exactly two active projects now (`wazadb` and `spx-stats`; `list_projects` 2026-10-13). A third needs wazadb
  paused or deleted, or a paid plan. A paid project breaks the $0 to $10 a month budget, so this option needs a decision about WazaDB
  first and is otherwise closed.
- If wazadb were freed it would be the best fit technically: same PostgREST, same Zod code, same `api` view pattern, and the release
  tool already speaks to it. Cost: a second `SUPABASE_ACCESS_TOKEN` target, a second keep-alive (the runner's 60 s poll keeps one
  project awake, see memory "Supabase free polling cost"), and a second 500 MB with its own 450 MB stop.

### (c) Static files on Vercel or GitHub, read at build or ISR time

- Vercel Hobby ([vercel.com/docs/limits](https://vercel.com/docs/limits), last updated 2026-09-16): CLI upload of source files
  **100 MB**, 15,000 source files, 100 deployments a day. Deployment storage is 10 GB for the whole account, shared with every
  project, and every kept deployment carries its own copy of the files. The rule of keeping the live deployment plus one previous
  makes 2 copies of any asset set.
- GitHub ([about large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)):
  100 MiB hard limit per file in a repo, under 1 GB per repo recommended. Release assets have no stated bandwidth cap; the page says
  nothing about hotlinking or `raw.githubusercontent.com`, so I would not build a dependency on either.
- The real problem is freshness, not size: a static file changes only with a deploy, but data arrives by release plus
  `revalidateTag`, not by deploy. It works only for **frozen data** (the SPX archive 1997 to 2013, finished seasons' bulk tables).
  The repo is public, so a regenerated data file also grows git history every time it is committed.
- Gains: zero database size, zero function CPU (build time only). Costs: a new generation step, a new reader for each page, and a
  rule that the file is never edited by hand. Only worth it for read-only bulk with no joins.

### (d) Trimming (the cheapest, and it covers most of the gap)

| Trim | MB freed | Effort | Notes |
|---|---|---|---|
| `core.external_id` game rows off production (in flight by another agent) | about 80 | in progress | Rows deleted do **not** shrink the files; see the warning below |
| rest of `core.external_id` (35,500 person, franchise and award rows) | about 7, and avoids about 9 of soccer | small | Same publish filter, whole table excluded |
| drop the 3 unused unique indexes | 32.2 | small | production-only migration |
| publish `api.totals`' result instead of `betting_line` | about 12 | medium | compute the aggregate on DS1, release a small table |
| `player_season_stat.stats` jsonb to typed columns | about 45 | large | see step 4 |
| `meta.verification` history off production | up to 8 | medium | **No.** It is joined by `api.games` on every game list; 7.4 M scans. Not worth it. |

## 3. Recommendation

Smallest change that buys the most: trim, in this order. Each step is separately safe and stops being needed the moment you have
the headroom you want.

| Step | Do | MB freed | Production after | Page speed | Vercel CPU | Effort |
|---|---|---|---|---|---|---|
| 0 | external_id game rows off production (in flight) **and rewrite the table**, see warning | 80 | about 333 | none | none | in progress |
| 1 | Exclude the whole `core.external_id` from the publish filter (and from `compare.py`/drift) | 7 (+9 avoided) | about 326 | none | none | 0.5 day |
| 2 | Drop three unused unique indexes on production only | 32 | about 294 | none or better (smaller cache footprint, faster releases) | none | 0.5 day |
| | Release soccer and MLS (planned, not a trim) | +38 added | about 332 | none | none | planned |
| 3 | `api.totals` fed from a DS1-computed table, `betting_line` not published | 12 | about 320 | none | none | 1 day |
| 4 | Typed stat columns for `player_season_stat`, only when NBA/NFL/CFL stats are loaded | 45 | about 275 | slightly better (fewer pages read per player) | none | 3 to 5 days |
| 5 | Second store (Turso) for play-by-play or shot data, only when it exists | 0 now | | none for existing pages | one `fetch` per ISR page, same as now | 3 to 5 days |

**Warning on step 0.** In Postgres a `DELETE` leaves the file the same size; autovacuum only makes the space reusable. The Supabase
database size, and so the 500 MB check, counts the file. After the other agent's removal, `core.external_id` needs a rewrite
(`VACUUM FULL core.external_id`, which takes an exclusive lock for a few seconds, harmless because nothing reads the table, or
`TRUNCATE` and reload of the kept rows). Without that the 80 MB is not freed. `pg_total_relation_size` before and after is the
check. This applies to any later bulk delete.

**Step 2 detail.** `alter table core.game drop constraint game_source_id_source_key_key;` and the same for `meta.verification`
(`verification_entity_kind_entity_id_field_source_id_key`) and `core.betting_line` (`betting_line_source_id_source_key_key`).
`release.py` upserts with `on conflict (<primary key>)` (lines 645 to 647) and the site never looks games up by source key
(the 7 scans in 11 days are unexplained; re-check before dropping). Dropping a constraint is not an add-only migration, so it needs John's
go (memory "Add-only migrations pre-approved"). Keep the constraints on DS1, where `ingest.report_results` relies on them
(`on conflict (source_id, source_key)`). Put the migration under `db/migrations/` with a header saying "production only, never run on
DS1", and have `db/checks` ignore these constraint names. Rollback: `create unique index concurrently` on production, which takes
about a minute for `game`.

**Index audit, 2026-10-14** (counters 2026-10-02 18:01 to 2026-10-14 00:07 UTC, 11.2 days; Supabase performance advisors and
`pg_stat_statements` read the same evening, nothing changed). Migration `084_drop_unused_indexes.sql` (production only, not applied):

| | MB |
|---|---|
| Freed: the three unique constraints of step 2 (`core.game` 25.8, `meta.verification` 3.7, `core.betting_line` 2.7) | 32.2 |
| Added: no new index qualified (the slow PostgREST queries are view shapes, not missing indexes: `api.standings` and `api.team_seasons` aggregate every game through `core.standing_from_games` on each call, and `api.person_career_totals` materialises all 267,459 stat rows in a CTE; the existing `game_home_idx`, `game_away_idx` and `player_season_stat_pkey` serve them once the key is pushed into the view) | 0 |
| Net | -32.2 |

Everything else is hot or too new to judge. Indexes of tables created or released since 2026-10-12 (venues, spring training, future
venues, batted ball, pass/run, soccer) show no scans only because they are new; the advisor's "unused index" list is mostly those and
is not a drop list. DS1 keeps the three constraints (the ingest function and loaders use them).

**Headroom after steps 0 to 2 plus soccer and MLS:** about 332 MB, 168 MB under the plan, 118 MB under the release stop. At today's
growth (about 8 MB a year for scores and new seasons) that is more than ten years. The real consumers of that headroom are:
NBA, NFL and CFL player stats (40 to 60 MB, fits), then one more league with player stats (fits after step 4), then event-level
data (does not fit; step 5).

**Why no second database today.**
- The data the site reads together (games, teams, people, stats, verification) cannot be split without losing joins: PostgREST
  views join `game`, `season`, `team_season` and `verification` in one request. Splitting would turn one fast query into several
  fetches or into duplicated tables.
- The release tool is the expensive part of a second target. `release.py` compares by key, loads staging tables, applies one `DO`
  block per release, verifies by bucket fingerprint, snapshots for rollback, and the nightly drift check does the same. All of that is
  Postgres. A Turso target needs its own adapter: statements in a pipeline with a transaction baton, `insert or replace` for upserts,
  its own fingerprints, a second token in the runner, a second drift comparison and a second preview section at `/admin/data`.
  That is 3 to 5 days of work and a second place for a failed release to hide. Not worth it for 120 MB that trimming gets for free.

**What a second store would hold, when it is time (step 5).** Only data that is keyed by one game or one player and never joined in
SQL: play-by-play, shot and pitch events, soccer event detail beyond goals and cards. The page fetches one game's rows by index at ISR
time and passes them through Zod like any other view. Turso fits (5 GB, 500 M reads a month against an hourly ISR load of a few
thousand rows). Check the two open points first: that Next caches the POST answer and `revalidateTag` reaches it, and that a free
database does not sleep.
If neither holds, the fallback is frozen data as static JSON (option c) for finished seasons only.

## 4. Risks and open questions

- **External_id removal in flight** (another agent, per-table publish filter): step 1 should extend that same filter, not add a second
  mechanism. `compare.py` and the drift check must then skip the table too, or they will propose to put it back every night.
  I did not touch `release.py` or `compare.py`.
- **Instance size.** Supabase Free runs on a small shared instance. A database that fits less in memory reads more from disk; trimming
  helps page speed on cache misses (hourly ISR, so mostly build time), it cannot hurt.
- **Counters are 11 days old** (reset 2026-10-02). The three indexes were scanned 7, 1 and 1 times; re-read
  `pg_stat_user_indexes` once more just before dropping, in case a monthly job such as `edrdg:monthly` or a data release path uses them.
- **Step 4 is invasive.** It changes `player_season_stat`'s shape, so it touches DS1 build steps, five `api` views, three matviews,
  the release's table list and the Zod schemas. Only do it if player-stats growth makes it necessary. Matview rebuilds lock reads
  (memory "Matview rebuilds block production"); build `_new` and swap.
- **DS1 itself is bloated**: `core.game` is 384 MB there for the same rows that take 103 MB on production (heap 269 MB against 54 MB).
  Not a production problem, but a `VACUUM FULL` on DS1 will make dumps and the cloud restore faster. Separate ticket.
- **Wazadb pause (option b)** is John's call about another project; I assume it stays active.
- **Pending decisions for John:** (1) go for the production-only index drops in step 2, (2) whether to prefer Turso or a freed Supabase
  slot for event data later, (3) whether NBA/NFL/CFL player stats are next, because that triggers step 4.

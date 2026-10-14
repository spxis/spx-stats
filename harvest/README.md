# Harvest job (Synology NAS)

A container that sits next to DS1 and reads **English Wikipedia** (CC BY-SA 4.0) and **Wikidata** (CC0) all day, one request at a time, for the
history DS1 does not have yet. It writes to **DS1 only**: the raw answers into `legacy_files.raw_archive` (the Mac export script copies them to
Dropbox), and what it could read from them into `legacy_wikipedia_harvest.*` and `legacy_wikidata_harvest.*`. It builds **no `core` rows**: that is
the job of `db/build` steps ([below](#what-reads-the-tables-and-what-is-missing)). It never touches production. $0, no cloud.

Ticket: "scrape Wikipedia and Wikidata for all historic season data; DS1 should be doing this 24/7" (John, 2026-10-14). Code: `scripts/harvest/`.

## The rule it follows: gaps first

John, 2026-10-14: "first be sure to scrape the data that we don't have."

1. **Pass 1 (always).** The planner measures DS1 itself, every 6 hours, and queues only what DS1 holds nothing for:
   team seasons with no `core.roster_stint` rows, team seasons with no `core.team_season_stat` rows, seasons with no `core.award_winner` rows, draft years
   with no `core.draft_pick` rows, people with a Wikidata id and no birth date, birth place, birth country or position. Nothing is a hand list: when a gap
   fills (a build step reads what the job harvested) the next planner run stops asking for it.
2. **Order inside the gaps** (`scripts/harvest/tiers.py`): NBA rosters, NFL, CFL, then NHL and MLB rosters, then team statistics / awards / drafts
   (NBA, CFL, NFL, NHL, MLB), then bios; the newest season first within a league.
3. **Pass 2 (only when no gap job is left queued or running).** Re-reads of what DS1 has, at low priority (below every gap job): a page of the current
   season is checked every 2 days, an older one every 120 days. A check asks only for the page's revision id (50 titles per request); the page is
   downloaded again only when the id changed.

## Start it (one command, from the Mac, in the repo checkout)

Apply the migration first (the coordinator does this; rerunnable): `bash scripts/mac/ds1-apply.sh db/migrations/095_harvest_queue.sql`.

    cd ~/Projects/spx-stats && git pull -q && tar -C harvest -cf - Dockerfile entry.sh docker-compose.yml harvest.env.example | ssh ds1 'rm -rf /tmp/spx-harvest && mkdir -p /tmp/spx-harvest && tar -C /tmp/spx-harvest -xf -' && security find-generic-password -s 'spx-stats-db DS1 55440' -w | ssh ds1 'set -e; IFS= read -r T; D=/volume2/docker/spx-harvest; sudo mkdir -p $D/data; sudo cp /tmp/spx-harvest/Dockerfile /tmp/spx-harvest/entry.sh /tmp/spx-harvest/docker-compose.yml $D/; { grep -v "^PGPASSWORD=" /tmp/spx-harvest/harvest.env.example; printf "PGPASSWORD=%s\n" "$T"; } | sudo tee $D/harvest.env >/dev/null; sudo chmod 600 $D/harvest.env; unset T; rm -rf /tmp/spx-harvest; echo "password lines: $(sudo grep -c "^PGPASSWORD=." $D/harvest.env)"; cd $D && sudo /usr/local/bin/docker compose up -d --build 2>&1 | tail -4; sleep 45; sudo /usr/local/bin/docker logs --tail 25 spx-harvest'

It prints `password lines: 1`, the build result, and the first log lines: `harvest: started (run N, wikipedia 1.0s/request ...)`, then
`planner: {"pass": 1, "gap_targets": ...}` and the first requests. The password is never printed. To change a setting later, edit
`/volume2/docker/spx-harvest/harvest.env` the way `daily/README.md` shows and run the `docker compose up -d --build` part again.

Look at it any time, from the Mac (read-only, no container needed) or from the NAS:

    python3 -I scripts/harvest/status.py                  # queue depth, gap targets left by kind and league, today's requests and bytes, last error, growth
    python3 -I scripts/harvest/status.py --measure        # also the gaps in core right now (a few seconds more)
    ssh ds1 'sudo /usr/local/bin/docker exec spx-harvest bash /usr/local/bin/entry.sh status'
    ssh ds1 'sudo /usr/local/bin/docker logs --tail 40 spx-harvest'

The same numbers from SQL: `select ingest.harvest_progress();`. The heartbeat is `ingest.harvest_run` (one row per worker process, about one an hour;
`last_beat_at` moves every 30 seconds; a row stuck on `running` with an old `last_beat_at` is a worker that died). The per-request log is `ingest.harvest_fetch`.

## What it reads

| Job kind | Target | Source (one request each) | Fills |
|---|---|---|---|
| `wp_team_season` | a team-season article, e.g. `2023–24 Boston Celtics season` | `action=query&prop=revisions` (10 titles per request, wikitext) | `page`, `roster_row` (NBA `{{player2}}`, NFL `{{NFL final roster}}`, CFL `{{CFL player}}`, or a roster wikitable), `infobox_field`, `wikitable_row` for standings / statistics / leaders sections |
| `wp_league_season` | `2023–24 NBA season`, `2023 NFL season`, `2023 Major League Baseball season` ... | same | `page`, `infobox_field` (champion, MVP, leaders ...), `wikitable_row` for every table (awards, standings written as tables, playoffs) |
| `wp_draft` | `2023 NBA draft`, `2023 NFL draft`, `1970 NHL amateur draft` ... | same | `page`, `draft_pick` (wikitables and `{{NFLDraft-row}}`; the round from the section when the table has none) |
| `wd_team_members` | a team's Q-number (`legacy_team_brand.team`) | one SPARQL query (`P54` with `P580` / `P582` and their precision), ordered so an unchanged answer has the same sha256 | `team_member`; every member not in `core` is queued as a bio |
| `wd_person` | a person's Q-number | `wbgetentities`, 25 per request, pruned before it is archived | `item`, `claim` for P569 birth, P570 death, P19 birth place, P27 citizenship, P413 position, P2048 height, P2067 mass |
| `wd_label` | a place or country Q-number named by a bio | `wbgetentities`, 25 per request | `item`, `claim` for P297 / P298 (ISO codes), P17, P31 |

Every page object / answer is archived first, **byte for byte what the parser read**: `harvest/wikipedia/<day>/<title>@<revision>.json` (the API's page object
with the wikitext), `harvest/wikidata/<day>/team-<Q>-<sha>.json` (the SPARQL answer), `harvest/wikidata/<day>/people-<first Q>-<n>-<sha>.json` (pruned
items). A page revision already loaded is never fetched or parsed twice. When a parser improves, `entry.sh reparse` re-reads the archived pages (no
request) and replaces their rows. Nothing about ethnicity, religion, health, sex or gender, family or politics is requested into a table or archived:
`wbgetentities` returns every statement of an item, so the answer is pruned to the properties above before it is stored (tested).

## Being polite

- User-Agent `spx-stats-harvest/1.0 (https://spxn.com; archive of sports history, non-commercial)`; no personal contact detail.
- **One request at a time.** `HARVEST_WP_GAP` 1.0 s (cannot be set lower) between en.wikipedia.org requests, `HARVEST_WD_GAP` 1.0 s for wikidata.org,
  `HARVEST_WDQS_GAP` 5 s between SPARQL queries. `maxlag=5` on en.wikipedia.org and `maxlag=60` on www.wikidata.org (its `maxlag` includes the lag of the SPARQL query service, which read 26.7 s on
  2026-10-14 while the entity API was healthy; with 5 every read would be refused for hours); a `maxlag` answer, a 429 or a 5xx is waited out for at least the
  `Retry-After` it names (doubling from 5 s to 5 minutes otherwise); four tries, then the job is queued again with a longer wait (5, 10, 20, 40, 80
  minutes, then a day). A job refused for `maxlag` on every try goes back for 10 minutes and does not count an attempt. A 4xx other than 429 is not retried for a week. Responses are requested gzip-compressed.
- **Stands still for the daily scores job** (`scripts/harvest/pause.py`): inside `HARVEST_PAUSE_WINDOW` (09:50-10:30 America/Toronto), while
  `scripts/release/daily_lock.py`'s lock is held (probed and let go at once, never held), and while `ingest.daily_run` has a `running` row started in the
  last 30 minutes. It checks every 15 seconds and sends nothing while paused.
- The job is capped at half a CPU and 512 MB in `docker-compose.yml`, and its log at 30 MB.

## How big, how many requests

Estimates (not yet measured on DS1; `status.py` shows the real figures from the first hour):

- **First pass, about 3,000 to 3,500 requests**, roughly 1 to 3 hours of wall time: ~8,000 team-season pages at 10 per request (~800), ~450 league
  seasons and ~330 drafts (~80), ~150 team queries at 5 s (~12 minutes), ~50,000 bios at 25 per request (~2,000), plus the place and country labels (~120).
- **Raw bytes of that pass: about 0.8 GB** (team-season pages 50 to 110 KB each, league seasons ~170 KB, drafts ~100 KB, team queries ~150 KB, pruned
  bios ~2.5 KB), the largest write DS1 gets from this job. In `legacy_files.raw_archive` the database compresses `bytea`; with the parsed rows, expect
  about **0.3 to 0.4 GB on DS1**, in the first day or two. The Dropbox copy (`spx-raw-export.sh`) is the raw size.
- **After that, a few MB a day**: current-season pages are checked every 2 days by revision id (a handful of requests of 50 titles), an old page every
  120 days (about 70 titles a day, 2 requests), and a page is downloaded again only when its revision changed. Expect fewer than 100 requests a day.

## What reads the tables, and what is missing

The job fills `legacy_*` only. Today **no `db/build` step reads any of these tables**. What exists and what each gap needs (follow-up tickets):

**Overlap with `scripts/rosters`** (another pipeline, landed 2026-10-14: NBA and CFL club-season articles and Wikidata P54 into `legacy_rosters`, built by `179`; NFL from nflverse). The harvest does not ask again for what that pipeline holds: when `legacy_rosters` exists on DS1 the planner skips the club-season articles listed in `legacy_rosters.wp_article` and the clubs in `legacy_rosters.league_team`, as roster gaps (an article it holds is still queued as a team statistics gap, one tier lower). Its roster-format knowledge is reused: `scripts/rosters/wp_parse.py` reads the player statistics table, and a test checks that both parsers name the same players on the same articles.

| Harvested table | Meant for | Existing step that builds that `core` table today | Gap |
|---|---|---|---|
| `legacy_wikipedia_harvest.roster_row` | `core.roster_stint` | NBA and CFL: `179_players_wikidata.sql` already builds it from `legacy_rosters` (`scripts/rosters`, which reads the same club-season articles and Wikidata by hand on a Mac). NFL: `181_players_nflverse.sql` (nflverse). NHL: `180_players_nhl.sql`. MLB: `181_players_lahman.sql`. | **No step reads `roster_row`.** It is the continuously refreshed copy of what `scripts/rosters` loads once, plus what that pipeline does not read: NFL final rosters with groups and positions, NHL / MLB roster tables, and older NBA seasons that have only a player statistics table (`src = 'stats'`, read through `scripts/rosters/wp_parse.py`). A follow-up step could fill `core.roster_stint` for NHL and MLB seasons that have none, and cross-check the NFL ones |
| `legacy_wikidata_harvest.team_member` | the same stints, by dates, and a cross-check of the page rosters | `179_players_wikidata.sql` (NBA, CFL: `legacy_rosters.claim` P54, found with the league's P118), `182_person_career.sql` (the P54 of people DS1 already holds) | **No step reads `team_member`**; it is per team item (`wd_team_members`), so it covers NFL, NHL and MLB clubs too, and finds players DS1 does not hold yet |
| `legacy_wikipedia_harvest.draft_pick` | `core.draft_pick` | none found that inserts into it | **No step.** The table exists (migration 020) and is empty of a builder |
| `legacy_wikipedia_harvest.infobox_field` (league season: champion, MVP, leaders), `wikitable_row` (awards tables) | `core.award_winner` | `171_award_winners_from_wikipedia.sql` reads `legacy_wikipedia_awards` (the award articles), `170_...` reads Wikidata | **No step** for the season articles' awards tables; they can confirm or fill seasons with none |
| `wikitable_row` (team-season statistics sections) | `core.team_season_stat` | `185_team_season_stat.sql` (NHL API, Lahman, nflverse) | **No step**; also NBA and CFL totals are rarely a wikitable (the article's standings are transcluded templates, see below) |
| `legacy_wikidata_harvest.claim` + `item` | `core.person` birth date, place, country, position, height, weight | `186_person_positions.sql`, `187_nhl_birth_country.sql` (older sources) | **No step** for P569 / P19 / P27 / P413 / P2048 / P2067 of the new people; place and country names are in `item.label`, ISO codes in `claim` P297 / P298 |

Known limits of the parsers (all rows are kept as printed; a hole is a hole):
- **Standings in these articles are transcluded templates** (`{{2023–24 NBA Atlantic standings|team=BOS}}`), not wikitext tables, so they are not in the
  archived page. Reading them needs the templates' own pages (`Template:...`, as `scripts/wikipedia/fetch.py` does for the CFL) or `action=expandtemplates`:
  a follow-up job kind, not built.
- Rosters: NBA, NFL and CFL templates and generic roster wikitables are read; an article that prints its roster any other way gets `parse_status = 'no_data'`
  (visible in `legacy_wikipedia_harvest.page`; `reparse` picks it up when a parser learns the layout). NFL rows carry the position only when the template
  gives one; their group (`Quarterbacks`) is kept in `group_label`.
- Awards written as bullet lists, and prose, are not parsed.

## Operating it

- **Pin the code:** `HARVEST_REF=<commit sha>` in `harvest.env`, then run the `docker compose up -d --build` part again. Without it the job follows `origin/main`,
  fetched at the start of every hourly cycle, so a pushed fix is live within the hour with no rebuild. Changing the `Dockerfile` or `entry.sh` needs a rebuild.
- **Stop:** `ssh ds1 'cd /volume2/docker/spx-harvest && sudo /usr/local/bin/docker compose stop'`. It resumes where it was: every job is settled in DS1 as soon
  as it is read, and a job that was claimed and not settled comes back when its 15-minute lease passes.
- **Ask for something now:** `insert into ingest.harvest_job (kind, target, priority, gap) values ('wp_team_season', '2024–25 Boston Celtics season', 99999, true);` (DS1).
  **Read a failed one again:** `update ingest.harvest_job set state = 'queued', attempts = 0, next_check_at = now() where state = 'failed' and kind = '...';`
- **The pause window** follows the daily job's time: change both together (`HARVEST_PAUSE_WINDOW`, `DAILY_TIME`).
- The repository is public: `harvest.env` (it holds the DS1 password) stays on the NAS and is in `.gitignore`.

## Tests

    bash scripts/harvest/test/scratch.sh up                   # a scratch Postgres in Docker shaped like DS1, port 3170 (this project's block)
    eval "$(bash scripts/harvest/test/scratch.sh env)"
    python3 -I scripts/harvest/test/test_harvest.py           # ~50 tests, about 90 seconds; without the scratch DB the DS1 tests are skipped
    bash scripts/harvest/test/scratch.sh down

No test sends a request anywhere: the APIs are fakes answering from `scripts/harvest/fixtures` (short excerpts of English Wikipedia articles, CC BY-SA 4.0:
the 2023-24 Boston Celtics, 1985-86 Boston Celtics, 2023 Kansas City Chiefs and 2023 Toronto Argonauts season articles, the 2023 NBA, NFL and CFL drafts and
the 2023-24 NBA season; and Wikidata answers, CC0). They cover the queue state machine, the rate limiter and backoff (fake clock), the pause, the parsers,
the planner's order and its adaptation to DS1 counts, revision skipping, a crash and resume, a transient failure, the real advisory lock, status and reparse.

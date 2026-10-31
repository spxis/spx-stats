# Scores: a fast path? A proposal (SPX-583)

Written 2026-10-31 by a subagent of machine1. Nothing was built or run. John decides; the options are at the end.

## The short version

- **Much of it already exists.** Since 2026-10-26 an admin's Refresh puts unofficial scores on the scoreboards through Turso in about 1 to 3 minutes (estimate). No production write is involved.
- **The 10-minute wait is already gone for a click.** Only the scheduled daily run waits 10 minutes.
- **What is still slow is the official path** (DS1, a release, production, the site's pages). Run 19 took about 13 minutes on DS1 alone; the rest is in "Where the time goes".
- **The literal ask** (push scores straight into production) breaks a rule only John can change. I do not think it is needed.
- **Separate bug:** rerunning db/build/145 can undo daily results. See "The rerun bug".

## The seven wants, from the code

| # | Want | State | Where |
|---|---|---|---|
| 1 | A watcher that keeps scores fresh, fetches only what is stale | Partly | Pages are fetched only when their revision changed (3 requests when nothing changed): `scripts/daily/wikiapi.py`, `state.json`. Every request has a 60 s cache and a spacing: `limiter.py`, `sources.py`. **Missing:** anything that runs between the daily 10:00 ET run and a click. `scripts/daily/README.md` says "nothing is fetched or polled between runs", on purpose. |
| 2 | Validate only changed rows; hard stop per game | Partly | One league, club or game never stops the others: `write_leagues` in `run.py`, `clubcheck.sql`, `games_unreadable`. **Missing:** the rehearsal and `checks.sql` still run over the whole league, twice (rehearsal, then load), with all of `db/build/152`. The only time limits are per run (`RELEASE_DAILY_TIMEOUT` 2400 s, `RELEASE_LIVE_TIMEOUT` 900 s), not per game. The live path does report one outcome per game (`live.py`, `items_for`). |
| 3 | No whole-table work; a narrow audited path | Live: yes. Production: **missing** | The live layer writes Turso only, a few rows per click. For production, a scores release compares whole tables 4 times (see below). The policy gate is already narrow (`auto_gate`: scores fields only, games not final, no inserts or deletes, at most 500 games), every request writes a run log entry, and the nightly drift check watches the rows it wrote (`touched`). |
| 4 | A click is the approval; no 10-minute wait | **Done** for clicks | `approve_for_request` in `scripts/release/release.py` approves as `request:<admin>` with no wait, the policy and the Hold switch still apply. `AUTO_HOLD_MINUTES = 10` applies only to the scheduled run (`auto_pass`). The runner looks once a minute (`runner/entry.sh`), so a click waits up to 60 s to start and up to 60 s more to apply. |
| 5 | Revalidate only the pages of changed games | Partly | After a release the runner refreshes tags for the leagues touched (`touched_leagues`, `revalidate_tags`), spread over up to 45 s. The unit is a view plus a league, not a game: `web/src/lib/api/tags.ts`. The live overlay is one Turso read per league and day, shared for 30 s (`web/src/lib/turso/live.ts`). |
| 6 | Progress on the admin page; under 2 minutes | Partly | A live Refresh has a progress row with one outcome per game, read every 15 s while the tab is visible (`web/src/app/api/admin/live/[id]/route.ts`). The slow path shows only queued, running, then one summary at the end. No stage by stage view and no timings. |
| 7 | Keep every safety | **Done** | Sources go through `sources.require` (red never, grey only on request, tiers in `sources.py`). balldontlie stays 13 s apart in the shared limiter. DS1 stays the source of truth. One gap: the scheduled daily job does not yet take the shared lock (`scripts/release/README.md`, "The shared lock"). |

The live overlay appears on the scoreboards only (`Scoreboard.tsx`, `LiveScores.tsx`). Standings, team pages, game pages and records change only after a release.

## Measured or not

- **I could not measure click to live.** The run log is in Turso and needs a token agents do not hold. `api.release_dashboard` and `api.ops_dashboard` need the approval secret. I made no production reads and ran nothing.
- The only real number is from the ticket: run 19, 2026-10-18, about 13 minutes on DS1, then the release.
- Today's DS1 looks healthy: through the preview PostgREST, no NHL 2026-27 game before 2026-10-28 is still `scheduled`; 3 games of 2026-10-29 are, which is normal lag.
- **Fix to get real numbers:** have the runner write start and end times of each stage (pickup, fetch, DS1 load, prepare, apply, refresh, revalidate) into the run log. Small, and it needs no rule change.

## Where the time goes (estimates from the code)

- **Live Refresh:** runner pickup up to 60 s (a long scores job blocks the runner, up to 40 minutes), fetch seconds to a minute (Wikipedia 1 s apart, balldontlie 13 s per request), Turso write, then up to 30 s shared cache and up to 60 s for the browser's next poll. About 1 to 3 minutes for a game or a day.
- **Full scores update:** pickup up to 60 s; `run.py --apply` (about 13 minutes measured); `prepare`: a whole-table compare of `core.game` (about 400,000 rows) on both sides plus a rehearsal on production; approval at once for a click; next runner pass up to 60 s; then the apply re-checks (a second whole-table compare), takes a snapshot, applies, verifies (a third), runs `api.refresh()` on every production materialized view, revalidates (up to 45 s) and rewrites sync status (a fourth). The scheduled run adds the 10-minute wait. Roughly 20 to 30 minutes, which matches the ticket.

## The rerun bug (independent of the rest)

`db/build/145_nhl_from_nhlapi.sql` (lines about 273 to 300) updates the NHL API's own games in place from `legacy_nhlapi`: `status = a.status, home_score = a.home_score ...` whenever they differ. Nothing asks whether the daily job already finalised the game through `ingest.report_results`. The NHL API data stopped growing in mid-October, so games played since then read `scheduled` there and a rerun sets finished games back to `scheduled`. That is the 67 games of 2026-10-18.

- **Still possible:** yes. The step has no guard; its last change (2026-10-21, `a3cace02`) was about identity ids.
- **The repair exists but is separate:** `db/build/153` replays `ingest.game_observation` and restores them. `build_core.sh` runs it after 152. A single step applied alone through `ds1-apply.sh` does not.
- **Nothing catches it.** `ds1-apply.sh` prints only `count(*)` per table, which does not move when status changes. No file in `db/checks` compares status counts. `db/tests/run-rebuild-proof.sh` proves a full rebuild (152 plus 153), not 145 alone. Checks 030 and 041 look at final games only.
- **Same shape, not verified one by one:** 140, 146, 147, 150, 154 and 156 also write game status.
- **To confirm without touching DS1:** restore a dump to a scratch Postgres (port 7740 to 7749), mark one NHL 2026-27 game final through `ingest.report_results`, apply 145, and look at that game's status; then apply 153 and see it return. The detector to add is a check, baseline 0: games where the newest applied observation says `final` but `core.game.status` is not `final`.
- **Suggested fixes** (a ticket for the build-step skill, not this one): add "final is terminal" to the update in 145 and its siblings; run 153 right after any step that writes game status; make `ds1-apply.sh` print status counts per league before and after for files that mention `core.game`; add the check above.

## Options for John

**1. The live layer is enough. Close the production fast path.**
- Reader: scoreboards show an "Unofficial" score in about 1 to 3 minutes after a click. Everything else catches up with the next release.
- Rule changed: none. Risk: official pages lag by up to an hour or more; unofficial and official can disagree for a while.
- Work: none beyond the stage timings (small) and the rerun fix (small to medium). Cost: $0; Turso Free has room (one read per 30 s per league and day).

**2. Option 1, plus show the live score on more pages** (game page, team season page). Rule changed: none.
- Reader: the score looks right wherever it is shown; standings and records stay on release time.
- Risk: more places to say "Unofficial" correctly. Work: medium, site only. Cost: $0.

**3. Make the official path faster inside the rules.** Keep "production changes only through data releases".
- Work: compare only the games in the date window of a scores release (the nightly drift check stays the safety net), skip the second rehearsal, refresh only the views a score changes, show stages on the admin page.
- Target: about 5 to 8 minutes for a click. Not 2: the minute-long runner loop, balldontlie's spacing and `api.refresh()` remain.
- Rule changed: none, but it touches `scripts/release` and `db/checks`, so the runner must be rebuilt first. Risk: a narrower compare could miss drift between nightly checks. Work: large (several days). Cost: $0; less Supabase egress than now.

**4. What the ticket literally asks: a narrow write path into production.**
- A security-definer function on production that sets scores of named games only, called by the runner, logged, with the admin's click as the approval. Production would then move before the release record.
- **Breaks:** AGENTS.md section 8 item 5, "Production changes only through data releases", and the 2026-10-18 rule SPX-586, "production Supabase gets no new reads or writes from this feature". **Only John can change either.**
- Reader: official pages in about 2 to 4 minutes, but standings and matviews stay old until `api.refresh()` runs, so you would still wait for those.
- Risk: production and DS1 disagree if one write fails; the drift check would then propose a fix release. Needs an add-only migration on production. Work: large. Cost: $0, same egress.

## Recommendation

**Option 1 now.** It meets "you ask for a score and see it in minutes" for the place people look for a live score, at $0, with no rule change. Do two small things with it: (a) stage timings in the run log, so the official path's real time is known after a week; (b) the rerun fix, which is a real bug today. Decide on option 3 only if the timings show the official path matters; take option 2 if John wants unofficial scores on game and team pages. I would not take option 4: it needs a rule change for a gain (official pages a few minutes earlier) that matviews and page regeneration partly cancel.

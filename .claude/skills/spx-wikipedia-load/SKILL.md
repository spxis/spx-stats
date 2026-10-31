---
name: spx-wikipedia-load
description: Fetch, archive, load and build a new English Wikipedia source for spx-stats (season articles, finals, all-star pages, rosters, venues). Use when a ticket adds or extends a Wikipedia-based dataset, from the polite fetch to the after-load steps. Not for the daily scores job or any red or grey source.
---

# spx-wikipedia-load: a Wikipedia dataset, end to end

Rules: [AGENTS.md §3](../../../AGENTS.md#3-what-the-project-is), [items 1-7 of docs/data-work.md](../../../docs/data-work.md), [docs/data-sources.md](../../../docs/data-sources.md), [docs/data-flow.md](../../../docs/data-flow.md).
Worked examples: [docs/stanley-cup-finals.md](../../../docs/stanley-cup-finals.md), [docs/all-star-games.md](../../../docs/all-star-games.md),
[docs/soccer-europe.md](../../../docs/soccer-europe.md). Wikipedia text is CC BY-SA 4.0: keep the credit and the share-alike terms.

## Checklist

1. **File and claim the ticket** (`pnpm task add`, `pnpm task claim`), then a fresh worktree from origin/main.
2. **Fetch politely** (one request at a time, never parallel):
   - Reuse `scripts/stanley_cup_final/fetch.py` as the model: MediaWiki API, `rvprop=ids|timestamp|content`, `formatversion=2`,
     an identified User-Agent with contact details, at least 2.5 s between requests (the daily job uses `SPX_WIKI_GAP`, default 1.0 s).
   - Backoff on 429 and 5xx (the script doubles the wait up to 300 s), and skip files already in the folder.
   - The daily job's client (`scripts/daily/wikiapi.py`) also sends `maxlag=5` and honours Retry-After.
   - Write one `.wikitext` per article plus `fetched.json` (title, revision id, timestamp, day fetched). The revision id is the `source_key`.
   - Raw folder: `~/Projects/backups/spx-stats/raw/wikipedia_<topic>/<YYYY-MM-DD>/`. Never in the repository.
3. **Samples for tests.** `scripts/stanley_cup_final/test_parse.py` holds short samples written in the articles' own wikitext shape
   (one per infobox era), so the test runs offline. Write samples the same way: short, no member data.
4. **Parser and tests.** `scripts/<topic>/parse.py <raw dir> <out.sql> [<out.json>]` writes a rerunnable load file and a list of unparsed items.
   Test with `python3 -I scripts/<topic>/test_parse.py`. Count on the samples, then on the full set.
   Dates that cannot be right go to an `unparsed` table, never guessed ([AGENTS.md §3](../../../AGENTS.md#3-what-the-project-is): holes are fine).
5. **Migrations.** `db/migrations/NNN_legacy_wikipedia_<topic>.sql` (schema `legacy_wikipedia_<topic>`, DS1 only, never on production)
   and `NNN_<topic>.sql` for the core and `api` objects (production too). Take the next free number after `git fetch && git rebase origin/main`.
6. **Archive first, then load.** The raw bytes go to DS1's archive before anything is loaded:
   `python3 scripts/archive_raw.py wikipedia-<topic> <raw dir> <YYYY-MM-DD> --sql-out <scratch>/archive.sql`
   then `bash scripts/mac/ds1-apply.sh <scratch>/archive.sql`. Dropbox copy: `scripts/mac/spx-raw-export.sh` (or `scripts/dropbox_put.py`).
7. **Hand-off folder.** Put the raw folder, the generated load file and a `STEPS.txt` in Dropbox
   `/Projects/Handoff/spx-stats/files/<ticket-id>/` (the hand-off's `notes_for_john` names it). The coordinating session runs the DS1 steps.
8. **Build steps** `db/build/NNN_<topic>.sql`: rerunnable, keyed by source keys, ids kept on rerun ([spx-build-step-ids](../spx-build-step-ids/SKILL.md)).
   Disagreements with another source go to `meta.data_issue` as "differs", without the other source's numbers.
   Verification rows where two sources agree.
9. **After-load steps** (item 7 of docs/data-work.md; the load is not done until these ran on DS1): `165` champions, `166` champions without a final,
   `172` champion links, `175` team brands and logos, `178` alignment, `183` season notes, `190`, `191`, `192` indexes, `209` venue games,
   then refresh `api.season_summary`. Then `db/checks/051` to `053` must stay at baseline.
10. **Production** only after DS1 is checked: the migration, then one data release of the tables you name (`release.py prepare`).
    `meta.data_issue` goes to Turso with the other admin tables. Ask John before any delete.
11. **Hand-off** (kind `data`, steps in order with expected row counts, `release_tables`, `pages`, `notes_for_john`). Format in
    [spx-builder](../spx-builder/SKILL.md).

## Pitfalls that broke or nearly broke things

- Never store a value from a red source. A Wikipedia template's link to nhl.com or ESPN is dropped by the parser, never read or kept.
- A load file is generated: fix the parser, regenerate, do not hand-edit SQL.
- Only the coordinating session runs `ds1-apply.sh --force` for a load; a builder writes the command in `STEPS.txt` and stops.
- Re-run the fetch only to refresh a revision; a full re-fetch hits the rate limit. Keep the old `fetched.json` revisions.
- A new season needs its standings templates before step 178 runs (`legacy_alignment`, see `scripts/alignment/`).
- Time the build on scratch at full volume: a statement must finish in about 40 s on production's size.
- Keep the old working copy's counts only as estimates; say "DS1 may differ a little" in the hand-off, as the Stanley Cup hand-off did.

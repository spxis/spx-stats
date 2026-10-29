---
name: spx-build-step-ids
description: Write or change a db/build step in spx-stats so that a rerun keeps every row id, deletes only the rows it owns, and is checked. Use when a step rewrites games, series, venues, franchises, identities, stints, owners or persons, adds a repair step, or adds a db/checks file. Not for a plain new table with no rerun.
---

# spx-build-step-ids: a rerun keeps ids

Rules: [AGENTS.md §8, "A rerun keeps ids"](../../../AGENTS.md#8-data-work) and "A build step deletes only what it owns",
plus [§8 item 3](../../../AGENTS.md#8-data-work) (build steps are rerunnable SQL). Ids reach production through releases: a changed id is a
broken game address and a unique-key error.

## Checklist

1. **Find the step's owned rows.** Note exactly which rows the step inserts or deletes (its source, marker or candidate set). A delete is
   limited to rows the step wrote (`source`, `source_key`, a marker). Never "everything not in my list".
2. **Remember ids before the delete.** The pattern in `db/build/140_mlb_from_retrosheet.sql` and `145_nhl_from_nhlapi.sql`:
   - `insert into ingest.row_id_map (tbl, natural_key, row_id) select ... from <rows to delete> on conflict do nothing` (a key already there keeps its first id).
   - On insert, take the id back: `ingest.identity_id_for(franchise_id, first_day)` for identities (migration 146), or the remembered id from
     `ingest.row_id_map` for venues (176 and 198) and stints and owners (177, 179, 181, 184, 176).
   - Update rows in place where you can: an in-place update keeps the id with no map at all.
3. **Name the key** by something stable: source key, franchise and first day, person external id. Not by a name a source may spell differently.
4. **Add the map table row** only through the existing `ingest` objects (migrations 135, 136, 146; `db/build/221_row_id_map.sql` backfills).
   A new kind of row needs a new migration: check the name is free first.
5. **Repair step** for ids that already drifted: `db/build/pending/<name>.sql` (ignored by the build; DS1 only, run by the coordinating session
   with `ds1-apply.sh`), like `db/build/pending/venue_id_repair.sql`.
6. **Check file** `db/checks/NNN_<name>.sql` that returns the offending rows, with a baseline of 0. `db/checks/093_row_id_drift.sql` already
   watches every remembered table through `ingest.row_id_current`; add a check only for a rule it does not cover.
   Take the next free number and run it on scratch.
7. **Test on scratch twice.** Run the step, run it again: the second run must change zero ids and insert or delete zero rows.
   Existing tests to copy: `bash db/tests/identity-ids.sh` (port 7743), `db/tests/venue-ids.sh`, `db/tests/nba-identity-ids.sh`.
   A new step gets a test in the same style, on a scratch Postgres in 7740-7749 removed by name afterwards.
8. **Time it.** A statement must finish in about 40 s on production's size. Time the step on scratch at full volume.
9. **Say it loud in the hand-off.** If you changed `db/checks`, `scripts/release` or `scripts/sync`, the hand-off must say so in capitals:
   the release runner must be rebuilt at your commit before any `release.py prepare`. Put the step order in `ds1_steps`, with "a rerun changes 0 ids".
10. **Merges and deletes of rows others point to** (people, franchises, identities): every table with a foreign key goes into the same release.
    Step 185 repoints every person foreign key (28 of them); `prepare`'s rehearsal finds any you forget.

## Pitfalls that broke things

- A rerun of 145 gave 57,726 games new ids. Step 154 renumbered 50 series. A rerun of 176 changed about 40 venue ids.
- Step 177 deleted 11,073 Wikidata ids that other steps had added: it deleted rows it did not own.
- Steps 140, 145, 146, 150, 151, 154, 216, 218 and 219 delete and re-add identities. Run `db/build/221` once after migration 146
  and before any rerun of them, or the rerun renumbers identities and the team seasons that point at them.
- Step 147 remembers NBA identities by franchise and first day. `db/build/147_nba_identity_merge.sql` joins a split identity into the
  lowest id (SPX's row), so every surviving id is unchanged; check 097 (`db/checks/097_nba_identity_split.sql`) must return 0 rows.
- An identity whose first day moves gets a new id by design. Say so in the hand-off.
- Changing what a club belongs to reruns `175_team_brand`, `175_team_logo_extra`, `175_team_logo_fit` and `175_team_logo_join` (`bash db/tests/brand-rerun.sh`); their orphan lines must stay empty.
  A step that cut a club's brand eras by identity range leaves the cut rows behind on a rerun: join them the same way, with a check.
- Migration 117 gave visitors "permission denied for schema core" and `api.stat_reference` could not be rebuilt on production. New `api`
  objects must work as `anon` (`set role anon` in the test).
- A view that visitors read must never be left empty: build beside it and swap (AGENTS.md §8, materialized views).

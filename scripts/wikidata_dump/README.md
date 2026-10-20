# scripts/wikidata_dump

Cuts the full Wikidata JSON dump (CC0) down to what spx-stats and meigen-sports need: **people of all sports**, **sport events**, **sport items** (clubs, leagues, venues, competitions, seasons) and the **labels** of what those point at. The dump is read once, streamed, never stored in a database. Wikidata, English-first with French and Japanese labels, so nothing here comes from a red source (AGENTS.md section 3).

Ticket cmv91xw8o0000jp06crow6utm. Only the coordinating session runs the nas1 and DS1 steps (AGENTS.md section 1, "Who may change what"); this folder is code and the plan.

| File | What |
|---|---|
| `filter.py` | `extract` (people, events, items, summary), `refs` (ids the outputs point at), `labels` (second pass). Python 3 stdlib only. |
| `occupations.tsv`, `occupations.py` | the fixed, committed list of sport occupations (1,224 items, 1,155 used): every subclass of athlete, coach, referee and sports official. `occupations.py` rebuilds it from Wikidata's SPARQL service (one request); `filter.py` never asks Wikidata. |
| `nas-run.sh` | one command per nas1 step (`push`, `extract`, `refs`, `labels`, `status`, `stop`, `sha256`, `fetch`); names and paths from the host mapping. |
| `load.py` | loads the outputs into DS1, schema `legacy_wikidata_dump` (migration 141), in batches, with the dump's provenance. |
| `../../db/migrations/141_legacy_wikidata_dump.sql` | `load_run`, `person`, `event`, `item`, `label`. DS1 only. |
| `test/` | `build_fixture.py` + `fixture-dump.json.gz` (27 lines, hand-written entities), `test_filter.py` (27 tests), `test_scratch.sh` (migration and loader on a scratch Postgres, port 7745), `test_nas_run.sh` (the nas1 commands against a fake docker). |

    python3 -I scripts/wikidata_dump/test/test_filter.py        # about 5 s, no network, no database
    bash scripts/wikidata_dump/test/test_scratch.sh              # Docker; port 7745; the container is removed by name
    bash scripts/wikidata_dump/test/test_nas_run.sh              # no network, no docker

## What is kept and what is dropped

The dump has one entity per line (`[` first, `]` last, a comma after each line). `filter.py` first tests each line as bytes (`"P641"`, and for `--rule occupation` the human and occupation tags), parses only the lines that pass, and drops everything not on an allow-list.

| Output | Rule | Kept |
|---|---|---|
| `people.jsonl.gz` | human (P31 = Q5) **and** a P106 occupation in `occupations.tsv` **and** a P641 sport (`--rule strict`, the default; `--rule occupation` or `--rule sport` drops one test) | `id`; labels en, fr, ja, mul (`l`); English description (`d`, see below); sitelink count and the enwiki, frwiki, jawiki titles (`sl`); P569 and P570 with precision and calendar; P19, P20; P27; P106; P641; P54 with P580, P582, P1350, P1351; P413; P166 with P585, P1346, P805; P1344 with P1352; P1000; P18 (a Commons file name); P2048, P2067; P742, P1449; P1532; P2416; external ids only with `--ext-ids` |
| `events.jsonl.gz` | not human, has P641, and a **day-precision** date (P585, P580 or P582, a real month and day after year 0) **or** a winner (P1346) | `id`, `l`, `sl`; P31, P641, P585, P580, P582, P1346, P710, P276, P17, P361, P3450, P1923 |
| `items.jsonl.gz` | not human, has P641, not an event | `id`, `l`, `sl`; P31, P641, P17, P118, P361, P115, P571, P576, P3450, P585, P580, P582 |
| `labels.jsonl.gz` | second pass, only ids in `refs.txt.gz` | `id`, `l`, `sl`; P31, P17, P131, P297, P298, P300 |

Beyond the ticket's list I added P1350 and P1351 (matches and goals on a team stint), P805 (award edition), P1352 (ranking), P1449 (nickname), P1532 (country for sport), P2416 (discipline), P1923 (participating teams) and the whole `items` and `labels` outputs, because clubs, places, awards and seasons have to be resolvable. Each is one line in the `*_PROPS` tuples at the top of `filter.py`.

**Never copied** (the lists are an allow-list; `FORBIDDEN` in `filter.py` is a second lock checked at import, by `--ext-ids`, and by the tests on every output line): sex or gender (P21), ethnic group (P172), religion (P140), party and ideology (P102, P1142), spouse, child, parents, siblings, relatives, partners, godparents (P26, P40, P22, P25, P3373, P1038, P451, P1290, P3342), manner and cause of death, medical condition (P1196, P509, P1050), sexual orientation (P91), residence, burial, detention, education, languages, names of family (P551, P119, P2632, P69, P1412, P734, P735, P1477, P2650). **External ids are off by default.** Never ESPN or a Sports Reference id (AGENTS.md section 3); the authority-file ids (P213, P214, P227, P244) are the only ones `--ext-ids` is meant for.

Two more scrubs for text and values that can say what the properties may not:
- `occupations.tsv` marks 69 occupations `use=0` (a sex marker such as "female athlete", an ethnicity such as "Mexican American athletes", a club president, a hunter, a metaclass). They never match and are removed from `P106` (counted in `summary.json` as `occupation_values_dropped`).
- A description that contains a gender, sexuality, religion, family-relation or health word ("Canadian female ice hockey player", "brother of ...") is dropped (`description_dropped_sensitive`). It is a best-effort regex (`DESC_SENSITIVE_RE`), so **descriptions are unreviewed free text: use them to tell two people apart, never show them without a look.** `--no-descriptions` leaves them out altogether.

Things the coordinator should decide before any `core` build reads these tables (not done here):
- A sport value or a team name can itself carry a sex ("women's association football", "X women's national team"). The mapping step should map such sports onto the base sport and never store the marker.
- P27 (citizenship) is kept because the project already uses it for nationality; P2048 and P2067 (height, mass) are kept because the ticket listed them; drop either by deleting its line in `PERSON_PROPS`.
- P18 is a Commons file name only; licences are per file, so nothing is hotlinked without that check.

## Output format

One JSON object per line, gzip members appended (`gzip -dc` and Python's `gzip` read them as one stream). Keys are compact; a property is absent when it has no usable value. Deprecated statements are dropped; for single-valued properties (dates, places, image, height, mass) only the preferred statements are kept when there are any. Unknown-value statements are dropped.

    {"id":"Q1001","l":{"en":"Alice Skater","fr":"..","ja":".."},"d":"Canadian ice hockey player","sl":{"n":4,"enwiki":"Alice Skater"},
     "P569":[{"t":"+1961-01-26T00:00:00Z","p":11,"c":"Q1985727"}],"P19":["Q4002"],"P106":["Q11774891"],"P641":["Q41466"],
     "P54":[{"v":"Q3001","q":{"P580":[{"t":"+1979-06-01T00:00:00Z","p":10,"c":"Q1985727"}],"P582":[{"nv":1}],"P1350":[{"a":"+120"}]}}], ...}

- **Values:** an item is its Q id string; a string or text is a string (500 characters at most); a quantity is `{"a": "+183", "u": "Q11573"}` (`u` absent for a plain number); a time is `{"t", "p", "c"}`: the Wikidata time text as it is (so `+1999-00-00T00:00:00Z` with `p` 9 means only the year 1999; a negative year is BCE), the precision (9 year, 10 month, 11 day) and the calendar (`Q1985727` proleptic Gregorian, `Q1985786` proleptic Julian: a date is **not** converted).
- **A property with qualifiers** (P54, P166, P1344) is a list of `{"v": value, "q": {qualifier: [values]}}` (`q` absent when empty). In a qualifier list `{"nv":1}` means "no value" (a P582 of this means the stint has no end) and `{"sv":1}` means "unknown value".
- **`x`** (`{"P166": 1005}`) says a list was cut at 1,000 values and how many there were.
- **`sl.n`** counts all sitelinks (Commons and every Wikipedia included).
- `summary.json` holds the run: dump name, size, mtime, md5 and path (sha256 when given), options, lines read, malformed lines (counted, first 20 line numbers), counts by output, **counts by sport (P641 id) for each output**, what was dropped, and the size and sha256 of each output file. `complete` is true only when the whole dump was read.

## Run on nas1

The dump is `latest-all.json.gz` (156,496,041,475 bytes, md5 `83b2d2e3f578e50209fd7d3ded7364b1`, Wikidata dump 2026-10-12) in the job folder `$NAS1_DOCKER_DIR/spx-wikidata-dump/`, names from `scripts/mac/lib/hosts.sh`. It is mounted read-only into a `python:3.13-slim` container with no network; outputs go to `out/` in that folder. `nas-run.sh` is one command per step (it reads the host mapping; `NAS_RUN_DRY=1` prints what it would run on nas1; `bash scripts/wikidata_dump/test/test_nas_run.sh` checks its quoting and arguments against a fake docker):

    cd ~/Projects/spx-stats && git pull -q --ff-only        # then note: git rev-parse --short HEAD  (for load.py --note)

1. **Copy the two files the filter needs** (`filter.py`, `occupations.tsv`; the job folder and `out/` are created):

       bash scripts/wikidata_dump/nas-run.sh push

2. **Start the main pass.** The same command resumes a stopped run (the first start has no state and begins at line 1; `--resume` is always safe). Extra arguments go to `filter.py`. A rehearsal such as `... extract --limit 5000000` is simply the first part of the run: the next plain `extract` continues from it (`--fresh` throws it away). `load.py` refuses a `--limit` output unless told otherwise.

       bash scripts/wikidata_dump/nas-run.sh extract

   This runs, on nas1 (`D` is the job folder, `B` the docker command of the host mapping):

       sudo $B run -d --name spx-wikidata-filter --init --network none --cpus 2 --memory 1g --memory-swap 1g --pids-limit 64 \
         --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs /tmp --stop-timeout 120 \
         --log-opt max-size=10m --log-opt max-file=3 \
         -v $D/latest-all.json.gz:/data/dump.json.gz:ro -v $D/code:/app:ro -v $D/out:/out \
         python:3.13-slim python -I /app/filter.py extract /data/dump.json.gz /out --resume \
         --dump-md5 83b2d2e3f578e50209fd7d3ded7364b1 --dump-path spx-wikidata-dump/latest-all.json.gz

   `python:3.13-slim` is pulled on first use (free). Its `gzip` does the decompression in a second process, so two CPUs are used (`WD_CPUS=1` on a busy NAS, and double the time). `--workers` is for spare cores and a fast disk; parsing is a small part, so it is not needed.

3. **Watch** (last log lines of both passes, container states, file sizes; one call a minute at most):

       bash scripts/wikidata_dump/nas-run.sh status

   A progress line is printed every 1,000,000 lines (the dump has about 120 million): lines read, percent of the file, an estimate of minutes left, counts so far, lines per second. A state file is written every 5,000,000 lines. `Exited (0)` plus `summary.json` in `out/` means finished. `Exited (3)` is a corrupt or cut-short dump (the outputs hold what was read). `Exited (130)` is a clean stop. **Stop** it with `bash scripts/wikidata_dump/nas-run.sh stop` (it finishes the batch, writes the state, exits 130); run step 2 again to resume (the skip costs the decompression time of the part already done, no parsing).

4. **SHA-256 of the raw dump** (it is part of the provenance; md5 is already known). Any time; about 20 to 40 minutes of disk reads in the background on nas1; writes `out/latest-all.json.gz.sha256`:

       bash scripts/wikidata_dump/nas-run.sh sha256

5. **After `extract`: the references, then the label pass.** `refs` takes minutes. `labels` reads the dump again (the time of step 2) and is worth it: it gives places, countries, awards and positions their names. Watch it with `status`; it resumes like step 2:

       bash scripts/wikidata_dump/nas-run.sh refs && bash scripts/wikidata_dump/nas-run.sh labels

   `refs.txt.gz` lists the ids the outputs point at that are not in them. The label pass labels those one level deep (a city's region is one step further, because the labels themselves are not scanned; run `filter.py refs` on a folder holding only `labels.jsonl.gz` if a second level is wanted).

## Time, size, memory (estimates; the run replaces them with real numbers in `summary.json`)

- **Time: about 3 to 8 hours for `extract`, the same again for `labels`.** The 156 GB gzip is about 1.8 TB of JSON, and the run is limited by decompression (one `gzip -dc` process, 100 to 300 MB/s of JSON depending on the NAS CPU). Measured here on a laptop: the filter's own work (read, byte test, parse of matches, write) went through 37 GB of synthetic JSON at about 740 MB/s with a 1.2 GB gzip, so it keeps up with `gzip -dc` on any machine that can decompress at 300 MB/s or less. Reading 156 GB from the disk is about 15 minutes of that, not the limit.
- **Memory:** a few hundred MB (a batch of 20,000 lines plus its matches); `refs` about 100 MB (a bitmap of Q numbers). 1 GB is a safe cap.
- **Output size (a guess):** people 1.8 to 2.8 million (footballers are over half), events 0.5 to 1.5 million, items 2 to 4 million. Gzipped: **about 0.7 to 1.2 GB in all** (people 0.4 to 0.6), 4 to 7 GB uncompressed; `labels` adds 0.05 to 0.15 GB. In DS1's Postgres expect **6 to 10 GB** (jsonb stays uncompressed below the 2 kB TOAST threshold, plus the key index). **Check the free space of DS1's data volume before step 7**; `load.py --min-sitelinks N` loads only people with at least N sitelinks if space is tight.
- A pause costs nothing but the skip: `--resume` re-reads the stream without parsing it, about the time gunzip needs for the part already done.

## DS1 steps (the coordinating session; nothing here touches production or a release)

Nothing in `legacy_wikidata_dump` is published, so no pending release is affected and `db/checks` are not involved.

6. **Fetch the outputs to the Mac** (backups live outside the repository, date first; rerun it after step 4's hash file exists):

       bash scripts/wikidata_dump/nas-run.sh fetch && python3 -c "import json,os;d=json.load(open(os.path.expanduser('~/Projects/backups/spx-stats/2026-10-12-wikidata-dump-out/summary.json')));print(d['complete'],d['counts'],d['malformed_lines'])"

   `complete` must be `True`. Also copy the files to Dropbox (create-only, hash-checked, any size): `python3 scripts/dropbox_put.py <file> wikidata-dump 2026-10-12` for each of `people`, `events`, `items`, `labels` and the summaries, so the filtered data exists in two places besides nas1.

7. **The schema** (migration 141; rerunnable; the dry run rolls back):

       cd ~/Projects/spx-stats && bash scripts/mac/ds1-apply.sh db/migrations/141_legacy_wikidata_dump.sql --dry-run && bash scripts/mac/ds1-apply.sh db/migrations/141_legacy_wikidata_dump.sql

8. **Provenance rows in `raw_archive`.** The raw dump does not go into `legacy_files.raw_archive` (a bytea holds 1 GB; the dump is 156 GB): its name, size, md5, sha256, folder and the hash of every filtered file are in `load_run` (step 9) and in the two summary files, which are small and are archived as they are (`archive_raw.py` writes the SQL, `ds1-apply.sh` applies it):

       cd ~/Projects/spx-stats && D=~/Projects/backups/spx-stats/2026-10-12-wikidata-dump-out && T=$(mktemp -d) && cp "$D/summary.json" "$D/labels-summary.json" "$D/latest-all.json.gz.sha256" "$T/" && python3 -I scripts/archive_raw.py wikidata-dump "$T" 2026-10-12 --sql-out "$T/archive.sql" && bash scripts/mac/ds1-apply.sh "$T/archive.sql" --force; rm -rf "$T"

   The filtered files (about 0.7 to 1.2 GB gzipped in all; each is under the 1 GB bytea limit but `archive_raw.py` reads a file whole into one SQL statement) stay as files: nas1 `out/`, the backups folder and Dropbox, with the size and sha256 of each recorded in `load_run.files`. If John wants them in `raw_archive` too, split `people.jsonl.gz` into parts first.

9. **Load.** Dry run first (reads and counts, no database), then the real load. Both reach DS1 through `scripts/daily/ds1.sh` (`--ds1`: the host from the host mapping, the password from the keychain, `PG*` ignored):

       cd ~/Projects/spx-stats && D=~/Projects/backups/spx-stats/2026-10-12-wikidata-dump-out && python3 -I scripts/wikidata_dump/load.py "$D" --ds1 --dry-run
       cd ~/Projects/spx-stats && D=~/Projects/backups/spx-stats/2026-10-12-wikidata-dump-out && python3 -I scripts/wikidata_dump/load.py "$D" --ds1 --dump-name wikidata-20261012-all.json.gz --dump-date 2026-10-12 --dump-path spx-wikidata-dump/latest-all.json.gz --dump-sha256 "$(cut -d' ' -f1 "$D/latest-all.json.gz.sha256")" --note "filter at $(git rev-parse --short HEAD)"

   `load.py` checks each output file against the sha256 in its summary first, creates `load_run` rows (one for `extract`, one for `labels`), loads in transactions of 5,000 rows (`COPY` into a temporary table, then an upsert by Q id), compares the rows in the table with what it sent and with what the filter wrote, and marks the run `done` (or `failed`, with the reason in `load_run.note`). A failure stops it; run the same command again (upserts; the run row is reused). Options: `--tables person,event`, `--min-sitelinks N` (people only), `--replace-old` (after a clean load, delete the rows of earlier runs: one snapshot), `--batch-rows`.

10. **Check:**

        bash scripts/daily/ds1.sh -c "select run_id, kind, status, dump_name, dump_date, loaded from legacy_wikidata_dump.load_run order by run_id"
        bash scripts/daily/ds1.sh -c "select (select count(*) from legacy_wikidata_dump.person) people, (select count(*) from legacy_wikidata_dump.event) events, (select count(*) from legacy_wikidata_dump.item) items, (select count(*) from legacy_wikidata_dump.label) labels"
        bash scripts/daily/ds1.sh -c "select qid, label_en, sitelinks from legacy_wikidata_dump.person order by sitelinks desc nulls last limit 10"

   The counts must equal `summary.json` `counts` (`load.py` already stops when they do not, except with `--min-sitelinks`).

Next, not in this ticket: a `db/build` step that maps `person` onto `core.person` by Wikidata id (never on a name), maps P641 onto `core.person_sport` and the meigen sport codes (the sex-marker rule above), and fills birth and death with the precision the data has; a step for events and records. Those steps read these tables, not the dump.

## Rules this tool follows

- The raw dump is never modified, copied into a database, or committed; the fixture is hand-written.
- No network access in the run: the container has `--network none`; `occupations.py` is the only script here that calls Wikidata, once, by hand, with the project's user agent.
- No credential is read or printed; the loader uses the host mapping and the keychain only through `scripts/daily/ds1.sh`.
- Nothing is written to production, to a release, or to `core`.

# Jersey numbers and retired numbers

Collect the numbers players wore and the numbers each franchise (or a whole league) has retired. English Wikipedia list articles (CC BY-SA 4.0) and Wikidata P1618 (CC0). Terms checked: Wikipedia and Wikidata allow this reuse; Sports Reference, ESPN and every NHL endpoint are refused.

A player can have more than one number (Wayne Gretzky 99, Mario Lemieux 66, Pavel Bure 10 and 92). Holes are fine. Nothing is guessed. Each core row carries `source_id` and `source_key`.

## Sources

| Code | Article | Licence |
|---|---|---|
| `nhl_retired` | [List of NHL retired numbers](https://en.wikipedia.org/wiki/List_of_NHL_retired_numbers) | CC BY-SA 4.0 |
| `nba_retired` | [List of NBA retired numbers](https://en.wikipedia.org/wiki/List_of_NBA_retired_numbers) | CC BY-SA 4.0 |
| `nfl_retired` | [List of NFL retired numbers](https://en.wikipedia.org/wiki/List_of_NFL_retired_numbers) | CC BY-SA 4.0 |
| `mlb_retired` | [List of Major League Baseball retired numbers](https://en.wikipedia.org/wiki/List_of_Major_League_Baseball_retired_numbers) | CC BY-SA 4.0 |
| `cfl_retired` | [List of Canadian Football League retired numbers](https://en.wikipedia.org/wiki/List_of_Canadian_Football_League_retired_numbers) | CC BY-SA 4.0 (404 is left empty) |
| Wikidata P1618 | sport number, team qualifier P54 when present | CC0 |

nflverse roster numbers already land on `core.roster_stint`; build step 220 also copies those into `core.person_jersey` (same source, `source_key` prefix `jersey-roster:`).

## Commands (from the repo root)

```
python3 -I scripts/jerseys/fetch.py --cache raw/wikipedia_jersey/cache
python3 -I scripts/jerseys/extract.py --cache raw/wikipedia_jersey/cache --out raw/wikipedia_jersey/parsed
python3 -I scripts/jerseys/wikidata_numbers.py --out raw/wikidata_jersey/sport_number.json
# load against the session's Postgres (PGHOST / PGPORT / PGDATABASE):
python3 -I scripts/jerseys/load.py raw/wikipedia_jersey/parsed/*.json raw/wikidata_jersey/sport_number.json
psql … -v ON_ERROR_STOP=1 -f db/build/220_jersey_numbers.sql
```

One request every 2.5 s, identified User-Agent. Existing cache files are never refetched.

Scratch only (never DS1): `scripts/jerseys/scratch_schema.sql` plus `load_scratch.py` copies names from the preview PostgREST. Remove the container by name when done (`docker rm -f spx-jersey-numbers`).

Archive the raw wikitext and the SPARQL answer on DS1 (`legacy_files.raw_archive`) and in Dropbox before any production release. The coordinating session does those writes.

## Tables

- `legacy_wikipedia_jersey.article` / `.retired`
- `legacy_wikidata_jersey.sport_number`
- `core.retired_number` — franchise or league-wide
- `core.person_jersey` — numbers worn
- `api.retired_number`, `api.person_jersey`

Release `core.retired_number` and `core.person_jersey` (and `meta.data_issue` if the build logged unmatched names). Schema `legacy_*` stays on DS1.

# spx-stats

Scores, schedules, standings, champions and awards of the NHL, NBA, MLB, NFL
and CFL. The base is the SPX (SportsInteractive.com) archive of 1997–2013;
open sources fill the seasons SPX never held and check the ones it did.

Browse it at [spxn.com](https://spxn.com).

## For AI agents

Read [`AGENTS.md`](AGENTS.md) first (`CLAUDE.md` imports it), then the private
`Dropbox /Backups/spx-stats/START-HERE.md`.

**The ticket board is not here and not on GitHub.** This repository keeps its Issues and Projects
empty on purpose; the work queue is a board on Sumilabu (project key `spx-stats`). List it with one
command, run from `web/`: `cd web && pnpm task`. Full rules are in
[AGENTS.md §5](AGENTS.md#5-tickets).

## Where the data comes from

| Source | What it gives | Licence |
| --- | --- | --- |
| SPX | Games, results, betting lines and standings, 2002–2013 | SPX's own |
| [Retrosheet](https://www.retrosheet.org) | MLB games 1871 on, franchise history | Free, with Retrosheet's notice |
| [nflverse](https://github.com/nflverse) | NFL games 1999 on, team names | CC BY 4.0 |
| [Wikidata](https://www.wikidata.org) | Award names and winners | CC0 |

Where SPX holds a value, SPX's value is kept; a second source that agrees
confirms it, and one that disagrees is logged.

The information used here was obtained free of charge from and is copyrighted
by Retrosheet. Interested parties may contact Retrosheet at
"www.retrosheet.org".

## How the data is kept

| Schema | Holds |
| --- | --- |
| `legacy_*` | Each source exactly as it came, one schema per source. Member data (accounts, wagers, forums, surveys) is never copied. |
| `core` | The curated history: franchises and their names over time, seasons, games, betting lines, standings, awards and winners. |
| `meta` | Provenance: every source and its licence, every data issue and how it was resolved, every confirmation by a second source. |
| `ref` | Countries, sports, leagues. |

Rules the build keeps:

- A missing value is null, never zero.
- Nothing is silently corrected: a change to what a source said is logged in `meta.data_issue`.
- Anything that changes over time is a dated row, and exclusion constraints refuse overlaps.

## Data

How data gets from a source to spxn.com: [`docs/data-flow.md`](docs/data-flow.md).

## Rebuilding

1. Apply `db/migrations/*.sql` in order (Postgres 17, `btree_gist`).
2. Load each source into its `legacy_*` schema with the scripts in `scripts/`.
3. Run `scripts/build_core.sh` to rebuild `core` from them, and
   `db/report/games_coverage.sql` to see what is complete.
4. `scripts/site/publish.sh` exports the data and publishes the site.

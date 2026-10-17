# Player season statistics: NBA and NFL

Season lines for players, from open sources only. DS1 first, then a data release (AGENTS.md section 8).

| League | Source | Fetch | Load into legacy | Build step | Groups in `core.player_season_stat` |
|---|---|---|---|---|---|
| NBA | the "Player statistics" tables of each "<season> <club> season" article on English Wikipedia (CC BY-SA 4.0), at the revision the roster step read | `nba_wp_fetch.py` | `nba_wp_load.py` -> `legacy_wikipedia_stats.*` (migration 100) | `db/build/181_stats_nba_wikipedia.sql` (+ `db/seed/nba_stat_column.csv`) | `basketball` |
| NFL | nflverse `stats_player` release (CC BY 4.0), 1999 on: weekly files summed per club, season files as the check | `nflverse_stats_fetch.py` | `nflverse_stats_load.py` -> `legacy_nflverse.player_stat` (migration 099) | `db/build/181_stats_nfl_nflverse.sql` | `passing rushing receiving defense kicking punting` |

Never used: Basketball Reference, Pro Football Reference, ESPN, NBA.com, NFL.com. The nflverse player files carry no other site's id (the one image-link column,
`headshot_url`, is dropped as each file is saved).

## Run (on the Mac, in this order)

Raw files live in `~/Projects/backups/spx-stats/raw/`. The `.sql` load files are written outside the repo, so `ds1-apply.sh` needs `--force` for them. Migrations first
(099, 100 are DS1-only legacy schemas; 101, 102, 103 go to DS1 and to production before the release):

    bash scripts/mac/ds1-apply.sh db/migrations/099_legacy_nflverse_player_stat.sql
    bash scripts/mac/ds1-apply.sh db/migrations/100_legacy_wikipedia_stats.sql
    bash scripts/mac/ds1-apply.sh db/migrations/101_player_stat_basis_key.sql

    R=~/Projects/backups/spx-stats/raw
    D=2026-10-14
    # NFL (fetched 2026-10-14: about 270 MB; a rerun fetches only what is missing)
    python3 -I scripts/player_stats/nflverse_stats_fetch.py $R/nflverse_player_stats/$D
    python3 -I scripts/player_stats/nflverse_stats_load.py $R/nflverse_player_stats/$D ~/Projects/backups/spx-stats/nfl-stats-$D.sql $D
    bash scripts/mac/ds1-apply.sh ~/Projects/backups/spx-stats/nfl-stats-$D.sql --force
    # NBA (fetched 2026-10-14 from the roster step's articles: two requests an article, about an hour)
    python3 -I scripts/player_stats/nba_wp_fetch.py $R/wikidata_rosters/$D/nba $R/wikipedia_nba_stats/$D
    python3 -I scripts/player_stats/nba_wp_load.py $R/wikipedia_nba_stats/$D ~/Projects/backups/spx-stats/nba-stats-$D.sql $D
    bash scripts/mac/ds1-apply.sh ~/Projects/backups/spx-stats/nba-stats-$D.sql --force

Then the build steps, each through `ds1-apply.sh` (one transaction each), after 179 and 181_players_nflverse and before 185:

    181_stats_nba_wikipedia.sql   181_stats_nfl_nflverse.sql   185_person_merge.sql   186_person_positions.sql   190_player_index.sql

then `db/checks` (091 is new), then a data release of `core.player_season_stat, meta.source, meta.data_issue` (the two steps' people already exist). The release runner
runs `api.refresh()`; `api.stat_reference` (the league line, ranks and radar) is rebuilt by migrations 102 (build `stat_reference_new`) and 103 (swap), applied to
DS1 and production as two separate files before the release, never while a refresh runs.

NBA **team** season totals (rebounds, points, and shooting when the table publishes attempts) are built from the same `legacy_wikipedia_stats` lines by
`db/build/185_team_season_stat_nba.sql`. See `scripts/team_stats/README.md`. No extra fetch.

## How a line is placed

* NBA: the name must link to an article, the article must be a Wikidata item whose person step 179 made, the club season a team season (the franchise identity's
  full name as legacy_rosters.wp_article names it), and 179 must have put that person on that club that season (a `roster_stint`). Anything else is counted in
  `meta.data_issue` (`stat_player`, `stat_team`, `stat_article`), never matched on a name.
* NFL: the person is the one keyed by the gsis id (written by `181_players_nflverse.sql`); the club is `team:<code>` of the franchise keys step 150 wrote. nflverse's weekly
  file names the club of each week, so a traded player has one line per club.
* What the numbers are: `stat_basis` ('total', 'both', 'per_game') and `source_key` ('enwiki:<title>@<revision id>') on the row; see migration 101 and the step's header.

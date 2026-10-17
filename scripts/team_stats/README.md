# Season-level team statistics

`core.team_season_stat` (regular season), one row per team season and source. NHL, MLB and NFL are `db/build/185_team_season_stat.sql`. NBA is the sibling step below.

| League | Source | Fetch | Load | Build |
|---|---|---|---|---|
| NHL | NHL API team summary and penalties (already loaded; **no new NHL requests**) | `fetch.py --source nhl` refuses | `load.py --source nhl` | `185_team_season_stat.sql` |
| MLB | Lahman Teams | (existing Lahman load) | | `185_team_season_stat.sql` |
| NFL | nflverse `stats_team_week_<year>.csv` (CC BY 4.0) | `fetch.py --source nflverse` | `load.py --source nflverse` | `185_team_season_stat.sql` |
| NBA | Player statistics tables of English Wikipedia club-season articles (CC BY-SA 4.0), the same raw already fetched for player stats | none (reuse `wikipedia_nba_stats`) | none (`legacy_wikipedia_stats` from `nba_wp_load.py`) | `185_team_season_stat_nba.sql` |

Never used: Basketball Reference, Pro Football Reference, ESPN, NBA.com, NHL endpoints.

## NBA (Wikipedia player tables)

The club-season articles almost never print a Team totals row. The build sums the player rows of the first regular-season table:

- Rebounds and points: published totals, or per-game average × that player's games, rounded (same derivation as `181_stats_nba_wikipedia.sql`).
- Team per-game rates use the team's regular-season games (`core.game` finals, else `season.games_per_team`), not a player's max GP.
- Shooting percentages are summed makes / summed attempts. Player FG% is never averaged. Tables that only print FG% leave shooting empty.
- A table whose summed minutes are under 85% of 5 × 48 × team games is left out (incomplete roster table) and counted in `meta.data_issue`.

Columns: `db/seed/nba_team_stat_column.csv`. Site ranks (when a number exists) are `tstat.fg_pct`, `tstat.three_pct`, `tstat.rpg` on the team season page.

Scratch (two seasons, own Docker, port 7740, removed by name):

    bash scripts/team_stats/scratch_nba.sh

Coordinator, after `legacy_wikipedia_stats` is on DS1 (already loaded with the player step):

    bash scripts/mac/ds1-apply.sh db/build/185_team_season_stat_nba.sql

Then a data release of `core.team_season_stat, meta.source, meta.data_issue`.

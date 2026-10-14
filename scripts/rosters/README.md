# Club rosters: NBA, NFL, CFL

Players with the club seasons they were on, from open sources only. DS1 first, then a data release (AGENTS.md section 8).

| League | Source | Fetch | Load into legacy | Build step |
|---|---|---|---|---|
| NBA | Wikidata P54 (CC0) + the Roster and Player statistics tables of each "<season> <club> season" article on English Wikipedia (CC BY-SA 4.0) | `wd_fetch.py nba`, `wp_fetch.py nba` | `load.py nba` -> `legacy_rosters.*` (migration 092) | `db/build/179_players_wikidata.sql` |
| CFL | the same two | `wd_fetch.py cfl`, `wp_fetch.py cfl` | `load.py cfl` | `179_players_wikidata.sql` (same step, both leagues) |
| NFL | nflverse `roster_<season>.csv` (CC BY 4.0), without other sites' id columns | `nflverse_fetch.py` | `nflverse_load.py` -> `legacy_nflverse.roster` (migration 094) | `db/build/181_players_nflverse.sql` |

Never used: Basketball Reference, Pro Football Reference, ESPN, NBA.com, NFL.com, CFL.ca. The ESPN, Pro Football Reference, PFF, Yahoo and other
sites' player ids in the nflverse files are dropped at download (`nflverse_fetch.py` DROP) and never stored.

## Run (on the Mac, in this order)

Raw files live in `~/Projects/backups/spx-stats/raw/` (never in the checkout). Fetches are resumable and polite (one request every 2 s).

    R=~/Projects/backups/spx-stats/raw
    D=2026-10-14
    # NBA (already fetched on 2026-10-14 into $R/wikidata_rosters/$D/nba; rerun is a no-op that tops up what is new)
    python3 -I scripts/rosters/wd_fetch.py nba $R/wikidata_rosters/$D/nba
    python3 -I scripts/rosters/wp_fetch.py nba $R/wikidata_rosters/$D/nba_team_seasons.tsv $R/wikidata_rosters/$D/nba all
    python3 -I scripts/rosters/load.py nba $R/wikidata_rosters/$D/nba ~/Projects/backups/spx-stats/rosters-$D-nba.sql
    bash scripts/mac/ds1-apply.sh ~/Projects/backups/spx-stats/rosters-$D-nba.sql      # archive + legacy_rosters on DS1
    # CFL (fetched the same day into $R/wikidata_rosters/$D/cfl, titles in cfl_team_seasons.tsv)
    python3 -I scripts/rosters/wd_fetch.py cfl $R/wikidata_rosters/$D/cfl
    python3 -I scripts/rosters/wp_fetch.py cfl $R/wikidata_rosters/$D/cfl_team_seasons.tsv $R/wikidata_rosters/$D/cfl all
    python3 -I scripts/rosters/load.py cfl $R/wikidata_rosters/$D/cfl ~/Projects/backups/spx-stats/rosters-$D-cfl.sql
    bash scripts/mac/ds1-apply.sh ~/Projects/backups/spx-stats/rosters-$D-cfl.sql
    # NFL
    python3 -I scripts/rosters/nflverse_fetch.py $R/nflverse_rosters/$D
    python3 -I scripts/rosters/nflverse_load.py $R/nflverse_rosters/$D ~/Projects/backups/spx-stats/rosters-$D-nfl.sql
    bash scripts/mac/ds1-apply.sh ~/Projects/backups/spx-stats/rosters-$D-nfl.sql

`titles.tsv` (club seasons to read from Wikipedia) is `season<TAB>club name`, one line per club season. The NBA one above was generated from the club
names of `db/build/147_nba_from_wikipedia.sql`; to top it up with DS1's own names, write one from DS1 and rerun `wp_fetch.py` (only the new lines are fetched):

    psql ... -At -F $'\t' -c "select s.start_year, i.full_name from core.team_season ts join core.season s using (season_id) join core.franchise_identity i using (franchise_identity_id) where s.league_code = 'nba'" > nba_team_seasons.tsv

Then the build steps, each through `scripts/mac/ds1-apply.sh` (one transaction each), in this order, with the steps they sit between in
`scripts/build_core.sh` (run after 177 and 184's predecessors; 179 and 181 before 184, 185, 186):

    179_players_wikidata.sql   181_players_nflverse.sql   185_ref_position.sql   185_person_merge.sql   186_person_positions.sql   190_player_index.sql

then `db/checks`, then a data release of `core.person, core.roster_stint, core.external_id, meta.source, meta.data_issue, ref.position_alias`
(and `core.person_redirect` when 185 merged anything). `select api.refresh()` is run by the release runner. Migrations 092 and 094 are DS1-only
(legacy schemas); migration 093 (`api.team_season_roster`) is add-only and goes to production before the web deploy.

## How the NBA / CFL step decides

- A person is a Wikidata item (key `wikidata:Q...`); a Wikipedia name counts only when its article is a human who is a Wikidata player of the league
  (or has the league's occupation or sport) and the roster's date of birth, when given, is within a year of the item's. A name whose link fails
  but whose roster gives a birth date is matched to the one Wikidata player of the league with that name and birth date; with no birth date,
  to the one with that name and a statement for that very club.
- A club season whose article lists five or more players is read from the article alone; Wikidata fills the others from its dated P54 statements.
- Everything unplaced is in `meta.data_issue` (`roster_team`, `roster_article`, `roster_player`) with counts, not guessed.

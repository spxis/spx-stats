# The Stanley Cup before the NHL (1893-1926)

The Cup was won by clubs of the AHAC, CAHL, FAHL, ECAHA, ECHA, NHA, PCHA and other leagues for 25 years before the NHL's first
season (1917-18), and the NHL's champion met clubs of the PCHA and WCHL in the final until 1926. The five-league model has no season
for those clubs, so the Cup of those years lives in its own table and the pages read it from there. No NHL season is invented.

## Model

| What | Where |
|---|---|
| One row per Cup win: a challenge series, a league title won while holding the Cup, or a final (1915-1926). 68 rows | `core.cup_series` (migration 087) |
| Every series, with names | `api.cup_series` |
| Titles outside any NHL season: one row per club and year (32, 1893-1917) | `api.cup_title` |
| Finals lost outside any NHL season (Ottawa 1915, Portland 1916, Montreal 1917) | `api.cup_finalist` |
| Wikipedia's list as printed (CC BY-SA 4.0), DS1 only | `legacy_wikipedia_stanley_cup.*` (migration 086) |
| Which club a printed name is, its NHL franchise (by source and source key) and its city | `db/seed/stanley_cup_club.csv` |
| The rerunnable build step | `db/build/210_stanley_cup_pre_nhl.sql` |
| Fetch and read the sources | `scripts/stanley_cup/fetch.py`, `parse.py` |

- **A title** is a club and a calendar year in which it won at least one Cup series or league title (the year Wikipedia files the series
  under). Montreal HC's win over Queen's on 9 March 1895 does not count: the trustees had agreed the Victorias, the AHAC champions, would
  take the Cup (`counts_as_title = false`, logged in `meta.data_issue`).
- **A club** is an NHL franchise where core holds it (`winner_franchise_id`, from the seed): Vancouver Millionaires, Seattle
  Metropolitans, Ottawa (the original Senators, Silver Seven included), Montreal Wanderers, Quebec Bulldogs, Montreal Canadiens (1916), and for finals
  Victoria, Calgary, Edmonton and the Maroons. Other clubs (Montreal HC, Victorias and Shamrocks, Winnipeg Victorias, Kenora Thistles, Toronto
  Blueshirts, Portland Rosebuds) stay clubs of this table only, with a city where `ref.city` has one. No franchise or team season is created.
- **From 1918 on** a final is also part of an NHL season (`nhl_season_id`); `api.cup_title` leaves those out, so nothing is counted twice
  (Victoria's 1925 Cup is already the 1924-25 NHL season's champion).
- The cancelled 1919 final is not a row (`core.title_not_awarded` holds it).

## Sources and checks

- English Wikipedia "List of Stanley Cup champions" (both tables and the Appearances table) and the articles on the 1915, 1916 and 1917
  finals, fetched once 2026-10-13 (one request at a time, 2.5 s apart), kept under `~/Projects/backups/spx-stats/raw/wikipedia_stanley_cup/2026-10-13/`
  and in `legacy_files.raw_archive` (`wikipedia_stanley_cup/2026-10-13/...`). SPX holds nothing before 1997. No NHL API request was made.
- Wikidata (CC0): the Stanley Cup final items and the clubs' "award received" statements were queried (`scripts/stanley_cup/winners.rq`); it
  holds no pre-1927 winners, so it confirms nothing and no row depends on it.
- `meta.verification` (entity_kind `cup_series`): 1915-1917 against the article on each final; 1918-1926 against the champion worked out
  from the NHL's own games (165); 1893-1914 against the Appearances table (a bold year for the club). `meta.data_issue` lists the clubs that
  are not franchises and the 1895 series.

## Pages

- **Team page** (NHL, a franchise with titles): the titles are listed with the championships ("1915 Stanley Cup · PCHA"), counted in the
  trophy figure and the lede, with no link (no NHL season to open).
- **City page**: a franchise's titles join its stay in the city (counts, ranking, the titles chart); a club with no franchise gets a stay of its own with no
  seasons, no link and no record (`Stay.cup`), also for a finalist (Portland). The slider starts at the earliest title.
- **NHL league page**: "Stanley Cup (before the NHL)", a table of every title.
- The reads are `lib/cupData.ts`; until the views are on the server they return nothing and the pages draw as before.

## Rebuild and release

    bash scripts/mac/ds1-apply.sh db/build/210_stanley_cup_pre_nhl.sql --dry-run && bash scripts/mac/ds1-apply.sh db/build/210_stanley_cup_pre_nhl.sql
    python3 -I scripts/release/release.py prepare --title "Stanley Cup before the NHL" --tables core.cup_series,meta.verification,meta.data_issue

Production needs migration 087 first (`core.cup_series`, the three views, `cup_series` allowed in `meta.verification.entity_kind`).
To refresh the source: `python3 -I scripts/stanley_cup/fetch.py <raw dir>` (new dated folder), `parse.py <raw dir> out.sql`, archive the folder
with `scripts/archive_raw.py`, apply the three files through `ds1-apply.sh`, rerun 210.

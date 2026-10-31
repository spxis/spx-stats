# Data sources: how each league and dataset is loaded

Moved word for word from [AGENTS.md](../AGENTS.md) on 2026-10-30, so that file stays short enough to load in every session. Read the entry for a source or league before you load, rebuild or change it, and copy the nearest one when you add a new one. "Item N" means that numbered step in [data-work.md](data-work.md). Which sources may be used at all is AGENTS.md section 3.

- **Ongoing scores** (the season in progress, all five leagues) come from English Wikipedia's club-season articles, with nflverse
  as the NFL's second check: `scripts/daily/run.py --apply` writes them to DS1 only (see `scripts/daily/README.md`). The NHL API
  (no new requests of any kind, section 3) and MLB statsapi are not used for new scores.
- **The harvest job** (`harvest/`, `scripts/harvest/`, a Docker job on the NAS next to the daily one) reads English Wikipedia and Wikidata around the clock,
  one request at a time, for what DS1 does not hold yet (gaps first: NBA, NFL and CFL rosters, team statistics, awards, drafts, bios), then re-reads by revision
  id. It writes `legacy_files.raw_archive` and `legacy_wikipedia_harvest` / `legacy_wikidata_harvest` on DS1 only and builds no `core` rows. State of the queue:
  `python3 -I scripts/harvest/status.py`; setup, limits and the missing build steps: `harvest/README.md`.
- **Venue names and facts** (every name a home venue carried with its years, plus capacity, opened, owner, surface, roof, address) come
  from Wikidata (CC0) and the "Former names" of English Wikipedia infoboxes (CC BY-SA). Refresh once a year (February) or after a
  rename: the command list is in `scripts/wikidata_venues/README.md`; production gets `core.brand_venue_name` and
  `core.brand_venue_info` through a data release (item 5), after migration 052 is on production.
- **Club rosters** (the players of each NBA, NFL and CFL club season, `core.roster_stint`): NBA and CFL from Wikidata P54 and the Roster tables of
  club-season articles on English Wikipedia, NFL from nflverse's `roster_<season>.csv` (its ESPN and Pro Football Reference id columns are dropped at
  download and never stored). Fetch, load and build order are in `scripts/rosters/README.md` (build steps 179 and 181; the roster table on a club's
  season page reads `api.team_season_roster`, migration 093, for leagues with no player statistics).
- **Player season statistics, NBA and NFL** (`core.player_season_stat`, groups `basketball`, `passing rushing receiving defense kicking punting`): NBA from the
  "Player statistics" tables of the club-season articles on English Wikipedia (CC BY-SA 4.0; `source_key` is `enwiki:<title>@<revision id>`, `stat_basis` says whether the
  numbers are totals or averages), NFL from nflverse's `stats_player` files (CC BY 4.0, 1999 on, one line per club). Fetch, load and build steps, the order and the release
  split are in `scripts/player_stats/README.md`. A line is placed only through a Wikidata number or the NFL's gsis id and a roster stint, never on a name.
- **The NFL from 1920 (the APFA in 1920-21), the AFL (1960-1969) and the AAFC (1946-1949)** come from English Wikipedia (CC BY-SA 4.0): each season article, its standings templates and every
  club's season article, fetched and parsed by `scripts/nfl/season.py [--league afl] YEAR` into `legacy_wikipedia_nfl` / `legacy_wikipedia_afl` (migrations 054, 109), the raw wikitext
  archived first (`wikipedia-<league>/<year>/...`). `db/build/151` builds games, standings, franchises and names, `165` and `166` the champions, `178` the alignment.
  The AFL is its own league (`afl`: `core.season` is one row per league and year) whose clubs are today's franchises (`core.franchise_league` gives each `afl` to 1970-03-01, `nfl` after);
  clubs that only existed before today's 32 are franchises of their own (`db/seed/nfl_club.csv` says which name is which franchise in which years). The 1966-69 Super Bowls join two leagues and are not
  loaded; each league's last playoff game is its own championship game. The AAFC (1946-49, `scripts/nfl/season.py --league aafc` into `legacy_wikipedia_aafc`, migration 111) is a league of its own the same way: the Browns and the 49ers are today's franchises and the original Colts the franchise of the 1950 Colts, each with an `aafc` membership to 1950-03-01; its other clubs are franchises of their own (`AAFC*` keys in the seed), and AAFC records are never added to NFL records. Standings that do not agree with the games
  (the 1920s tables count games against clubs outside the league) are logged in `meta.data_issue` and left out, as for 1973-98.
- **The NHL's rival and predecessor leagues** (NHA 1909-10 to 1916-17, PCHA 1911-12 to 1923-24, WCHL and its last season as the WHL 1921-22 to 1925-26, WHA 1972-73 to 1978-79) come from English Wikipedia
  (CC BY-SA 4.0): the season articles, their standings templates, the league articles' tables of seasons and histories, a few club articles, fetched and parsed by `scripts/hockey/season.py LEAGUE`
  into `legacy_wikipedia_hockey` (migration 113, one `league` column), the raw wikitext archived first (`wikipedia-hockey/<league>/<year>/...`; `season.py --extras` archives the league and club articles).
  `db/build/154` builds them: each is a league of its own (`nha`, `pcha`, `wchl`, `wha`), never counted in the NHL's; their clubs that played on are one franchise across leagues (`db/seed/hockey_club.csv`
  says which club name is which franchise: the Canadiens, Wanderers, Senators and Bulldogs in the NHA, the WHA's Oilers, Whalers, Nordiques and Jets, the Millionaires/Maroons, Aristocrats/Cougars,
  Metropolitans, Tigers and Eskimos of the PCHA and WCHL). Standings and champions for every season, games where the articles tabulate them (the NHA's and PCHA's regular seasons and playoffs, the WCHL's playoffs),
  playoff series told as results in `core.series`. A Stanley Cup challenge or final stays in `core.cup_series` and the NHL's own season, and a game between clubs of two leagues (an interlocking PCHA-WCHL game)
  is in neither league's games (so none is counted twice). The champions come from the league article's table (a season's infobox may name the regular-season winner), not from the games (165 skips these leagues).
  Step 154 merges the NHL API's two franchises for the Millionaires and Maroons (VMI, VMA): run it again after any rerun of 145. A rival league has a parent (`PARENT` in `web/src/lib/leagues.ts`):
  no menu entry of its own, the parent's page lists it under "Other leagues", its pages carry the trail "NHL > PCHA > 1919-20", addresses `/pcha/...`.
- **College football** (NCAA Division I-A, the FBS from 2006; league `ncaaf`, 2000 on; John, 2026-10-28) comes from English Wikipedia (CC BY-SA 4.0): the season articles, their conference
  standings templates and every team-season article's schedule, fetched and parsed by `scripts/ncaaf/season.py` into `legacy_wikipedia_ncaaf` (migration 159), the raw wikitext archived first
  (`wikipedia-ncaaf/<year>/...`). `db/build/230` builds games (regular season, conference championship games, bowls as `playoffs`), standings, conferences, divisions, the national champion and
  the programs as franchises; games against FCS teams are kept (the opponent is a franchise outside the league's membership). CollegeFootballData is a cross-check only (`db/build/231`,
  `meta.verification` and `meta.data_issue`, no value copied, no ESPN id stored). The site shows Wikipedia's data. See `scripts/ncaaf/README.md`.
  On the site (0.164.0) it is its own menu entry after the NFL (a family of one in `leagueFamilies.ts`, not a PARENT child), never added to the NFL's records. The FCS opponents are teams of no list: `OUTSIDE_CONFERENCE` (`lib/leagues.ts`) names the pseudo conference, `lib/leagueMembers.ts` keeps them out of /teams, the search, `/api/teams`, the sitemap and the lineage, and standings, alignment, leaders and all-time leave that conference out; a link to one lands on a page that says plainly it is outside the league. The postseason is told as games (`NO_SERIES`: no series or bracket pages), each with the name `api.game_round` gives (migration 161, `core.game.round_label`); `lib/postseason.ts` groups them. Every page of the league carries the Wikipedia credit (`components/NcaafCredit.tsx`). No player data: `NO_PLAYERS`.
- **CFL club leaders** (the Passing, Rushing and Receiving tables of about 70 club-season articles, mostly 2002-11 and 1960-86, and the BC Lions' 1958-81 "Offensive leaders" table; John, 2026-10-29) come from English
  Wikipedia (CC BY-SA 4.0), fetched by `scripts/cfl_leaders/fetch.py` (`scan` the cached club articles, `articles`, `titles`: the Wikidata item of every linked player article), read as the articles write them by
  `scripts/cfl_leaders/parse.py` into `legacy_wikipedia_cfl_leaders` (migration 174, DS1 only; raw archived first under `wikipedia-cfl-leaders/`). `db/build/238` writes `core.team_season_leader` (migration 175,
  `api.team_season_leader`; the source key is `enwiki:<title>@<revision id>`). **A name links to a player only where the match is certain**: the article it links to is a Wikidata item that is a person of
  `core.external_id` (a merged item followed), or exactly one player of that club's roster that season has the name and he is not another item than the one linked; never the name alone. Every other name stays
  text, in its place, and each club season with such names is one `meta.data_issue` row (`cfl_leaders`). `bash db/tests/cfl-leaders.sh` tests it on scratch. The site draws the section on a CFL club's season
  page (`components/ClubLeaders.tsx`) and hides it while the view is missing or empty.
- **MLB's rival and predecessor leagues** (the National Association 1871-75, the American Association 1882-91, the Union Association 1884, the Players' League 1890, the Federal League 1914-15;
  `na`, `aa`, `ua`, `pl`, `fl`; John, 2026-10-26, `docs/baseball-family.md`) come from the Retrosheet game logs, which carry each game's league. `db/build/139` adds the leagues (parent `mlb`), `db/build/140`
  puts every game and team season in the season of its own league and gives each franchise one `core.franchise_league` row per league, never counted in MLB's records. The National Association is
  not recognised by MLB as a major league (a note on its pages). A club that played on is one franchise across leagues: `db/seed/baseball_club.csv` folds a second Retrosheet team id into the first
  (the Cardinals' AA years are logged as SL4 beside SLN, then Louisville, Washington, the Cleveland Spiders, the Boston Reds, Baltimore) and gives BR4 from 1890 its own club (the Brooklyn Gladiators,
  not the Dodgers). The pennant of a league of its own is its championship (`mlb_pennant_na` ... `mlb_pennant_fl`, step 167); the World's Championship Series 1884-90 stay in MLB's season.
  A database built before this is split in place by `db/build/pending/baseball_family_repair.sql` (every id stays), then 140 is rerun; `db/checks/102` watches it.
- **Minor-league hockey** (the AHL, 1936-37 to 2025-26, `ahl`; John, 2026-10-28: every Canadian and American league, one league at a time) comes from English Wikipedia (CC BY-SA 4.0): each
  season article's standings (with the NHL club(s) each club was affiliated with), its Calder Cup bracket or sentences, and the playoffs article's {{NHLPlayoffs}} games, fetched and parsed by
  `scripts/hockey_minor/season.py LEAGUE` into `legacy_wikipedia_hockey_minor` (migration 158; one `league` column, so the next league needs no migration), the raw wikitext archived first
  (`wikipedia-hockey-minor/<league>/<year>/...`). `db/build/229` builds the seasons, franchises (`db/seed/hockey_minor_club.csv`: a renamed or relocated club is one franchise, as the league
  article's list of teams tells it), standings, playoff series (core.series, as a result), the games an article writes out and the Calder Cup champions (the infobox; none in 2019-20 and
  2020-21); divisions and conferences come from step 178, and step 165 leaves the league alone. The AHL is a league of its own, not a child of the NHL (no `PARENT`), and none of its clubs is
  the franchise of its NHL affiliate. No article tabulates a regular season, so no regular-season game exists. `bash db/tests/ahl-from-wikipedia.sh`; parser tests
  `python3 -I -m unittest discover -s scripts/hockey_minor -p 'test_*.py'`. The link to the NHL is `core.team_season_affiliation` (migration 160, `api.team_season_affiliation`), built by
  `db/build/232` from the standings' affiliation column: a code is placed on an NHL franchise only when exactly one NHL franchise's identity carries that abbreviation that season, else it keeps its
  label with no parent and is logged in `meta.data_issue` (`bash db/tests/ahl-affiliation.sh`, `db/checks/104`). The site shows the league on `/more-hockey` ("More hockey": minor and junior leagues by
  level, `MORE_HOCKEY_LEVEL` in `web/src/lib/leagues.ts`; one link under the NHL in the menu; no menu entry and no `PARENT` for the leagues on it), a club's NHL parent on its pages and in the season's
  standings, and an NHL club's farm teams on its page. The next league is one more line in `MORE_HOCKEY_LEVEL`.
  **The ECHL** (`echl`, 1988-89 to 2025-26, the East Coast Hockey League until 2002-03; the second league) is the same pipeline: `season.py echl`, `db/build/233` (franchises from the league article's
  timelines and list of defunct teams: the first Cincinnati Cyclones became the Birmingham Bulls and the Atlantic City Boardwalk Bullies, the second began as the Louisville RiverFrogs), `178` and `234`.
  The articles give the champion in an infobox only from 1999-2000 (the league's list of seasons names the others), the bracket as a template, a template page (`{{2013 Kelly Cup Playoffs}}`), game blocks
  or game tables, so the series come from whichever the season has; the column the 1996-97 to 2000-01 tables head T counts overtime losses (the league had no ties) and is read so. The champion is the
  Riley Cup's until 1995-96 (one award, `echl_kelly_cup`). 234 places the NHL parent from the article the standings cell links to (`affiliation_links`, migration 163), the label of a placed club being
  its abbreviation that season; the AHL parent is not loaded (the articles name it only where it changed; the table can hold it after the NHL clubs with `parent_league_code` `ahl`).
  `bash db/tests/echl-from-wikipedia.sh` (it builds an NHL from `db/tests/echl-nhl-fixture.sql`).

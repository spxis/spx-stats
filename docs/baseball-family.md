# The baseball family: proposal

Ticket cmvf25bw10002l8066p4gigqr. Status: built for the five 19th and early 20th century leagues (section 6). The Negro leagues (section 4) are not built.
John decided on 2026-10-26: all of 1 to 4 as recommended in section 5, and decision 5 as recommended but not in this run.
Facts below were read on 2026-10-25 from production's public `api`/`core` tables and from the Retrosheet files already archived in Dropbox
(`raw/retrosheet/2026-10-10`). DS1 may differ a little.

## 1. What is there today

- `ref.league` holds one baseball row, `mlb`. **Everything from 1871 on is in it**: step `db/build/140_mlb_from_retrosheet.sql` puts every Retrosheet
  game into a `core.season` of league `mlb`, whichever league the game was played in. MLB shows 156 seasons (1871-2026).
- Retrosheet's game log carries the league of both clubs (`legacy_retrosheet.game_log.home_league`, `visitor_league`). Before 1997 a game never
  joins two leagues, so the split is clean at game level. (Interleague play from 1997 stays AL v NL, both MLB.)
- Folded into `mlb` today, by league (games, team seasons, seasons):

  | League | Code | Years | Games | Team seasons | Clubs |
  |---|---|---|---|---|---|
  | National Association | `na` | 1871-75 | 1,081 | 50 | 26 team ids |
  | American Association | `aa` | 1882-91 | 5,039 | 85 | 26 team ids |
  | Union Association | `ua` | 1884 | 428 | 12 | 12 |
  | Players' League | `pl` | 1890 | 532 | 8 | 8 |
  | Federal League | `fl` | 1914-15 | 1,243 | 16 | 9 team ids |
  | **Total moved** | | | **8,323** | **163** | |

  After the split `mlb` holds 151 seasons (1876-2026, the NL then NL+AL).
- Things that hang off those team seasons and must follow them (production counts, 1871-91 and 1914-15): roster stints 449, player season
  stats 9,636, team season stats 326, award winners 57, venue-game rows 320, team-season cities 324. They point at `team_season_id`, so they
  move for free if the team seasons keep their ids.
- The pennants are already separate awards (`mlb_pennant_na/nl/aa/ua/pl/fl`, step 167, seed `db/seed/mlb_pre1903_champion.csv`).
- **Defect found while checking (not part of the ticket text): clubs that continued are not one franchise.** Retrosheet's game logs use
  one team id for the club's American Association years and another for its National League years, and step 140 turns every id that is not in
  Retrosheet's `CurrentNames.csv` into a franchise of its own. Verified on production: the St. Louis Cardinals' 1882-91 American Association
  seasons sit under a ghost franchise 1610 ("St. Louis Cardinals", `SL4`), while the real Cardinals franchise 1486 has an identity from 1882 and
  team seasons only from 1892. Same for: Louisville (`LS2` 1538 / `LS3` 1625), Washington (`WS9` 1632 / `WSN` 1574), Cleveland Spiders
  (`CL3`, 1887-88 / `CL4` 1564), Baltimore (`BL2` 1627, `BL3` 1544 / `BLN` 1613) and the Boston Reds (`BSP` Players' League 1890 / `BS2` AA 1891).
  Cincinnati (`CN2`), Brooklyn (`BR3`, `BR4`) and Pittsburgh (`PT1`) are already right.

## 2. The model (the way the NHA, WHA, AFL and AAFC are done)

- Five new leagues in `ref.league` / `ref.league_name`: `na`, `aa`, `ua`, `pl`, `fl` (sport baseball, country US; the Retrosheet codes), all
  closed, **parent `mlb`** (`PARENT` in `web/src/lib/leagues.ts`), single-year seasons. No menu entry; MLB's page lists them under "Other leagues".
- **Ids are kept.** The split is done *in place*: each game, team season, series and award winner gets the `season_id` of its new league season
  (`update ... set season_id`), so every `game_id`, `team_season_id` and `franchise_identity_id` stays. Only the new `core.season` rows are new.
  A one-time repair file (`db/build/pending/`, like `venue_id_repair.sql`) does the move on DS1; the rerunnable steps are changed so a rerun
  gives the same result.
- **Step 140 becomes league-aware**: a game's season is `(league of its clubs, year)`, `team_season` is keyed by franchise and that season. Without
  this a rerun of 140 would put the games back into `mlb` and create duplicate team seasons. Steps 140_resumed, 155, 165 (skips rival leagues),
  167, 178, 181, 184, 185_team_season_stat, 199, 209, 222 and the `175_*` brand steps join on `league_code = 'mlb'` and a year; each is checked.
- **Franchise membership by league**: `core.franchise_league` gets one row per league a club played in, taken from the game logs (no overlap, so
  the exclusion constraint holds): e.g. Cardinals `aa` 1882-1892, `mlb` 1892-; Braves `na` 1871-1876, `mlb` 1876-; Dodgers `aa` 1884-1890, `mlb`
  1890-. The league's clubs that played on are *one franchise across leagues*, from a seed `db/seed/baseball_club.csv` (team id -> franchise,
  like `hockey_club.csv`); the ghost franchises above are folded into the real one (every foreign key repointed; the duplicate franchise and its
  identity rows go, all team season, game and identity ids stay).
- **Champions**: each league's own pennant winner (step 167 data, now with the league's code). The World's Championship Series (1884-90, NL v AA
  or PL) and the 1892 split-season playoff stay in `mlb`'s season as the "Championship before the World Series" award, the way a Stanley Cup
  challenge stays in the NHL's season; the winner may be an AA club (St. Louis Browns 1886). Games of those series are not in the Retrosheet logs.
- Site: `leagues.ts` (codes, names, `closed`, `PARENT`, `TWO_YEAR_SEASONS` unchanged), `leagueFamilies.ts` (`mlb` family members
  `["mlb","na","aa","ua","pl","fl"]` so the chips and the heat strip show them, tints in `heatCellColor`), `RELATED_LEAGUES` is derived (a club
  page points to its seasons in the other leagues), `cups.ts`/`roundWords.ts`/`series.ts`/`seriesCopy.ts` entries as for the AAFC, a season note
  per league (`db/seed/season_note.csv`), `pnpm test:rivals`/`test:families`/`test:routing`. Child league pages need no new route: the AAFC
  pages are generic over `[league]`.

## 3. What a reader sees change

- `/mlb`: 151 seasons instead of 156; "Other leagues" lists NA, AA, UA, PL, FL with years, seasons and champions.
- `/aa/1886`, `/na/1873`, `/pl/1890`, `/fl/1915`... : own standings, games, champion, trail "MLB > AA > 1886".
- `/mlb/1884` shows the NL only (8 clubs, 457 games); today it shows 33 club seasons and 1,544 games.
- A club page (Cardinals, Reds, Dodgers, Pirates, Braves, Cubs...) shows its AA/NA seasons as seasons in the related league.
- **MLB all-time and franchise records no longer include those years** (see decision 2).

## 4. The Negro leagues (research only; nothing to build yet)

MLB recognised seven Negro leagues as major leagues in December 2020: Negro National League I (1920-31), Eastern Colored League (1923-28),
American Negro League (1929), East-West League (1932), Negro Southern League (1932 only), Negro National League II (1933-48), Negro American
League (1937-48).

| Source | Tier | What it gives | Verdict |
|---|---|---|---|
| **Retrosheet Negro Leagues** (`retrosheet.org/NegroLeagues/`, `downloads/negroleagues.zip`, `allngldata.zip`) | green: same source, same notice as the MLB logs ("The information used here was obtained free of charge from and is copyrighted by Retrosheet."; "free to make any desired use") | game-level CSVs (gameinfo, teamstats, batting, pitching, fielding, plays, allplayers) for 8,214 games as of the Summer 2026 release; seasons 1933-1949 so far (NNL II 1933-48 whole, NAL 1937-49), earlier years (1920-32) only as notable games, adding backwards each release; "incomplete" by their own words; stat lines tagged value/lower/upper | **use**, as `legacy_retrosheet_negro`; the NNL II and NAL 1937-48 can be loaded now |
| English Wikipedia (CC BY-SA 4.0) | green | league and club articles; the NNL I article has a pennant-winner table 1920-31 but no standings table; season standings sit in the "<year> in baseball" articles | champions and clubs for 1920-32, via `scripts/mlb_early`-style fetch |
| Seamheads Negro Leagues Database | no licence found; page says "All data, copyright 2011-2023 Agate Type Research LLC", no terms page | the reference dataset (standings, players, stats 1920-48) | **do not store**; grey at most. Needs John's yes after an email to the maintainer asking for terms |
| Baseball-Reference / Sports Reference | banned (AGENTS.md section 3) | the same Seamheads data | never |

Plan: the recognised leagues as leagues under MLB (parent `mlb`) with codes `nnl` (I) and `nnl2` (II), `ecl`, `anl`, `ewl`, `nsl`, `nal` (decision 5). Loaded after the first split, from Retrosheet 1933-49
first, Wikipedia for the champion list and the clubs before that. Standings would be computed from the games where games exist and left empty
where they do not (holes are fine). It is a separate ticket after decisions 1 to 5.

## 5. Decisions for John

1. **Is the National Association part of the MLB family?** MLB's own list (1969 committee) does not call it a major league; Retrosheet and the
   site do today. Options: (a) its own league `na`, child of MLB, shown under Other leagues with a note "not recognised by MLB" **(recommended)**;
   (b) drop it from the family and show nothing; (c) leave it inside `mlb` (no split for 1871-75).
2. **Records of continuing clubs.** After the split a club's MLB record counts only its `mlb` seasons, as the AAFC's never join the NFL's. The
   Cardinals, Reds, Dodgers and Pirates would lose their AA decade from the headline record, the Braves and Cubs their NA years. Options: (a)
   strict, AA/NA years shown as seasons in the related league only **(recommended: one rule for every family)**; (b) AA/UA/PL/FL (MLB-recognised)
   count in MLB's totals, NA does not; (c) both totals shown (MLB-only and "with other leagues").
3. **The World's Championship Series 1884-90.** Option (a) stays in `mlb`'s season as now **(recommended)**; (b) makes its own `core.series` rows in
   a league `wcs`; (c) drop it.
4. **Fold the ghost franchises** (section 1: Cardinals first, then Louisville, Washington, Cleveland, Baltimore, Boston Reds) in the same
   release **(recommended: it is what "clubs that continued share a franchise" asks, and the Cardinals case is a plain defect)**, or leave them for
   a separate ticket. Baltimore (`BL2` 1883-89 v `BL3` 1890-91) needs a Wikipedia check before it is merged.
5. **Negro leagues: names and shape.** One league per MLB-recognised league (`nnl` for 1920-31 and `nnl2` for 1933-48, `ecl`, `anl`, `ewl`, `nsl`,
   `nal`) with a family parent `mlb` **(recommended)**, or a single `negro` family of its own beside MLB. Also: may I email Seamheads for terms (no data
   is stored meanwhile)?

If the answer to 1, 2, 3 and 4 is "recommended", the build is: migration (new leagues and names), step 140 and the steps in section 2 made
league-aware, `db/seed/baseball_club.csv`, one repair file for DS1, `db/checks` for "no team season of a rival league in `mlb`" and "game
league equals season league", a test on scratch that a second run changes 0 ids (`db/checks/093`), then the site changes. The tied-series ticket
(`api.season_summary` champion pick, 1885 and 1890) touches the same view: do it first or together.

## 6. As built

- `db/build/139_baseball_leagues.sql` (the leagues and their names), `db/build/140_mlb_from_retrosheet.sql` (league-aware, fold-aware), `db/seed/baseball_club.csv` (the folds), `db/build/167` (the pennants are the
  championships of their own leagues), `db/build/pending/baseball_family_repair.sql` (the one-time move on DS1, every id kept), `db/checks/102_baseball_family.sql`. Steps 155, 175 (three files), 176, 178, 179, 181, 184, 185,
  198, 199 and 222 and checks 062 and 092 know the five leagues; the family rule of 175 and the home-venue steps give a rival-league club its MLB name too.
- **Found while building (not in the proposal): Retrosheet's names file gives the id BR4 to the Dodgers' 1888-89 years, but the game logs use BR4 for the Brooklyn Gladiators of the 1890 American Association.** Step 140 filed
  those 100 games under the Dodgers, so the Dodgers' 1890 team season held 129 National League and 100 American Association games. The Gladiators are now a franchise of their own (`BR4`, seed row with a year).
- The National League pennant is MLB's champion in 1882, 1883 and 1891 as well now (MLB's season holds the National League alone; the American Association has its own champion).
- Records of continuing clubs count only their MLB seasons (decision 2): the Cardinals, Reds, Dodgers and Pirates lose their AA years from the MLB headline, the Braves and Cubs their NA years; each league's page and the
  club's "other leagues" table show them.
- Also folded, found by `db/checks/102` (same club name, one league's last year the next league's first): the St. Louis Maroons (UA 1884, NL 1885-86), the Hartford Dark Blues, the Philadelphia Athletics, the St. Louis Brown Stockings
  and the New York Mutuals (each NA, then NL 1876), and Baltimore's first American Association season (`BL5`, a team id the names file does not list). Two NA clubs called Washington Nationals (1872, 1873) are left as two.
- A World's Championship Series winner that played in the American Association keeps its row in MLB's season and points at its team season in the AA's season (step 167).

# College football (NCAA FBS and FCS): proposal

Ticket cmveusfgn0008kw06569ggz2p. Status: proposal, waiting on John's decisions (section 8). Nothing is built, fetched in bulk or written to DS1 or production.
Facts were read on 2026-10-25: the local DS1 working copy (read only, `legacy_spx`), production (read only: size and counts), twelve sample
English Wikipedia pages (one request every 3 s, kept outside the repository), and the repository. DS1 may differ a little.

## 1. What is there today

- **SPX holds some college football** (`legacy_spx`, sport 18 "NCAA Football", leagues 6 = Division I-A and 110 = Division I-AA; no `core` build uses it):

  | Part | Games |
  |---|---|
  | 2003 regular season (I-A) | 944 |
  | 2005 regular season (615 I-A, 61 I-AA) | 676 |
  | Bowl games, seasons 2003 and 2005 to 2010 (28 to 35 a year) | 223 |
  | **Total** (all have a final score; 33 are cancelled rows) | **1,843** |

  240 distinct teams (237 look like colleges). **2004 has nothing; 2006 to 2010 have bowls only, no regular season**, and 2011 on is absent. The 2003-04 CSV
  schedules in `Data/cfb` (`docs/spx-extras-inventory.md`) are said to repeat these rows; I did not open them. SPX's value wins where it has one (AGENTS.md section 3).
- **`legacy_cfbd.game`** already exists as a parser target: `scripts/grey/cfbd.py` and migration 154 (ticket cmveusf6k0007kw06f34fcddt). It is written against samples; no real
  answer has been seen because John has not created the key. CollegeFootballData.com is a registry row, tier green, `key_needed` (`scripts/daily/sources.py`).
  `stats.ncaa.org` is grey (`ncaa_stats`).
- **No `ref.league` row, no `core.season`, no site page** for college football. The `core` model is already general enough: `core.season` (league and year),
  `core.conference` and `core.division` with `team_season.conference_id/division_id`, `core.franchise` / `franchise_identity` / `franchise_league`, `core.award_winner` for champions,
  `team_season.final_rank` for a final poll rank. Step 178 (alignment) and the standings templates already work this way for the NFL.
- **Production is 395 MB** (release stop 450 MB, plan limit 500 MB): **55 MB of room before the release tool refuses**, and the soccer data (about 38 MB, `docs/storage-plan.md`)
  is still to come. This is the real constraint on scope (section 6).

## 2. Sources

| Source | Tier | Use | Notes |
|---|---|---|---|
| English Wikipedia, CC BY-SA 4.0 | green | **source of record**: season articles, conference-season articles, team-season articles, the national-championship list | credit; `source_key` is `enwiki:<title>@<revision id>` |
| SPX (`legacy_spx`) | base | 2003, 2005 and bowls 2003 to 2010 | SPX wins where it holds a value |
| CollegeFootballData.com API | green, free key | **cross-check and gap fill**, 2000 on (where its coverage is good; check on a first sample) | John creates the key (`NEED FROM YOU` below). Credit line "Data provided by CollegeFootballData.com". **I did not read its terms**: the registry says "no bulk redistribution", so the safe reading is verification rows plus the few values Wikipedia lacks (neutral site, attendance), never a copy of its dataset. John or the terms check confirms before more |
| `stats.ncaa.org` | grey | last resort for a hole, 2000s on; through the daily cap (20 a day) only | session and bot checks make it a poor bulk source |
| ESPN, Sports Reference (`sports-reference.com/cfb`, `fbref`) | banned | never | Wikipedia's schedule templates carry `source = [espn.com/...]` links and its articles cite Sports Reference: the parser must drop those addresses and never fetch them (same rule as the NHL links) |

What I saw in the samples (one request each, wikitext):

| Page | Size | What it holds |
|---|---|---|
| `2023 NCAA Division I FBS football season` | 142 KB | conference standings as **templates** (`{{2023 Big Ten Conference football standings}}`), bowl and CFP sections, FCS-over-FBS wins; no schedule |
| `2003 NCAA Division I-A football season` | 36 KB | infobox with `champions = LSU`, `ap_poll = USC` (the split title), number of bowls (28) |
| `1936 college football season`, `1978 ... Division I-A ...` | 30 and 57 KB | standings, bowls, AP final poll, week by week results; 1936 has "major" and "minor" conferences |
| `2023 Michigan Wolverines football team` | 183 KB | `{{CFB schedule entry}}` per game: date, opponent link, site, `score = 30-3`, attendance, `nonconf`, a `source` link to ESPN |
| `1978 Michigan Wolverines football team` | 64 KB | the same `{{CFB schedule}}` template |
| `2023 Big Ten Conference football season` | 207 KB | `{{CFB Conference Schedule Entry}}` week by week (conference games and games of its teams) |
| `1978 Big Ten Conference football season` | 22 KB | dated results, co-champions in the infobox |
| `List of NCAA Division I FBS football programs` | 77 KB | about 135 current programs, transitioning programs, "Former programs" |
| `College football national championships in NCAA Division I FBS` | 404 KB | yearly table of the NCAA's "major selectors" from 1869, a "Split national championships" section, BCS and CFP game lists |
| `2023 NCAA Division I FCS football season` | 62 KB | same shape as the FBS season article |

The **complete schedule of a team is only in its team-season article**; a conference-season article lists only the games of that conference's teams.
A game between two articled teams appears twice, which is a free cross-check (the two sides agree or `meta.data_issue` says they differ).

## 3. Scope options (decision 1 and 2)

Rough sizes (games with an FBS team; 133 FBS teams in 2023 playing about 12.5 games, 117 in 2003; about 800 to 880 games a year with bowls and the FCS opponents each team plays):

| Option | Seasons | Team seasons | Games | Wikipedia fetches | Production size* |
|---|---|---|---|---|---|
| **A. FBS from 1978** (the I-A era, SPX's own leagues) | 48 | about 5,800 (+ guests, below) | about 40,000 | about 6,400 team articles + 150 | about 15 MB |
| B. A + FCS (I-AA) from 1978 | +48 | about +5,200 | about +33,000 | about +5,800 | about +13 MB |
| C. FBS from 1936 (the AP poll era; "major college" then) | 90 | about 9,500 | about 62,000 | about 10,000 | about 23 MB |
| D. everything from 1869 | 157 | 15,000+ | 100,000+ | 14,000+ | 35 MB+ |

\* 290 bytes a game with indexes (`core.game` is 103 MB for 357k games on production) plus team seasons, game venues and the `api` views. Measure on DS1 before the release.
At the project's pace (2.5 s a request) 6,400 fetches take about 4.5 hours; spread over several nights.

Before 1978 "FBS" did not exist: the NCAA's "FBS records" include earlier major programs retroactively, and Wikipedia mixes "major" and "minor" conferences in one article. That is why A is the clean start.

**Recommendation: A first (FBS, 1978 to now), FCS as a second step (B), 1936 and earlier only on a later, separate yes.**

## 4. League model (decision 3)

- **Two leagues, `fbs` and `fcs`**, both top-level choices in the data, `fcs` with parent `fbs` in `leagues.ts` (`PARENT`), so the menu has one "College football" entry and the page lists FCS under
  "Other leagues" (the AFL and AAFC pattern). Reason: the two subdivisions have their own season, standings and champion, and `core.season` allows one champion and one row per league and year.
  SPX filed them as two leagues too (6 and 110). Programs that moved up (Appalachian State, James Madison, Liberty...) are **one franchise across leagues**, with a `core.franchise_league` row per stretch.
- **Conferences stay conferences, divisions stay divisions** (SEC East and West, Big Ten East and West, Pac-12 North and South, ACC Atlantic and Coastal): the native two levels. "Conferences as divisions" would lose the real division and
  make 130 teams one flat list. Independents (Notre Dame, Army, BYU for years) have no conference; the page shows them as a group, no pseudo-conference row. Conferences keep one `core.conference` row across renames
  (Pac-10 to Pac-12, Big East football to the American, WAC), through the canon table in step 178.
- **FBS games against lower-division opponents** (about 100 to 130 a year; 14% of the games) belong to the **FBS season**, and the lower-division opponent gets a franchise and a *guest* team season in that
  season (no conference, left out of the standings tables). Dropping them (the interlock rule of the hockey rivals) would give every FBS club a wrong record (an FCS opener is one of its 12 games).
  About 6,000 guest team seasons over 48 years. When `fcs` is loaded the same franchises get real FCS seasons, and the FBS-v-FCS game stays in the FBS season.
- **A club is a program**, not a nickname: `db/seed/cfb_club.csv` (Wikipedia team-article title and years to franchise, like `nfl_club.csv`) covers the 135 current and about 60 former or moved programs.
  Article titles change with nicknames (Ole Miss Rebels, Hawaii Warriors to Rainbow Warriors and back, UMass); the seed, not the name, decides. About 190 FBS-era franchises, about 450 guests.
- **Champions.** The season's champion award is the title of its era (BCS or CFP game winner, 1998 on and the 1992 to 1997 coalition and alliance games; the AP poll winner before that); the other selectors (AP poll, Coaches poll)
  are separate awards, like the pennants in step 167 (`mlb_pennant_*`). **A split title is two award winners in one season** (2003: LSU by the BCS game and Coaches poll, USC by the AP poll). Retroactive claims by schools
  (the "National championship claims" section) are not loaded: hundreds of them, not facts a reader can check. Conference champions: from the standings templates and the conference title game; the awards table has no
  conference dimension, so either one award per conference or a small `core.conference_champion` table (builder decides in step 1, small either way).
- **Bowls and the playoff.** Every bowl, the BCS title game and each CFP game is a **`core.game`** in the postseason with a bowl name (a small `core.bowl` list: lineage by Wikipedia article, sponsor names are per-year text because
  "MPC Computers Bowl" and "Boise State/Idaho Potato Bowl" are one lineage), the way an NFL playoff game is a game. The CFP (4 teams 2014 to 2023, 12 teams from 2024) is drawn by `taisen-brackets` from
  its games (`bracketLayout.ts`), no hand-drawn SVG. About 40 bowls a year; 1,843 SPX games include 223 bowl games to check against.
- **Out of scope** until later tickets: players and rosters (the NFL pages have no college link yet), the AP poll tables (only `team_season.final_rank` from the final poll), awards (Heisman), recruiting, the transfer portal.

## 5. How it would be built (phases)

0. **Decisions** (section 8), and John creates the CollegeFootballData key.
1. **Pilot, FBS 2003 to 2010** (about 960 team articles, about 6,500 games; SPX covers the 2003 and 2005 regular seasons and the bowls of 2003 and 2005 to 2010, so the Wikipedia parse is checked against 1,843 SPX games).
   Migration (`fbs` in `ref.league` and `league_name`, `core.bowl`), `scripts/cfb/` (fetch, parse, tests offline on short samples written in the articles' own shape), the `legacy_wikipedia_cfb` schema,
   `db/seed/cfb_club.csv`, a build step `db/build/NNN_cfb_from_wikipedia.sql` that keeps ids on a rerun (`spx-build-step-ids`), alignment from the standings templates (`scripts/alignment/`),
   champions, then 165/166/172/175/178/183/190/191/192/209 and `db/checks/051` to `053`. SPX rows enter as the base where they exist.
2. **FBS 1978 to 2002 and 2011 to 2025** (about 5,400 more articles). Verification rows where two articles or CFBD agree; `meta.data_issue` where they differ.
3. **FCS 1978 to now** as league `fcs` (guest team seasons become real).
4. **Daily scores and cross-check**: the daily job gets `fbs`: one request asks the revision ids of all ~135 team articles at once (50 titles per call, 3 calls), then it reads only the changed
   ones; CFBD (one games call a day, inside a free key's monthly limit, which I have not confirmed) is the second source. Off-season it does nothing.
5. **Logos and venues**: about 190 program logos (brand rows 175, Commons first, fair use elsewhere, `/logos`), home venues through the Wikidata venue steps (176, 198, 199).
6. **Pre-1978** (1936 on), only on a separate decision.

Site work (`spx-site-page`) is mostly generic by league code: `LEAGUE_CODES`, `ALL_LEAGUES`, `LG`, `PARENT` in `web/src/lib/leagues.ts`, a family entry in `leagueFamilies.ts` ("College football" its own
chip, never one family with the NFL or CFL), then the existing league, season, team, game and standings pages. New pieces: a bowl list and a CFP bracket on the season page, a conference grouping in the
standings, "Other leagues" for FCS. English text only; FR and JA from a batch.

## 6. Page weight and production size

- A season page: about 134 team rows and about 850 games. The games reach the client packed (`lib/gamesCodec.ts`, about 40 bytes a game, 35 KB) and only 16 rows are drawn on the server; the standings use
  `StandingsTable` / `useMoreLines`; bowls (about 40 lines) are plain. **Estimate: 120 to 200 KB of HTML, under the 300 KB budget**; to be measured with `pnpm test:weight` on the DS1 preview in step 1.
- A team page up to 48 seasons (the "newest rows, fetch the rest" pattern); a league page the newest 12 champions and 10 seasons (`CHAMP_HEAD`), like the NFL.
- **Risk: `/teams`** sends every franchise once (about 270 today). Adding about 190 programs (not the guests) makes it about 460 rows. Either the board keeps college football behind the league filter
  (fetch when chosen) or the budget is re-measured; decide in phase 1.
- **Production:** 395 MB now, release stop 450 MB. Option A costs about 15 MB and fits; A plus FCS about 28 MB and does not leave room for the soccer release (about 38 MB) without the storage-plan
  steps (`docs/storage-plan.md`, about 119 MB freed). So: FBS releases before FCS, and FCS waits for the storage plan or for John to decide on space.
- Raw archive (DS1 only, not production): about 6,400 articles of 60 to 180 KB is **about 0.5 GB of wikitext** (about 0.1 GB compressed); the Dropbox copy is the larger cost. Nothing is cut: raw is kept as it came.

## 7. Risks

- Wikipedia's tables are hand-edited: scores such as `30-3` with different dashes, "(OT)" and "(2 OT)", forfeits (vacated wins stay results, the article says "vacated" in notes), cancelled and rescheduled
  games, pre-1980s neutral sites. The parser lists what it cannot read in `unparsed`; holes are fine.
- Team-season articles are missing for some old or small programs; their games still come from the opponents' articles (the other side), as the guest model expects.
- Conference moves every year (2024 realignment: Pac-12, Big 12, ACC, Big Ten). Alignment is by season from the standings templates, never from today's membership.
- Tied or vacated results and the ESPN `source` links: dropped, never read or kept.
- A game on both teams' pages with two different dates or scores: kept once, logged as "differs".
- Terms of CollegeFootballData.com not read by me (section 2); `stats.ncaa.org` has no terms found (grey).
- The dependent change in `db/build/140`-style steps: a rerun must not renumber ids (`db/checks/093`), tested on scratch before the hand-off.

## 8. Decisions for John

1. **Scope.** (a) FBS from 1978 **(recommended)**; (b) FBS and FCS from 1978 in one go; (c) FBS from 1936; (d) from 1869. FCS follows (a) as phase 3 either way.
2. **Pilot first?** (a) Pilot FBS 2003 to 2010, checked against SPX, then the rest **(recommended)**; (b) all of 1978 to 2025 straight away (the same parser, one big load).
3. **League model.** (a) `fbs` and `fcs`, FCS a child of FBS, FBS-v-FCS games in the FBS season with guest team seasons **(recommended)**; (b) one league `cfb` with FBS and FCS together (one champion row, one
   standings page of 255 teams; does not fit `core.season`); (c) `fbs` only and drop all games against non-FBS teams (small, but every club's record is off by about one game).
4. **Champions and split titles.** (a) the era's title is the season champion, AP and Coaches polls are extra awards, splits are two winners, school claims not loaded **(recommended)**; (b) show only the era's title;
   (c) also load the NCAA's "major selectors" table back to 1869.
5. **Bowls.** (a) bowls and the CFP as games with a bowl name, the CFP bracket drawn from them **(recommended)**; (b) CFP as series and bowls as games.
6. **CollegeFootballData.com.** (a) create the free key now; use it as the second source and gap fill, credit line, verification rows first **(recommended)**; (b) wait until phase 4. And does "no bulk redistribution" bar us showing its
   attendance and neutral-site values? Until you say, only verification rows are kept.
7. **Production room.** FBS fits (about 15 MB of 55). OK to hold the FCS release until the storage plan frees room?

`NEED FROM YOU:` answers to 1 to 7 (a letter each; the recommended ones are all "a"), and, for decision 6, a free CollegeFootballData.com key: on machine1 or machine2 sign up at collegefootballdata.com,
then store it with the keychain command the private file gives (never paste it in chat).

If every answer is "a": phase 1 is one builder ticket for the pilot (migration, `scripts/cfb`, seed, build step, SPX base, checks, hand-off with the DS1 steps and counts) and a second for the site
(league entry, bowl list, CFP bracket, conference grouping, `/teams` decision).

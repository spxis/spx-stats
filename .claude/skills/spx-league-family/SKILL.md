---
name: spx-league-family
description: Add or change a rival, predecessor or child league in spx-stats (the NHA, PCHA, WCHL, WHA, AFL, AAFC), its family chips, its parent page, its clubs and its cups. Use when a ticket adds a league or a club that played in two leagues, changes PARENT or the family display, or adds a cup or award to a league.
---

# spx-league-family: rival leagues, families and cups

Rules: [AGENTS.md §3](../../../AGENTS.md#3-what-the-project-is), [docs/site-features.md](../../../docs/site-features.md) (dougu-sports, taisen-brackets),
[docs/web-map.md](../../../docs/web-map.md) (`leagues.ts`, `leagueFamilies.ts`). Model data for the NHL's rivals is in [docs/data-sources.md](../../../docs/data-sources.md)
("The NHL's rival and predecessor leagues"); the AFL and AAFC in the same list under "The NFL from 1920".

## Concepts

- **Parent.** `PARENT` in `web/src/lib/leagues.ts` gives a rival or predecessor league its parent: `afl` and `aafc` to `nfl`;
  `nha`, `pcha`, `wchl`, `wha` to `nhl`. A league with a parent has no menu entry of its own (`LEAGUES` drops it).
- **Where it shows.** The parent's page lists it under "Other leagues"; its own pages carry the trail "NHL > PCHA > 1919-20"; its
  addresses are `/pcha/...`. The top menu lists root sports only (commit 28f0ea5).
- **Family.** `web/src/lib/leagueFamilies.ts` (`FAMILIES`) draws the home archive's family rows and chips. Members are listed primary
  first; PWHL, WNBA and NWSL stay in the menu and fold here only. NFL and CFL are never one family. Virtual members `soccer` and `mls`
  are not league codes. Keep the list in the order the chips are read.
- **Each league is its own league.** Its own `core.season` rows (one per league and year), its own champion, its own standings. Its records are
  never added to the parent's records (AAFC records never go into the NFL's; the NHA and PCHA never into the NHL's).

## Checklist

1. **Name the league and its parent** with the reader in mind. Add the `LeagueCode` and the `PARENT` entry in `leagues.ts`; add the family
   member only if the family chip must show it.
2. **Clubs.** A club that played on under a later name is one franchise across leagues: map each club name to its franchise in the seed
   (`db/seed/hockey_club.csv` for hockey, `db/seed/nfl_club.csv` for the NFL, the `AAFC*` keys for the AAFC). A club that only existed in
   the old league is a franchise of its own.
3. **Games.** A game between clubs of two leagues (an interlocking PCHA-WCHL game) belongs to neither league's games, so nothing is counted
   twice. A Stanley Cup challenge or a final stays in `core.cup_series` or `core.cup_final`, in the NHL's season.
4. **Champions.** From the league article's table (a season's infobox may name the regular-season winner), not from the games; step 165 skips
   rival leagues. Each league's last playoff game is its own championship game. The 1966-69 Super Bowls join two leagues and are not loaded.
5. **Standings that disagree with the games** (the 1920s tables count games against clubs outside the league) are logged in `meta.data_issue`
   and left out, as for 1973-98.
6. **Build steps.** Hockey rivals: `db/build/154`, after 145. NFL AFL: `db/build/151`; the AAFC has its own build step (migration 111 loads it).
   Each keeps ids on a rerun
   ([spx-build-step-ids](../spx-build-step-ids/SKILL.md)). Step 154 folds the Maroons (VMA) into the Millionaires (VMI): rerun it after any rerun of 145.
7. **Alignment and brands.** A changed club membership (`core.franchise_league`, a new league, a new parent) reruns `175_team_brand`,
   `175_team_logo_extra`, `175_team_logo_fit` and `175_team_logo_join`; their orphan lines must stay empty. 13 logos once lost their club this way.
8. **Cups.** Drawn by `@johnmorrisdotca/dougu-sports` in `web/src/lib/cups.ts` (server-only); a page receives the markup as data.
   No drawing code in the browser. Credited on `/terms`. Check with `pnpm test:trophies`. A new cup goes through the same path; a
   new bracket through `taisen-brackets` (`bracketLayout.ts`), never a hand-drawn SVG.
9. **Checks.** In `web/`: `pnpm test:rivals`, `pnpm test:families`, `pnpm test:routing` (addresses), `pnpm test:trophies` when cups change.
   On DS1, `db/checks/051` to `053` (finished season without a champion, team seasons without a conference, stale season summary) stay at baseline.
10. **Hand-off.** Name every step in `ds1_steps` in order with the expected counts (leagues, clubs, games, champions), and the release tables
    (`core.season`, `core.franchise_league`, `core.franchise_identity`, `core.team_season`, `core.game`). Pages to check: one season
    page, the parent's page, one club's page.

## Pitfalls that broke things

- A club name that two leagues share is matched through the seed, never by name alone.
- Chip order and labels come from `FAMILIES` (commit 3111687 fixed chips in one place): do not hard-code them in a page.
- Changing a league's parent without a rerun of 175 leaves brand and logo rows pointing at the old club.
- The NHA's, PCHA's and WCHL's playoffs are in `core.series`; a challenge series is not. Keep the two apart.

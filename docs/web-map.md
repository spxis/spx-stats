# Map of web/

Where things live in the site (`web/`, Next.js 16 App Router). Every path below was checked with `ls`. For the rules
behind them, read [AGENTS.md §9](../AGENTS.md#9-the-website). Start with [agent-quickstart.md](agent-quickstart.md).

## App router

- **`src/app/[locale]/`**: every public page, one copy per language (en, fr, ja). The address has no language in it;
  `next.config.ts` rewrites from `src/lib/routing.ts`. [§9](../AGENTS.md#9-the-website)
- **`src/app/[locale]/s/`** (static): served when the address has no query key from `QUERY_KEYS`. Kept a day, refreshed
  after each release. Use it for a page that reads no `searchParams`, `cookies()` or `headers()`.
  [§9](../AGENTS.md#9-the-website)
- **`src/app/[locale]/q/`** (per request): served when the address has a key from `QUERY_KEYS`. Use it for a page
  that reads `searchParams`. [§9](../AGENTS.md#9-the-website)
- **Twin pattern:** a page lives in one of `s/` or `q/` and has a thin twin in the other that passes it `NO_QUERY`
  (`src/lib/noQuery.ts`). Copy an existing twin; `pnpm test:routing` checks the pair.
  [§9](../AGENTS.md#9-the-website)
- **`src/app/[locale]/s/[league]/`** and **`q/[league]/`**: league pages, with `[year]`, `alignment`, `all-time`,
  `awards`, `champions`, `compare`, `head-to-head`, `player`. Game pages sit under `[year]/game/`
  (address builder `src/lib/gamePath.ts`).
- **Other public sections under `s/`:** `about`, `cities`, `city`, `countries`, `country`, `logos`, `mls`, `players`,
  `privacy`, `quality`, `sources`, `teams`, `terms`, `venue`, `venues`, `worldcup`, `soccer`. Under `q/`: `city`,
  `country`, `mls`, `players`, `teams`, `venue`, `worldcup`.
- **`src/app/(dyn)/`**: signed-in pages, drawn per request: `admin/` (with `data`, `logos`, `ops`, `people`, `runs`,
  `tickets`), `login`, `me`, `tickets`. `admin/data` is the release approval page. [§9](../AGENTS.md#9-the-website)
- **Route handlers under `src/app/api/`:** `admin`, `auth`, `locale`, `me`, `players`, `revalidate` (the POST the
  release runner makes), `teams`, `venues`. Public list APIs are `players` and `teams`. [§9](../AGENTS.md#9-the-website)
- **Other route folders under `src/app/`:** `bracket-svg/` (knockout bracket files), `soccer-road/` (World Cup road
  files), `flag/`, `soccer-flag/`, `surface/`, `title-banner/`, `jersey-banner/` (drawn SVG and image routes).
- **Root files:** `layout.tsx`, `error.tsx`, `global-error.tsx`, `not-found.tsx`, `sitemap.ts`, `globals.css`.
  `src/proxy.ts` is the request proxy.

## Data access (`src/lib/api/`)

- **`client.ts`**: the one PostgREST fetch helper (`Accept-Profile: api`). Every new server fetch to the database goes
  through `queuedAtBuild` the same way. [§9](../AGENTS.md#9-the-website)
- **`config.ts`**: `REVALIDATE_DAY` (86400) and `REVALIDATE_HISTORICAL`, and `ALWAYS_STATIC` (the pages that are never
  drawn per request). [§9](../AGENTS.md#9-the-website)
- **`tags.ts`**: cache tags on every fetch; the release runner refreshes them. [§9](../AGENTS.md#9-the-website)
- **`buildShare.ts`**: queues build workers so each read goes out once per build. [§9](../AGENTS.md#9-the-website)
- **`failure.ts`**: turns a database failure into a thrown error (5xx, timeout) or an inline "Couldn't load" note.
- **`schemas.ts`**, **`types.ts`**: Zod schemas and types for the responses.
- **`teams.ts`**, **`teamSeasons.ts`**, **`players.ts`**, **`player.ts`**, **`people.ts`**, **`leaders.ts`**: per-area fetches.
- **`apiResponse.ts`** (in `src/lib/`): the response shape for the JSON routes.

## Routing and query keys (`src/lib/`)

- **`routing.ts`**: `QUERY_KEYS` (every query parameter a public page reads on the server), `PAGE_ROOTS`,
  `PLAYER_CLIENT_KEYS`, `CITY_CLIENT_KEYS`. A key missing here is ignored on a static page.
  [§9](../AGENTS.md#9-the-website)
- **`noQuery.ts`**: the `NO_QUERY` value the twin pages pass. **`queryLink.ts`**: builds links that keep the query.
- **`listQuery.ts`**, **`listParams.ts`**, **`listRange.ts`**: parse and build the `/api/players` and `/api/teams` list queries
  (the only way to build one; never from caller text). [§9](../AGENTS.md#9-the-website)

## i18n (`src/lib/i18n/`)

- **`phrases.constants.ts`**: every UI string (`say('key')`). New text goes here, then into `dictionaries/fr.constants.ts`
  and `dictionaries/ja.constants.ts`. Doubts go in `web/I18N_TODO.md`. [§9](../AGENTS.md#9-the-website)
- **`dictionaries.ts`**, **`dictionaries/`**: the French and Japanese entries.
- **`i18n.ts`**, **`currentLocale.ts`**, **`keys.ts`**, **`formats.ts`**: lookup, the current language, key helpers, number and date formats.
- **Game and sport constants:** `game.constants.ts`, `soccer.constants.ts`, `mls.constants.ts`, `playerstats.constants.ts`.
- **`src/lib/locale.ts`**: the locale list and the `spxn-locale` cookie name.

## Sides, leagues and seasons (`src/lib/`)

- **`sides.ts`**: `SIDE_RULE` and `HOME_FIRST`. The one place that decides left and right; never order two teams by hand.
- **`leagues.ts`**: `LEAGUE_CODES` and each league's parent (rival leagues have one). **`leagueFamilies.ts`**, **`otherLeagues.ts`**.
- **`season.ts`**, **`seasonRows.ts`**, **`seasonBoxes.ts`**, **`gameSeasons.ts`**: season helpers; every read of games carries a season.
- **`series.ts`**, **`seriesData.ts`**, **`playoffs.ts`**, **`playoffPath.ts`**: playoff series and paths.

## Brackets, trophies and cups (`src/lib/`)

- **`bracketLayout.ts`**: ties and teams in, the `@johnmorrisdotca/taisen-brackets` layout out.
- **`bracketDraw.ts`**: the drawing of a knockout box (desk and phone). **`seasonBracket.ts`**, **`soccerKnockoutDraw.ts`**:
  season and World Cup brackets. **`bracketGroups.ts`** groups bracket rounds; **`nbaPlayIn.ts`** holds the NBA play-in.
- **`soccerRoadChart.ts`**: the World Cup road chart SVG. **`soccerRoad.ts`**: its data.
- **`cups.ts`** (server-only) and **`cup.ts`**, **`cupData.ts`**: draw cups with `@johnmorrisdotca/dougu-sports`.
  **`trophies.ts`**: the precomputed trophy string. [§9](../AGENTS.md#9-the-website)
- Components: `components/Knockout.tsx`, `KnockoutFile.tsx`, `SoccerKnockout.tsx`, `TrophyIcon.tsx`, `TrophyMark.tsx`,
  `TrophyBanner.tsx`, `TurnTrophy.tsx`.

## Maps and charts

- **`components/mapDraw.ts`** and **`src/lib/mapView.ts`**: shared Chizu map drawing and view state.
- Map components: `CityMap.tsx`, `CountryMap.tsx`, `CountryMapDialog.tsx`, `SeasonMap.tsx`, `TeamMap.tsx`, `TeamsMap.tsx`,
  `TournamentMap.tsx`, `VenueMap.tsx` (with `VenueMapLazy.tsx`), `MapViewer.tsx`, `BirthMap.tsx`.
- Charts: `Heatmap.tsx`, `TeamCharts.tsx` (`TeamChartsLazy.tsx` loads it when near), `TeamRanks.tsx`.

## Components (`src/components/`, about 280 files)

- **Tables:** `SortTable.tsx` (every table), `StandingsTable.tsx`, `AwardsTable.tsx`, `TeamsBoard.tsx`.
- **Flags and logos:** `Flag.tsx` (over `FlagIcon.tsx`) for every country flag; `TeamLogo.tsx` (one standard box, styled by `teamlogo.css`);
  `SoccerFlag.tsx`, `PageFlag.tsx`, `PageFlagSprite.tsx`.
- **Positions:** `PositionKey.tsx` (`positionBook()`, the only way to draw a position), `PositionCode.tsx`, `TeamPositionsKey.tsx`.
- **Team pages:** `TeamSeasonView.tsx`, `TeamRoster.tsx`, `TeamStaff.tsx`, `TeamLeaders.tsx`, `TeamAwards.tsx`, `TeamStrip.tsx`,
  `TeamSwitch.tsx`, `TeamPicker.tsx`, `TeamLabel.tsx`.
- **Shared:** `DatePicker.tsx`, `LocalTime.tsx` (times in the reader's zone), `Credits.tsx` (credit lines), `ui.tsx` (small shared pieces).
  `NoSeason` is in `src/lib/noSeason.ts`; the address line is `src/lib/venueAddress.ts`. [§9](../AGENTS.md#9-the-website)
- **Lazy pieces:** files with `Lazy` in the name are client chunks loaded when near the reader. [§9](../AGENTS.md#9-the-website)
- **CSS next to components:** `flag.css`, `knockout.css`, `mapviewer.css`, `positions.css`, `team.css`, `teams.css`, `teamchips.css`,
  `teamlogo.css`, `tournamentmap.css`. Global styles: `src/app/globals.css`.

## Accounts, board and releases

- **`lib/auth/`**: `config.ts`, `providers.ts`, `enabled.ts`, `preview.ts` (the "Sign in (this Mac)" preview login), `hint.ts`
  (the `spxn-in` cookie), `user.ts`, `admin.ts`, `account.ts`, `origin.ts`, `redirect.ts`. [§9](../AGENTS.md#9-the-website)
- **`lib/board/`**: `client.ts` (the tickets read), `rules.ts`. Tests: `pnpm test:board`.
- **`lib/releases/`**: `client.ts`, `rules.ts` (`waitingCount` is here). Tests: `pnpm test:releases`.
- **`lib/ops/`**: the `/admin/ops` snapshot readers. Tests: `pnpm test:ops`.

## Turso (planned, not used by the site)

- **`src/lib/turso/`**: `client.ts`, `aggregates.ts`, `checked.ts`. Database `spx-stats` holds one `health` table today;
  nothing on the site reads it. Test: `pnpm test:turso`. [§4](../AGENTS.md#4-cold-start) (Turso note)

## Brand and assets

- **`public/brand/`**: the SPXIS marks (light and `-dark` SVGs). Written by `scripts/brand/extractBrand.ts`. Never in an MIT package.
  [§9](../AGENTS.md#9-the-website)
- **`src/lib/brand*.ts`**: `brand.ts`, `brandAssets.ts` (favicon and OG head), `brandMarks.ts`, `brandSwoosh.ts`, `brandShield.ts`.
- **`public/`** also holds `favicon.ico`, `manifest.webmanifest`, `robots.txt`, `mascot/`.
- **Generated, not in git:** `public/team-logos/sl/` (written by `scripts/logos/export_hosted.py` at deploy and preview start).
  [§9](../AGENTS.md#9-the-website)
- Data-side logos and fair-use rules are in `src/lib/logoFit.ts`, `logoSheet.ts`, `embedLogo.ts`; the page is `/logos`.

## Scripts (`web/scripts/`, 88 test files)

- Tests are `*.test.ts`, run through `node --test` with the `pnpm test:*` commands in `web/package.json`. Examples:
  `test:routing` (routes and source scan), `test:revalidate`, `test:weight` (page HTML size), `test:positions`, `test:sides`,
  `test:game`, `test:player`, `test:city`, `test:countries`, `test:brand`, `test:address`, `test:auth`, `test:failure`,
  `test:localtime`, `test:resturl`, `test:buildshare`, `test:retired`.
- **`scripts/task.ts`**: the ticket CLI behind `pnpm task`. [§5](../AGENTS.md#5-tickets)
- **`scripts/brand/`**: brand extraction and rasterising.

## Other folders in web/

- **`I18N_TODO.md`**: open translation doubts.
- **`site/`** is retired: do not add to it. It is at the repo root, not in `web/`. [§9](../AGENTS.md#9-the-website)
- Repo-root **`scripts/`** holds the data work (`release/`, `sync/`, `daily/`, `mac/`, `logos/`, `game_venue/`, and more).
  Data rules are in [§8](../AGENTS.md#8-data-work).

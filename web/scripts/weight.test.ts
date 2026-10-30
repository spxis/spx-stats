import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { AWARD_GRID_HEAD, AWARD_MANY, awardGridPagePath, awardHref, awardGridRestPath, awardHead, buildAwardGrid, type AwardInput } from "../src/lib/awardGrid.ts";
import { CHAMP_HEAD, buildChampLines, champHead, champNoteText, champPagePath, champRestPath, type ChampSeason } from "../src/lib/champLines.ts";
import { packBoard } from "../src/lib/playerBoardWire.ts";
import { clubInfoKey, type BoardData } from "../src/lib/playerBoard.ts";
import { buildSlugs, packTable, tableOf, unpackTable, type SlugTable } from "../src/lib/slug.ts";
import { approvedTable, fitLeagues, type LogoFit } from "../src/lib/logoFit.ts";
import { barItems, barRows, type BarCtx } from "../src/lib/allTimeBars.ts";
import type { Franchise, SeasonMark } from "../src/lib/allTime.ts";
import { AT_HEAD, atGrid, atKeys, atPoints, atSort, buildAtList, lineAt, pickAt, resolveAt, shownAt, allTimeRestPath } from "../src/lib/allTimeLines.ts";
import { sortRows } from "../src/lib/sort.ts";
import { COUNTRIES_HEAD } from "../src/lib/countryLines.ts";
import { FULL_SHARE, leagueSeasonBars, leagueSeasonRows } from "../src/lib/leagueSeasonRows.ts";
import { packHeat, unpackHeat, type HeatSeason } from "../src/lib/heatWire.ts";
import { seasonLabel } from "../src/lib/leagues.ts";
import { packTeams, unpackTeams } from "../src/lib/teamWire.ts";
import type { BoardTeam } from "../src/lib/teamBoard.ts";
import { venuesRestPath } from "../src/lib/mapView.ts";
import { headPerGroup, seasonStandKeys, STANDINGS_FULL, STANDINGS_HEAD } from "../src/lib/seasonStandLines.ts";
import { QUERY_KEYS } from "../src/lib/routing.ts";
import { MLS_MATCHES_HEAD, buildMlsMatches, readMlsMatches, type MlsMatchInput } from "../src/lib/mlsLines.ts";

/**
 * Page weight of the league pages: a league page lists every season, champion and award, and sent them all (the NHL's was 970 KB of HTML against a budget
 * of about 300 KB). The long tables now send only their newest rows as short plain data and fetch the rest when asked; the two drawings are made in the
 * browser. These tests build nothing: they pin down the data shapes and row limits, so a change cannot put every row back into the page. Run in web/: pnpm test:weight
 */
const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

const YEARS = Array.from({ length: 130 }, (_, i) => 2025 - i);
const seasons = (n: number): ChampSeason[] => YEARS.slice(0, n).map((year, i) => ({
  year, champion: `Club ${i % 30}`, champion_franchise: 100 + (i % 30), champion_source: "spx",
  champion_note: i % 3 === 0 ? `Won the final 4 games to ${i % 4} against Club ${(i + 1) % 30}` : i % 3 === 1 ? "Won the title" : null,
}));
const lookup = {
  // Each club wears a new logo every ten years, as in the archive: a short list of long addresses.
  logo: (f: number | null | undefined, year: number) => (f == null ? null : `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Club_${f}_${Math.floor(year / 10)}.svg/120px-Club_${f}_${Math.floor(year / 10)}.svg.png`),
  final: (year: number, champ: number, opponent: string) => (opponent.startsWith("Club ") ? { opp: 100 + Number(opponent.slice(5)), href: `/nhl/${year}/series/club-${champ}-vs-club-${opponent.slice(5)}` } : null),
};

test("the page carries a few of the newest seasons, not every one", () => {
  assert.ok(CHAMP_HEAD <= 15, "the champions table's head is a few rows");
  assert.ok(AWARD_GRID_HEAD <= 15, "the awards grid's head is a few seasons");
  const all = buildChampLines(seasons(130), lookup);
  assert.equal(all.lines.length, 130);
  const head = champHead(all, CHAMP_HEAD);
  assert.equal(head.lines.length, CHAMP_HEAD);
  assert.deepEqual(head.lines.map((l) => l.y), YEARS.slice(0, CHAMP_HEAD), "the newest seasons, in order");
  assert.ok(JSON.stringify(head).length < 6000, "the head of the champions is a few KB");
});

test("the head's logos are the first of the list, so the rest can carry the whole list", () => {
  const all = buildChampLines(seasons(130), lookup);
  const head = champHead(all, CHAMP_HEAD);
  assert.deepEqual(head.logos, all.logos.slice(0, head.logos.length));
  for (const l of head.lines) {
    if (l.lo != null) assert.ok(l.lo < head.logos.length);
    if (l.fin?.ol != null) assert.ok(l.fin.ol < head.logos.length);
  }
  assert.ok(head.logos.length < all.logos.length, "the older seasons' logos are not in the page");
  // The page's lines and the route's lines are the same list, cut in two.
  const rest = all.lines.slice(CHAMP_HEAD);
  assert.equal(head.lines.length + rest.length, all.lines.length);
});

test("a final is a link where the games hold it, else its plain note", () => {
  const all = buildChampLines(seasons(6), lookup);
  const [first, second, third] = all.lines;
  assert.ok(first.fin && !first.note, "found in the games: the score links to the series, the opponent is named");
  assert.equal(first.fin.h.startsWith("/nhl/2025/series/"), true);
  assert.equal(champNoteText(first), "Won the final 4 games to 0 against Club 1");
  assert.equal(second.note, "Won the title");
  assert.equal(champNoteText(second), "Won the title");
  assert.equal(third.note, undefined);
  assert.equal(champNoteText(third), "");
  assert.equal(champRestPath("nhl"), "/nhl/rows/champions");
  assert.equal(champPagePath("nhl"), "/nhl/champions");
});

const awardRows = (n: number): AwardInput[] => YEARS.slice(0, n).flatMap((year, i) => [
  ...["mvp", "rookie", "coach"].map((code) => ({ year, award_code: code, award: code.toUpperCase(), kind: "person_award", winner: `Player ${i}-${code}`, person_id: i * 10 + code.length, franchise_id: null })),
  { year, award_code: "trophy", award: "Trophy", kind: "team_award", winner: `Club ${i % 30}`, person_id: null, franchise_id: 100 + (i % 30) },
  ...Array.from({ length: i % 2 ? AWARD_MANY + 3 : 2 }, (_, k) => ({ year, award_code: "allstar", award: "All-Star", kind: "person_award", winner: `Star ${i}-${k}`, person_id: 5000 + k, franchise_id: null })),
]);
const awardLook = { league: "nhl", player: (id: number, name: string) => `/nhl/player/${name.toLowerCase().replace(/\W+/g, "-")}-${id}`, logo: lookup.logo as (f: number, y: number) => string | null };

test("the awards grid sends the newest seasons and counts a crowded cell", () => {
  const grid = buildAwardGrid(awardRows(100), awardLook);
  assert.equal(grid.seasons.length, 100);
  assert.deepEqual(grid.seasons.map((s) => s.y), YEARS.slice(0, 100), "newest first");
  assert.equal(grid.winners, awardRows(100).length);
  assert.equal(grid.columns[0].code, "allstar", "person awards first, the most given first");
  assert.equal(grid.columns.at(-1)?.code, "trophy", "team awards after the person awards");
  const crowded = grid.seasons.find((s) => typeof s.c.allstar === "number");
  assert.equal(crowded?.c.allstar, AWARD_MANY + 3, "more winners than AWARD_MANY are only counted");
  const few = grid.seasons.find((s) => Array.isArray(s.c.allstar));
  assert.ok(Array.isArray(few?.c.allstar) && few.c.allstar.length <= AWARD_MANY);
  const head = awardHead(grid, AWARD_GRID_HEAD);
  assert.equal(head.seasons.length, AWARD_GRID_HEAD);
  assert.deepEqual(head.logos, grid.logos.slice(0, head.logos.length));
  assert.ok(head.logos.length < grid.logos.length);
  assert.ok(JSON.stringify(head).length < 12000, "the head of the awards grid is a few KB");
  assert.equal(awardGridRestPath("nhl"), "/nhl/rows/awards");
  assert.equal(awardGridPagePath("nhl"), "/nhl/awards");
});

test("a team winner points into the list of logos, a player winner carries his page", () => {
  const grid = buildAwardGrid(awardRows(3), awardLook);
  const s = grid.seasons[0];
  const team = s.c.trophy;
  assert.ok(Array.isArray(team) && team[0].f != null && team[0].lo != null && grid.logos[team[0].lo]);
  const player = s.c.mvp;
  assert.ok(Array.isArray(player) && player[0].lo === undefined);
  assert.equal(player[0].h, undefined, "a player's usual address is not sent, only his id");
  assert.ok(awardHref("nhl", player[0])?.startsWith("/nhl/player/") && awardHref("nhl", player[0]) === awardLook.player(player[0].p!, player[0].w!));
  const elsewhere = buildAwardGrid(awardRows(1), { ...awardLook, player: (id, name) => `/mlb/player/${name.toLowerCase().replace(/\W+/g, "-")}-${id}` });
  assert.ok(String(elsewhere.seasons[0].c.mvp && (elsewhere.seasons[0].c.mvp as { h?: string }[])[0].h).startsWith("/mlb/player/"), "a player filed under another league keeps his address");
});

test("the season chips, the strip and the bars read one short list of rows", () => {
  const list = [
    { year: 1917, games: 36, finals: 36, share: 1, champion: "Toronto", teams: 3 },
    { year: 1918, games: 0, finals: 0, share: 0, champion: null, teams: 0 },
    { year: 1919, games: 0, finals: 0, share: 0, champion: null, teams: 4 },
    { year: 1920, games: 48, finals: 47, share: 0.9796, champion: "Ottawa", teams: 4 },
  ];
  const rows = leagueSeasonRows(list);
  assert.deepEqual(rows[1], { y: 1918, g: 0, f: 0, s: 0, n: 1 }, "a year the league sat out");
  assert.deepEqual(rows[2], { y: 1919, g: 0, f: 0, s: 0, t: 1 }, "clubs but no schedule: not a year sat out");
  assert.ok(rows[3].s < FULL_SHARE, "rounding never turns a part season into a whole one");
  assert.ok(rows[0].s >= FULL_SHARE);
  assert.ok(JSON.stringify(rows[0]).length < 80, "a row is a few dozen bytes");
  assert.deepEqual(leagueSeasonBars("nhl", rows).map((b) => b.year), [1917, 1918, 1920], "the bars skip a season with clubs and no games");
  assert.equal(leagueSeasonBars("nhl", rows)[0].label, "1917-18");
});

test("the league page keeps its long lists out of the page and its drawings in the browser", () => {
  const page = read("app/[locale]/s/[league]/page.tsx");
  assert.ok(!/champions\s*=\s*tableOf\(/.test(page), "the champions table is not built from every season on the page");
  assert.ok(page.includes("<LeagueChampions") && page.includes("<LeagueAwards") && page.includes("<SeasonBarsLazy"));
  assert.ok(!page.includes("<SeasonBars ") && !page.includes("chips="), "no bar chart or chip list drawn on the server");
  assert.ok(read("components/LeagueChampions.tsx").includes("champHead(list, CHAMP_HEAD)"), "the champions' head is cut to CHAMP_HEAD unless the full list is asked for");
  assert.ok(read("components/LeagueAwards.tsx").includes("awardHead(grid, AWARD_GRID_HEAD)"), "the awards' head is cut to AWARD_GRID_HEAD unless the full list is asked for");
  assert.ok(read("app/[locale]/s/[league]/rows/champions/route.ts").includes("slice(CHAMP_HEAD)"));
  assert.ok(read("app/[locale]/s/[league]/rows/awards/route.ts").includes("slice(AWARD_GRID_HEAD)"));
  for (const file of ["components/LeagueSeasons.tsx", "components/SeasonBarsLazy.tsx"]) {
    const src = read(file);
    assert.ok(/dynamic\(/.test(src) && src.includes("ssr: false") && src.includes("useSeen"), `${file} draws its chart in the browser when it is near`);
  }
  // The full lists have pages of their own (the "Show all" links), kept like every other page, each with its twin for an address that has a query.
  for (const name of ["champions", "awards"]) {
    const s = read(`app/[locale]/s/[league]/${name}/page.tsx`);
    assert.ok(s.includes("export const revalidate = 2592000;"), `${name} is kept 30 days`);
    assert.ok(!/searchParams|cookies\(|headers\(/.test(s), `${name} reads nothing per request`);
    assert.ok(read(`app/[locale]/q/[league]/${name}/page.tsx`).includes(`s/[league]/${name}/page`), `${name} has its twin in q/`);
  }
});

/** The HTML budget of a public page, in bytes, as the page is served (no compression). A player with a long career is the heaviest page the site has. */
const PAGE_BUDGET = 300 * 1000;
const PLAYER_BUDGET = 250 * 1000;
const TABLE_BUDGET = 300 * 1000;

test("a long career travels as a few kilobytes: names, logos and colours once, the league's figures not at all", () => {
  const clubs: BoardData["clubs"] = {};
  const stats = Array.from({ length: 24 }, (_, i) => i).flatMap((i) => (["regular", "playoffs"] as const).map((phase) => {
    const team = i < 12 ? "Los Angeles Angels of Anaheim" : "St. Louis Cardinals", f = i < 12 ? 7 : 9, year = 2001 + i;
    clubs[clubInfoKey("mlb", f, year)] = { team, logo: `https://upload.wikimedia.org/wikipedia/en/thumb/${f}/Club_${f}.svg/250px-Club_${f}.svg.png?utm_source=en.wikipedia.org&utm_campaign=imageinfo&utm_content=thumbnail`, tone: "light-dark(#00205B, #D14520)" };
    return { league: "mlb", year, ts: 70000 + i, f, team, phase, group: "batting", stats: { g: 150, ab: 560, r: 100, h: 170, d: 35, t: 1, hr: 35, rbi: 110, bb: 80, so: 70, sb: 3, cs: 1, hbp: 5, sf: 6, ibb: 10, gidp: 20 } };
  }));
  const seasons = stats.filter((s) => s.phase === "regular").map((s) => ({ league: "mlb", year: s.year, label: String(s.year), f: s.f, team: s.team, reg: true, po: true, teamPo: true, champ: false }));
  const board: BoardData = { name: "A Long Career", min: 2001, max: 2024, bucket: "all", position: "1B", stats, seasons, clubs, titles: [], awards: [], held: [] };
  const wire = JSON.stringify(packBoard(board));
  assert.ok(wire.length < 14000, `a 24-season career is ${wire.length} bytes on the wire`);
  assert.ok(!wire.includes('"refs"'), "the league's figures are fetched by the board, not carried");
  assert.equal(wire.split("https://upload.wikimedia.org").length - 1, 2, "each logo address is written once");
});

test("the team address table travels as a flat list and reads back whole", () => {
  const table: SlugTable = { nhl: { 7: { s: "boston-bruins" }, 9: { s: "montreal-canadiens" }, 12: { s: "winnipeg-jets-2", c: [1996, "phoenix-coyotes", 2014, "arizona-coyotes"] } }, nba: {} };
  const wire = packTable(table);
  assert.deepEqual(wire.nhl, [7, "boston-bruins", 9, "montreal-canadiens", 12, { s: "winnipeg-jets-2", c: [1996, "phoenix-coyotes", 2014, "arizona-coyotes"] }]);
  assert.deepEqual(unpackTable(JSON.parse(JSON.stringify(wire))), table);
});

test("the root layout carries no team addresses and no logo fits: a page carries those of the leagues it shows", () => {
  const shell = read("components/SiteShell.tsx");
  assert.ok(!/SlugProvider|LogoFitProvider|getSlugs|getLogoFits|packTable|approvedTable/.test(shell), "the document around every page holds no table (they were 45 KB of every page)");
  for (const side of ["s", "q"]) {
    assert.ok(read(`app/[locale]/${side}/[league]/layout.tsx`).includes("<TeamData leagues={[league, ...(RELATED_LEAGUES[league as LeagueCode] ?? [])]}>"), `${side}/[league] carries its league's (and its relatives') addresses and fits`);
  }
  const data = read("components/TeamData.tsx");
  assert.ok(data.includes("tableOf(slugs, leagues)") && data.includes("fitLeagues(fits, leagues)"), "TeamData cuts both tables to the leagues asked for");
  for (const dir of ["s/teams", "s/city", "s/country", "s/venue", "s/trophies", "q/teams", "q/city", "q/country", "q/venue"]) {
    assert.ok(read(`app/[locale]/${dir}/layout.tsx`).includes("TeamDataLayout"), `${dir} names teams of any league and carries them all`);
  }
});

test("addresses and fits are cut to the leagues a page shows, and a league not carried keeps the numeric address", () => {
  const slugs = buildSlugs(
    [{ league: "nhl", franchise_id: 1, name: "Boston Bruins", name_from: null, name_to: null }, { league: "nba", franchise_id: 2, name: "Boston Celtics", name_from: null, name_to: null }],
    [{ league: "nhl", year: 2000, franchise_id: 1, team: "Boston Bruins" }, { league: "nba", year: 2000, franchise_id: 2, team: "Boston Celtics" }],
  );
  assert.deepEqual(Object.keys(tableOf(slugs, ["nhl"])), ["nhl"]);
  assert.deepEqual(Object.keys(tableOf(slugs)).sort(), ["nba", "nhl"]);
  assert.deepEqual(packTable(tableOf(slugs, ["nba"])), { nba: [2, "boston-celtics"] });
  const fit = (logo_file: string, league: string | null): LogoFit => ({ logo_file, league, team: "t", wordmark: true, mark_url: "m", mark_licence: null, mark_page: null, scale: 1, dx: 0, dy: 0, bg: "auto", status: "approved", note: null });
  const rows = [fit("commons:A.svg", "nhl"), fit("commons:B.svg", "nba"), fit("commons:C.svg", null), fit("commons:D.svg", "other")];
  assert.deepEqual(Object.keys(approvedTable(fitLeagues(rows, ["nhl"]))), ["commons:A.svg", "commons:C.svg", "commons:D.svg"], "a fit of no known league is in every list");
  assert.equal(Object.keys(approvedTable(fitLeagues(rows))).length, 4);
});

test("a player's page leaves the league's figures, the strip and the seasons table out of its HTML", () => {
  const board = read("components/PlayerBoard.tsx");
  assert.ok(board.includes("/api/players/${id}/refs") && board.includes("useFetchedJson"), "the board fetches the league's figures");
  assert.ok(!/data\.refs/.test(board), "no figures ride along with the page");
  assert.ok(read("components/PlayerPath.tsx").includes("useSyncExternalStore") && read("components/PlayerPath.tsx").includes("drawn ?"), "the career strip is drawn in the browser");
  assert.ok(read("components/PlayerTables.tsx").includes("useSeen"), "the seasons table is drawn when the reader gets near");
  const route = read("app/api/players/[id]/refs/route.ts");
  assert.ok(route.includes("export const revalidate = 86400;") && !/searchParams|cookies\(|headers\(/.test(route), "the figures' route is kept a day and reads nothing per request");
  assert.ok(read("app/[locale]/q/[league]/player/[player]/page.tsx").includes("<PlayerBoard wire={board}"), "the page hands the board its packed form");
});

/** A league of 60 franchises with 40 to 130 seasons each, as the all-time table adds them up. */
const franchise = (f: number): Franchise => {
  const first = 1900 + (f % 40) * 2, last = f % 3 === 0 ? 2025 : first + 30 + (f % 50);
  const years: SeasonMark[] = [];
  for (let year = first; year <= last; year++) {
    if (f % 7 === 0 && year % 11 === 0) continue;
    const w = 30 + ((year * f) % 30), l = 82 - w;
    years.push({ year, gp: 82, w, l, t: 0, otl: 0, share: w / 82, champion: (year * f) % 31 === 0, eligible: year !== 1999 });
  }
  const reg = years.reduce((a, m) => ({ ...a, gp: a.gp + m.gp, w: a.w + m.w, l: a.l + m.l, pf: a.pf + m.w * 3, pa: a.pa + m.l * 3 }), { gp: 0, w: 0, l: 0, t: 0, otl: 0, pf: 0, pa: 0 });
  const ranked = years.filter((m) => m.eligible);
  return {
    f, name: `Franchise number ${f} of the league`, former: f % 5 === 0 ? ["An Older Name", "A Name Before That"] : [], abbr: `F${f}`, first: years[0].year, last: years.at(-1)!.year, active: f % 3 === 0,
    seasons: years.length, reg, po: { gp: f % 4 ? 40 : 0, w: 20, l: 20, t: 0, otl: 0, pf: 100, pa: 100 }, playoffs: f % 4 ? 9 : 0, titles: years.filter((m) => m.champion).map((m) => m.year),
    years, best: ranked.reduce((a, m) => ((m.share ?? 0) > (a.share ?? 0) ? m : a)), worst: ranked.reduce((a, m) => ((m.share ?? 1) < (a.share ?? 1) ? m : a)),
  };
};
const LEAGUE = Array.from({ length: 60 }, (_, i) => franchise(i + 1));
const atLook = { logo: (f: number) => `https://upload.wikimedia.org/wikipedia/en/thumb/a/ab/Franchise_${f % 20}_logo.svg/250px-Franchise_${f % 20}_logo.svg.png`, tone: (f: number) => ({ tl: f % 2 ? "0a2351" : null, td: "ffb81c" }) };

test("the all-time table travels as a short line a franchise, the first few in the page", () => {
  assert.ok(AT_HEAD <= 15, "the page carries a few franchises");
  const list = buildAtList(LEAGUE, atLook);
  assert.equal(list.lines.length, 60);
  assert.equal(list.logos.length, 20, "each logo address is written once");
  const bytes = JSON.stringify(list.lines).length / list.lines.length;
  assert.ok(bytes < 900, `a franchise is ${Math.round(bytes)} bytes on the wire`);
  assert.equal(allTimeRestPath("nhl"), "/nhl/rows/all-time");
  const rows = resolveAt(list);
  const head = pickAt(sortRows(shownAt(rows, "r", false), [{ key: "w", dir: "desc" }], (t, k) => atSort(t, k, "r")).slice(0, AT_HEAD));
  assert.equal(head.lines.length, AT_HEAD);
  assert.ok(head.logos.length <= AT_HEAD, "the other franchises' logos are not in the page");
  assert.ok(JSON.stringify(head).length < 12000, "the head of the table is a few KB");
  for (const l of head.lines) if (l.lo != null) assert.ok(l.lo < head.logos.length);
  assert.deepEqual(resolveAt(head).map((t) => [t.f, t.logo]), sortRows(shownAt(rows, "r", false), [{ key: "w", dir: "desc" }], (t, k) => atSort(t, k, "r")).slice(0, AT_HEAD).map((t) => [t.f, t.logo]));
});

test("a line gives back the franchise's record, win shares and seasons", () => {
  const list = buildAtList(LEAGUE, atLook);
  const rows = resolveAt(list);
  for (const t of LEAGUE) {
    const row = rows.find((r) => r.f === t.f)!;
    assert.deepEqual(lineAt(row, "r"), t.reg);
    assert.deepEqual(lineAt(row, "p"), t.po);
    assert.equal(atSort(row, "diff", "r"), t.reg.pf - t.reg.pa);
    assert.equal(atSort(row, "titles", "r"), t.titles.length);
    assert.equal(row.s, t.seasons);
    assert.deepEqual(atGrid(row).map((g) => g[0]), t.years.map((m) => m.year), "a season for each year played, none for a year off");
    assert.deepEqual(atGrid(row).map((g) => g[2]), t.years.map((m) => (m.champion ? 1 : 0)));
    assert.deepEqual(atGrid(row).map((g) => g[1] < 0), t.years.map((m) => !m.eligible || m.share == null), "a season too short to rate is -1");
    assert.deepEqual(atPoints(row).map((p) => p[0]), t.years.filter((m) => m.eligible).map((m) => m.year));
    assert.ok(Math.abs(atPoints(row)[0][1] - t.years.find((m) => m.eligible)!.share!) < 0.0006);
    assert.deepEqual(row.b, [t.best!.year, t.best!.share!], "the sorts by best and worst season see the exact shares");
  }
});

test("the order of the whole list is kept by the lines, whichever are in the page", () => {
  const rows = resolveAt(buildAtList(LEAGUE, atLook));
  const shuffled = [...rows].reverse();
  assert.deepEqual(shownAt(shuffled, "r", false).map((t) => t.f), [...LEAGUE].sort((a, b) => a.first - b.first || a.name.localeCompare(b.name)).map((t) => t.f));
  assert.ok(shownAt(rows, "p", false).every((t) => t.p[0] > 0), "a franchise with no playoff game is left out of the playoff view");
  assert.ok(shownAt(rows, "r", true).every((t) => t.on));
  assert.deepEqual(atKeys(false, false).slice(0, 3), ["team", "years", "seasons"]);
});

test("the bars rank the lines as the page always has, the first ones in the page and the rest on request", () => {
  const rows = resolveAt(buildAtList(LEAGUE, atLook));
  const ctx: BarCtx = { lg: "nhl", phase: "r", active: false, paths: { team: (lg, f) => `/${lg}/team/${f}`, teamSeason: () => "", season: () => "", slug: () => "" }, fmt: String, plural: (_k, n) => `${n} seasons` };
  const share = barItems("share", rows, ctx);
  assert.ok(share.length > 10 && share.every((i, k) => k === 0 || i.value <= share[k - 1].value), "best win share first");
  assert.ok(share.every((i) => i.tip.startsWith(i.name)));
  const titles = barRows("titles", rows, "r", false);
  assert.ok(titles.every((t) => t.ti?.length) && titles.every((t, k) => k === 0 || t.ti!.length <= titles[k - 1].ti!.length));
  assert.ok(barRows("playoffs", rows, "p", true).every((t) => t.on && t.po));
});

test("the all-time page keeps its long lists and drawings out of the page", () => {
  const page = read("app/[locale]/q/[league]/all-time/page.tsx");
  assert.ok(page.includes("<AllTimeTable") && page.includes("<AllTimeChartLazy") && page.includes("<AllTimeBars"));
  assert.ok(!page.includes("<SortTable") && !page.includes("<SeasonGrid") && !page.includes("<WinLossScatter") && !page.includes("<Spark"), "no table, chart or spark drawn on the server");
  assert.ok(page.includes("ordered.slice(0, AT_HEAD)"), "the overview carries only the first franchises of the table");
  const route = read("app/[locale]/s/[league]/rows/all-time/route.ts");
  assert.ok(route.includes("export const revalidate = 2592000;") && !/searchParams|cookies\(|headers\(/.test(route), "the rest of the franchises come from a kept route that reads nothing per request");
  assert.ok(read("components/AllTimeChartLazy.tsx").includes("useSeen") && read("components/AllTimeChartLazy.tsx").includes("ssr: false"), "the charts are drawn in the browser when near");
  assert.ok(read("components/AllTimeBars.tsx").includes("onToggle"), "the rest of the bars load when the disclosure is opened");
  assert.ok(read("components/AllTimeTable.tsx").includes("partial="), "the table shows all franchises on request");
});

test("the country pages send their tables as short lines and draw the long ones' first rows only", () => {
  const countries = read("app/[locale]/s/countries/page.tsx");
  assert.ok(countries.includes("<CountriesVersus") && countries.includes("<CountriesFirsts") && countries.includes("<CountryMixBars") && countries.includes("<CountryTrend"));
  assert.ok(!countries.includes("<SortTable") && !countries.includes("tableOf(") && !countries.includes("shareSeries("), "no table is drawn on the server and no trend data rides along");
  for (const file of ["components/CountriesTables.tsx", "components/WorldTables.tsx"]) {
    const src = read(file);
    assert.ok(src.includes("useReveal(") && src.includes("partial="), `${file} draws its first rows and shows the rest on request`);
  }
  assert.ok(COUNTRIES_HEAD <= 15, "a table's head is a few rows");
  const trend = read("components/CountryTrend.tsx");
  assert.ok(trend.includes("useSeen") && trend.includes("countriesTrendPath"), "the trend loads its decades when the reader gets near");
  const route = read("app/[locale]/s/countries/rows/trend/route.ts");
  assert.ok(route.includes("export const revalidate = 86400;") && !/searchParams|cookies\(|headers\(/.test(route), "the trend's route is kept a day and reads nothing per request");
  for (const name of ["versus", "firsts"]) {
    const page = read(`app/[locale]/s/countries/${name}/page.tsx`);
    assert.ok(page.includes("export const revalidate = 86400;") && page.includes(" full ") && !/searchParams|cookies\(|headers\(/.test(page), `/countries/${name} is the whole table, kept, reading nothing per request`);
    assert.ok(read(`app/[locale]/q/countries/${name}/page.tsx`).includes(`s/countries/${name}/page`), `${name} has its twin in q/`);
  }
});

test("a league's world page draws its chart when near and its two long tables from lines", () => {
  const page = read("app/[locale]/s/[league]/world/page.tsx");
  assert.ok(page.includes("<CountryAreaLazy") && page.includes("<WorldTeamsTable") && page.includes("<WorldStackTable"));
  assert.ok(!page.includes("<CountryArea ") && !page.includes("<SortTable") && !page.includes("tableOf("), "no chart or table drawn on the server");
  const lazy = read("components/CountryAreaLazy.tsx");
  assert.ok(lazy.includes("useSeen") && lazy.includes("ssr: false"), "the stacked chart is drawn in the browser when near");
  const tables = read("app/[locale]/s/[league]/world/tables/page.tsx");
  assert.ok(tables.includes("export const revalidate = 2592000;") && tables.includes(" full ") && !/searchParams|cookies\(|headers\(/.test(tables), "the tables page has every row, kept, reading nothing per request");
  assert.ok(read("app/[locale]/q/[league]/world/tables/page.tsx").includes("s/[league]/world/tables/page"), "the tables page has its twin in q/");
});

test("the home archive chart's seasons travel as six numbers each and come back whole", () => {
  const leagues = ["nhl", "nba", "mlb", "nfl", "ahl", "cfl", "soccer", "mls"];
  const seasons: HeatSeason[] = leagues.flatMap((league, li) => Array.from({ length: 110 }, (_, i): HeatSeason => {
    const year = 1915 + i;
    const games = i % 9 === 0 ? 0 : 200 + i;
    return {
      league, year, label: league === "soccer" || league === "mls" ? String(year) : year === 1999 && li < 3 ? "1999-00" : seasonLabel(league, year),
      games, finals: Math.floor(games * 0.97), share: games ? Math.round((0.4 + (i % 7) / 12) * 1000) / 1000 : 0,
      champion: i % 5 === 0 ? null : `Club ${(li * 7 + i) % 40}`,
    };
  }));
  const wire = packHeat(seasons);
  assert.equal(wire.r.length, seasons.length * 6);
  assert.equal(wire.n.length, 40, "each champion's name is sent once");
  const back = unpackHeat(wire);
  assert.equal(back.length, seasons.length);
  for (const [i, s] of seasons.entries()) {
    const b = back[i];
    assert.equal(b.league, s.league); assert.equal(b.year, s.year); assert.equal(b.games, s.games); assert.equal(b.finals, s.finals);
    assert.equal(b.champion, s.champion);
    assert.ok(Math.abs(b.share - s.share) < 0.0006, "the share keeps the thousandths the shading reads");
  }
  const odd = back.filter((s, i) => s.label !== seasons[i].label);
  assert.equal(odd.length, 0, "labels the league does not write itself are carried, the rest are rebuilt");
  assert.ok(Object.keys(wire.l ?? {}).length <= 8, "only the odd labels are carried");
  assert.ok(JSON.stringify(wire).length < 40 * seasons.length, "a season costs a few bytes in the page");
});

test("the home page sends the archive chart as data and draws it in the browser when near", () => {
  const page = read("app/[locale]/s/page.tsx");
  assert.ok(page.includes("packHeat(") && !page.includes("<Heatmap seasons="), "the page sends the packed seasons");
  const chart = read("components/Heatmap.tsx");
  assert.ok(chart.includes("useSeen") && chart.includes("ssr: false") && chart.includes("unpackHeat("), "the squares are drawn in the browser, from the packed seasons, when near");
  assert.ok(!/setInterval|router\.refresh/.test(chart + read("components/HomeCards.tsx")), "nothing on the home page runs on a timer");
});

test("an MLS season travels as one short line a match and reads back as the table draws it", () => {
  const clubs = Array.from({ length: 30 }, (_, i) => ({ id: `C-club-${i}`, slug: `club-${i}`, name: `Club Number ${i} FC` }));
  const matches: MlsMatchInput[] = Array.from({ length: 520 }, (_, i): MlsMatchInput => {
    const h = clubs[i % 30], a = clubs[(i * 7 + 3) % 30 === i % 30 ? (i + 1) % 30 : (i * 7 + 3) % 30];
    return {
      match_id: 20000 + i, match_date: `2025-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, "0")}`, stage_key: i > 500 ? "round_one" : "regular", stage_order: i > 500 ? 2 : 1,
      home_team_id: h.id, home: h.name, home_slug: h.slug, home_goals: i % 4, away_team_id: a.id, away: a.name, away_slug: a.slug, away_goals: (i + 1) % 3,
      extra_time: i % 50 === 0, shootout: i % 100 === 0, home_penalties: i % 100 === 0 ? 4 : null, away_penalties: i % 100 === 0 ? 3 : null, winner_team_id: i % 60 === 0 ? h.id : null,
      shootout_style: i % 60 === 0 ? "mls" : null, venue_name: i % 11 === 0 ? null : `Ground ${i % 30}`, venue_city: i % 11 === 0 ? null : `City ${i % 30}`,
      venue_wikidata_id: i % 5 === 0 ? null : `Q${1000 + (i % 30)}`, venue_id: i % 7 === 0 ? null : 1, attendance: i % 13 === 0 ? null : 15000 + i,
    };
  });
  const wire = buildMlsMatches(matches);
  assert.equal(wire.lines.length, matches.length);
  assert.equal(wire.c.length, 30, "each club name once");
  assert.ok(wire.v.length < matches.length / 4, "a ground is listed once, not for every match");
  assert.ok(JSON.stringify(wire).length < 75 * matches.length, "a match costs well under a hundred bytes in the page");
  const back = readMlsMatches(wire);
  for (const [i, m] of matches.entries()) {
    const b = back[i];
    assert.equal(b.id, m.match_id); assert.equal(b.date, m.match_date); assert.equal(b.stageOrder, m.stage_order); assert.equal(b.stageKey, m.stage_key);
    assert.equal(b.home, m.home); assert.equal(b.homeSlug, m.home_slug); assert.equal(b.away, m.away); assert.equal(b.awaySlug, m.away_slug);
    assert.equal(b.hg, m.home_goals); assert.equal(b.ag, m.away_goals);
    assert.equal(b.venue, m.venue_name); assert.equal(b.venueCity, m.venue_city); if (m.venue_name) assert.equal(b.venueQid, m.venue_wikidata_id); if (m.venue_name) assert.equal(b.venueLinked, m.venue_id != null);
    assert.equal(b.crowd, m.attendance ?? 0);
    const note = m.shootout && m.home_penalties != null ? 2 : m.shootout_style === "mls" && m.winner_team_id ? 3 : m.extra_time ? 1 : 0;
    assert.equal(b.note, note);
    if (note === 2) { assert.equal(b.hp, m.home_penalties); assert.equal(b.ap, m.away_penalties); }
  }
});

test("the teams list travels as short arrays, with logos written by their shared beginnings, and reads back whole", () => {
  const leagues = ["nhl", "nba", "mlb", "ncaaf", "echl"];
  const logos = Array.from({ length: 80 }, (_, i) => i % 5 === 4 ? `/team-logos/sl/${5000 + i}.gif`
    : `https://${i % 2 ? "thumb" : "upload"}.wikimedia.org/wikipedia/${i % 3 ? "commons" : "en"}/thumb/a/b${i}/Club_${i}.svg/120px-Club_${i}.svg.png?utm_source=${i % 3 ? "commons.wikimedia.org" : "en.wikipedia.org"}&utm_campaign=imageinfo&utm_content=thumbnail`);
  const teams: BoardTeam[] = Array.from({ length: 540 }, (_, i): BoardTeam => ({
    lg: leagues[i % 5], f: 1000 + i, name: `Some City Club ${i} Hawks`, former: i % 4 === 0 ? [[`Old Name ${i}`, i % 80], [`Older Name ${i}`, -1]] : [],
    first: i % 17 === 0 ? null : 1900 + (i % 100), last: i % 17 === 0 ? null : 2000 + (i % 26), seasons: i % 90, titles: i % 7, share: i % 11 === 0 ? null : Math.round((i % 1000)) / 1000,
    active: i % 3 === 0, logo: i % 9 === 0 ? -1 : i % 80, cc: i % 13 === 0 ? null : ["US", "CA"][i % 2], lat: i % 13 === 0 ? null : 33.808 + i / 1000, lon: i % 13 === 0 ? null : -117.877 - i / 1000,
    place: i % 13 === 0 ? null : `City ${i % 120}, ST`, places: i % 6 === 0 ? [] : [["West", "Pacific"], [null, "West"], ["East", null]].slice(0, 1 + (i % 3)) as [string | null, string | null][],
  }));
  const wire = packTeams(teams, logos);
  const back = unpackTeams(wire);
  assert.deepEqual(back.logos, logos);
  assert.deepEqual(back.teams, teams);
  assert.ok(JSON.stringify(wire).length < 125 * teams.length + 8000, "a franchise costs about a hundred bytes in the page");
  assert.ok(wire.lg.length === 5 && wire.pl.length === 3, "league codes and conference pairs are written once");
});

test("the awards grid draws its cup once, as a mask, not beside every winner", () => {
  const grid = read("components/AwardsGrid.tsx");
  assert.ok(grid.includes('className="awardwin cupped"') && !grid.includes("<AwardCup"), "a cell carries no drawing of its own");
  const league = read("components/LeagueAwards.tsx");
  assert.ok(league.includes("<CupMask") && !league.includes("<CupSprite"), "the cup is set once for the table");
  assert.ok(read("components/people.css").includes(".cupped::before"), "the cup is painted by the cell's ::before");
});

test("a city's timeline is drawn in the browser when near, and its legend stays in the page", () => {
  const board = read("components/CityBoard.tsx");
  assert.ok(board.includes("<CityTimelineLazy") && !board.includes("<CityTimeline "), "the board draws no timeline of its own");
  const lazy = read("components/CityTimelineLazy.tsx");
  assert.ok(lazy.includes("useSeen") && lazy.includes("ssr: false") && lazy.includes("timeline.legend"), "the drawing waits until the reader is near; the legend is in the page");
  assert.ok(board.includes("<MiniCupUse") && !board.includes("<MiniCup "), "the list of titles carries no drawing of a cup in every entry");
  assert.ok(read("app/[locale]/s/city/[slug]/page.tsx").includes("<CupSprite"), "the cups are drawn once for the page");
  assert.ok(!/abbrs = Object.fromEntries\(await Promise.all\(LEAGUE_CODES/.test(read("app/[locale]/s/city/[slug]/page.tsx")), "the page reads the short forms of its clubs' leagues, not of all of them");
});

test("the MLS season page sends its matches as lines and keeps every match on a page of its own", () => {
  assert.ok(MLS_MATCHES_HEAD <= 20, "the table's head is a few rows");
  const page = read("app/[locale]/s/mls/[year]/page.tsx");
  assert.ok(page.includes("<MlsMatchesTable") && page.includes("buildMlsMatches(") && !page.includes("matchTable"), "no match table drawn on the server");
  const table = read("components/MlsMatchesTable.tsx");
  assert.ok(table.includes("useReveal(") && table.includes("partial="), "the table draws its first rows and shows the rest on request");
  const all = read("app/[locale]/s/mls/[year]/matches/page.tsx");
  assert.ok(all.includes("export const revalidate = 2592000;") && all.includes(" full ") && !/searchParams|cookies\(|headers\(/.test(all), "the matches page is every row, kept, reading nothing per request");
  assert.ok(read("app/[locale]/q/mls/[year]/matches/page.tsx").includes("s/mls/[year]/matches/page"), "the matches page has its twin in q/");
});

test("a franchise's map answer carries no league-wide venue list: that is its own route, worked out once per league", () => {
  const map = read("lib/franchiseMap.ts");
  assert.ok(!/teams\b[^\n]*getVenueTeams\(/.test(map.split("export async function leagueVenueTeams")[0]), "franchiseMapView does not build the league's venue list");
  assert.ok(read("app/[locale]/s/[league]/rows/venues/route.ts").includes("leagueVenueTeams(lg, say)"));
  assert.equal(venuesRestPath("/nhl/team/montreal-canadiens"), "/nhl/rows/venues");
  assert.ok(read("lib/mapView.ts").includes("export interface LeagueVenues"));
});

test("the players list sends short lines and the browser draws the cells; the country chips are short arrays; no team tables ride along", () => {
  const page = read("app/[locale]/q/players/page.tsx");
  assert.ok(page.includes("<PlayersTable") && !page.includes("<SortTable") && !page.includes("tableOf("), "the page gives the table lines, not drawn cells");
  assert.ok(read("components/PlayersTable.tsx").includes("remote"), "a sort still asks the server for the rows in order");
  assert.ok(read("components/PlayerCountries.tsx").includes("<CountryChips") && !read("components/PlayerCountries.tsx").includes("<Flag code={c.code}"), "the chips are not a server-drawn flag and link each");
  assert.ok(read("components/CountryChips.tsx").includes("wanted ? more.map(chip)"), "the countries behind More countries are drawn once the list is opened");
  for (const side of ["s", "q"]) assert.ok(!existsSync(new URL(`../src/app/[locale]/${side}/players/layout.tsx`, import.meta.url)), `${side}/players carries no team addresses or logo fits (the list names its teams with ready addresses)`);
});

test("a big season table sends short lines and draws a head until \"Show all\", which is a real link to the table in full", () => {
  assert.equal(headPerGroup(1), STANDINGS_HEAD);
  assert.equal(headPerGroup(13), 3, "a head per conference, never fewer than three");
  assert.equal(headPerGroup(2), 20);
  assert.ok(STANDINGS_FULL >= 32 && STANDINGS_HEAD <= STANDINGS_FULL, "the leagues of thirty-odd clubs are drawn whole");
  assert.deepEqual(seasonStandKeys({ place: "col.confDiv", nhl: false, showT: false, showO: true, showP: true, showHome: true, showRoad: true }), ["team", "place", "gp", "w", "l", "otl", "pts", "pf", "pa", "home", "road", "pct"]);
  const page = read("app/[locale]/q/[league]/[year]/page.tsx");
  assert.ok(page.includes("<SeasonStandings") && !page.includes("<SortTable") && !page.includes("tableOf("), "the page gives the table lines, not drawn cells");
  assert.ok(/allHref=\{bigTable \? standAll : undefined\}/.test(page) && page.includes('{ full: "1" }'), "Show all links to the table drawn in full");
  assert.ok(QUERY_KEYS.includes("full"), "?full= is a query key, so that address is drawn in q/");
  assert.ok(page.includes("parentByClub.size ? <TeamData"), "the page re-wraps its team data only for the parent leagues of a minor league (the league's layout has the rest)");
  const table = read("components/SortTable.tsx");
  assert.ok(table.includes("groupLimit") && table.includes("allHref"), "the table can cap each group and link its Show all");
  assert.ok(read("components/SeasonPostseason.tsx").includes("<PostseasonTable"), "the postseason is lines too");
});

/**
 * The real pages, measured. Run against a built site on a port of this project's block (it needs DS1's PostgREST for the data):
 *   PAGES_URL=http://localhost:7705 pnpm test:weight      (PLAYER_PAGES_URL works too)
 * Skipped when the variable is not set.
 */
const LIVE = process.env.PAGES_URL ?? process.env.PLAYER_PAGES_URL;
const PLAYER_PAGES: { path: string; budget: number }[] = [
  { path: "/mlb/player/156", budget: PLAYER_BUDGET },
  { path: "/nhl/player/1866", budget: PLAYER_BUDGET },
  { path: "/nba/player/2786", budget: PLAYER_BUDGET },
  { path: "/mlb/player/41518", budget: PAGE_BUDGET },
  { path: "/worldcup/player/76534", budget: PAGE_BUDGET },
];
/** The floor every page stands on: the document, header, footer and the sign-in and language scripts, nothing else. A small static page shows what the root layout sends. */
const ROOT_FLOOR = 45 * 1000;
const FLOOR_PAGES = [{ path: "/privacy", budget: ROOT_FLOOR }, { path: "/terms", budget: 60 * 1000 }];
/** The home page: the figures, the archive chart's seasons as packed numbers and a card for each league. It was 471 KB, drawing every square of the chart as markup. */
const HOME_PAGES = [{ path: "/", budget: 120 * 1000 }];

/** The teams list: every franchise as a short array, drawn and filtered in the browser (it was 363 KB of HTML, 304 KB of it the list as named fields). */
const TEAMS_PAGES = [{ path: "/teams", budget: 250 * 1000 }];

/** The players list: a hundred players a page, each once as a short line (it was 392 KB: every row as markup and again as elements, every country as a flag and link, and every club's address). */
const SEASON_PAGES = ["/ncaaf/2024", "/ncaaf/2024?view=conference", "/ncaaf/2023", "/mlb/2024"].map((path) => ({ path, budget: PAGE_BUDGET }));

const PLAYERS_PAGES = ["/players", "/players?league=nhl", "/players?sort=seasons.desc"].map((path) => ({ path, budget: path.includes("sort") ? PAGE_BUDGET : 250 * 1000 }));

/** A league's awards by season, every season on one page: about a thousand winners, each once had a cup drawing of its own in the markup (380 KB). */
const AWARDS_PAGES = ["nhl", "nba", "mlb", "nfl"].map((lg) => ({ path: `/${lg}/awards`, budget: TABLE_BUDGET }));

/** A city with many clubs: the timeline of its clubs' seasons was drawn on the server (over 100 KB of markup, 645 KB for New York) and took most of its first render. */
const CITY_PAGES = ["toronto", "chicago", "new-york", "boston", "los-angeles", "montreal", "detroit"].map((c) => ({ path: `/city/${c}`, budget: PAGE_BUDGET }));

/** An MLS season: a full season's games was 1,045 KB of HTML (the table drawn as markup and sent again as elements). The season page, and the page of every match. */
const MLS_PAGES = [
  ...["1996", "2008", "2020", "2025"].map((y) => ({ path: `/mls/${y}`, budget: PAGE_BUDGET })),
  ...["2008", "2025"].map((y) => ({ path: `/mls/${y}/matches`, budget: TABLE_BUDGET })),
];

/** The all-time page of every league (its default view), and the heaviest leagues' table view, which lists every franchise. */
const ALL_TIME_LEAGUES = ["nhl", "pwhl", "nba", "wnba", "mlb", "nfl", "ncaaf", "cfl", "nwsl", "afl", "aafc", "nha", "pcha", "wchl", "wha", "ahl", "echl", "na", "aa", "ua", "pl", "fl"];
const ALL_TIME_PAGES = [
  ...ALL_TIME_LEAGUES.map((lg) => ({ path: `/${lg}/all-time`, budget: PAGE_BUDGET })),
  ...["nhl", "nba", "mlb", "nfl", "ncaaf"].flatMap((lg) => [{ path: `/${lg}/all-time?view=table`, budget: TABLE_BUDGET }, { path: `/${lg}/all-time?view=charts`, budget: PAGE_BUDGET }]),
];
/** Players by country, and the world page of every league whose players have a country (and a season of the heaviest ones), each with the page of its full tables. */
const WORLD_LEAGUES = ["nhl", "pwhl", "nba", "wnba", "mlb", "nfl", "cfl", "nwsl", "afl", "aafc", "nha", "pcha", "wchl", "wha", "ahl", "echl", "na", "aa", "ua", "pl", "fl"];
const WORLD_PAGES = [
  { path: "/countries", budget: PAGE_BUDGET },
  { path: "/countries/versus", budget: TABLE_BUDGET },
  { path: "/countries/firsts", budget: TABLE_BUDGET },
  ...WORLD_LEAGUES.map((lg) => ({ path: `/${lg}/world`, budget: PAGE_BUDGET })),
  ...["nhl", "nba", "mlb", "nfl"].map((lg) => ({ path: `/${lg}/world/tables`, budget: TABLE_BUDGET })),
  { path: "/nhl/2024-25/world", budget: PAGE_BUDGET },
  { path: "/nba/2024-25/world", budget: PAGE_BUDGET },
  { path: "/mlb/2025/world", budget: PAGE_BUDGET },
  { path: "/nfl/2024/world", budget: PAGE_BUDGET },
];
for (const { path, budget } of [...FLOOR_PAGES, ...HOME_PAGES, ...TEAMS_PAGES, ...PLAYERS_PAGES, ...SEASON_PAGES, ...AWARDS_PAGES, ...CITY_PAGES, ...MLS_PAGES, ...PLAYER_PAGES, ...ALL_TIME_PAGES, ...WORLD_PAGES]) {
  test(`${path} stays under ${budget / 1000} KB of HTML`, { skip: LIVE ? false : "set PAGES_URL to measure a running site" }, async () => {
    const res = await fetch(`${LIVE}${path}`, { headers: { "accept-encoding": "identity" } });
    assert.equal(res.status, 200);
    const bytes = (await res.arrayBuffer()).byteLength;
    assert.ok(bytes < budget, `${path} is ${bytes} bytes against ${budget}`);
  });
}

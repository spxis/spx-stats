import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { AWARD_GRID_HEAD, AWARD_MANY, awardGridPagePath, awardGridRestPath, awardHead, buildAwardGrid, type AwardInput } from "../src/lib/awardGrid.ts";
import { CHAMP_HEAD, buildChampLines, champHead, champNoteText, champPagePath, champRestPath, type ChampSeason } from "../src/lib/champLines.ts";
import { packBoard } from "../src/lib/playerBoardWire.ts";
import { clubInfoKey, type BoardData } from "../src/lib/playerBoard.ts";
import { packTable, unpackTable, type SlugTable } from "../src/lib/slug.ts";
import { FULL_SHARE, leagueSeasonBars, leagueSeasonRows } from "../src/lib/leagueSeasonRows.ts";

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
const awardLook = { player: (id: number, name: string) => `/nhl/player/${name.toLowerCase().replace(/\W+/g, "-")}-${id}`, logo: lookup.logo as (f: number, y: number) => string | null };

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
  assert.ok(Array.isArray(player) && player[0].h?.startsWith("/nhl/player/") && player[0].lo === undefined);
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

/**
 * The real pages, measured. Run against a built site on a port of this project's block (it needs DS1's PostgREST for the data):
 *   PLAYER_PAGES_URL=http://localhost:7705 pnpm test:weight
 * Skipped when the variable is not set.
 */
const LIVE = process.env.PLAYER_PAGES_URL;
const PLAYER_PAGES: { path: string; budget: number }[] = [
  { path: "/mlb/player/156", budget: PLAYER_BUDGET },
  { path: "/nhl/player/1866", budget: PLAYER_BUDGET },
  { path: "/nba/player/2786", budget: PLAYER_BUDGET },
  { path: "/mlb/player/41518", budget: PAGE_BUDGET },
  { path: "/worldcup/player/76534", budget: PAGE_BUDGET },
];
for (const { path, budget } of PLAYER_PAGES) {
  test(`${path} stays under ${budget / 1000} KB of HTML`, { skip: LIVE ? false : "set PLAYER_PAGES_URL to measure a running site" }, async () => {
    const res = await fetch(`${LIVE}${path}`, { headers: { "accept-encoding": "identity" } });
    assert.equal(res.status, 200);
    const bytes = (await res.arrayBuffer()).byteLength;
    assert.ok(bytes < budget, `${path} is ${bytes} bytes against ${budget}`);
  });
}

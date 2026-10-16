import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { AWARD_GRID_HEAD, AWARD_MANY, awardGridPagePath, awardGridRestPath, awardHead, buildAwardGrid, type AwardInput } from "../src/lib/awardGrid.ts";
import { CHAMP_HEAD, buildChampLines, champHead, champNoteText, champPagePath, champRestPath, type ChampSeason } from "../src/lib/champLines.ts";
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

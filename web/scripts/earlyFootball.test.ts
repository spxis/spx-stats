import assert from "node:assert/strict";
import { test } from "node:test";
import { championRow, satYears, titleHolders } from "../src/lib/champions.ts";
import { gapSeason, isGapYear, withCoverage, withGaps } from "../src/lib/coverage.ts";
import { neutralSite } from "../src/lib/gameSurface.ts";
import { isLeague, LEAGUE_CODES, LEAGUES, LG, seasonLabel, SUPER_BOWL_SINCE } from "../src/lib/leagues.ts";
import { datedRound, finalName, roundName } from "../src/lib/series.ts";
import { championshipName, trophyPhrase } from "../src/lib/trophies.ts";
import type { Say } from "../src/lib/seriesCopy.ts";
import { readFileSync } from "node:fs";

/**
 * The NFL's seasons begin in 1920 (the APFA's first), not 1972, and the AFL (1960-1969) is a league of its own. Run in web/: pnpm test:football
 * What these pin down: the season list of a league follows its rows (no hard-coded first year), no year inside a league's span is a "gap" while every row is
 * there, the AFL is a league the site knows (and a closed one), and the last game of an early NFL season is the NFL Championship, not a Super Bowl.
 */
// The series words as seriesCopy.ts spells them (that module needs the site's path aliases, which node's test runner does not have, so its lines are read).
const copy = Object.fromEntries([...readFileSync(new URL("../src/lib/seriesCopy.ts", import.meta.url), "utf8").matchAll(/^\s+"([\w.]+)": "(.*)",$/gm)].map((m) => [m[1], m[2]]));
const say = ((key: string, vars: Record<string, string | number> = {}) => (copy[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k]))) as unknown as Say;

const row = (league: string, year: number, champion: string | null, o: Partial<{ games: number; teams: number; franchise: number | null }> = {}) => ({
  league, year, label: String(year), games: o.games ?? 100, finals: o.games ?? 100, playoff_finals: 1, teams: o.teams ?? 14,
  champion, champion_note: null, champion_source: null, champion_franchise: o.franchise ?? null,
});
/** What api.season_summary holds once the early seasons are loaded: NFL 1920-2025, AFL 1960-1969. */
const nfl = Array.from({ length: 2025 - 1920 + 1 }, (_, i) => row("nfl", 1920 + i, i % 2 ? "Green Bay Packers" : "Chicago Bears", { franchise: i % 2 ? 152 : 150 }));
const AFL_CHAMPIONS: [string, number][] = [["Houston Oilers", 138], ["Houston Oilers", 138], ["Dallas Texans", 143], ["Buffalo Bills", 130], ["Buffalo Bills", 130],
  ["San Diego Chargers", 145], ["Kansas City Chiefs", 143], ["Oakland Raiders", 144], ["New York Jets", 133], ["Kansas City Chiefs", 143]];
const afl = AFL_CHAMPIONS.map(([name, franchise], i) => row("afl", 1960 + i, name, { teams: i < 6 ? 8 : 9, franchise }));

test("the AFL is a league the site knows, a closed one, and its seasons are single years", () => {
  assert.ok(isLeague("afl"));
  assert.ok(LEAGUE_CODES.includes("afl"));
  assert.deepEqual(LEAGUES.find((l) => l.code === "afl"), { code: "afl", name: "American Football League", short: "AFL", closed: true });
  assert.equal(LG.afl, "AFL");
  assert.equal(seasonLabel("afl", 1965), "1965");
  assert.equal(seasonLabel("nfl", 1920), "1920");
  assert.ok(LEAGUES.filter((l) => l.code !== "afl" && l.code !== "aafc").every((l) => !l.closed));
});

test("a league's first and last season come from its rows: the NFL starts in 1920, the AFL in 1960 and ends in 1969", () => {
  const all = [...nfl, ...afl];
  const years = (lg: string) => all.filter((s) => s.league === lg).map((s) => s.year);
  assert.equal(Math.min(...years("nfl")), 1920);
  assert.equal(Math.max(...years("nfl")), 2025);
  assert.equal(years("nfl").length, 106);
  assert.equal(Math.min(...years("afl")), 1960);
  assert.equal(Math.max(...years("afl")), 1969);
  assert.equal(years("afl").length, 10);
});

test("no year inside the NFL's or the AFL's span is a gap while every season has its row", () => {
  const all = [...nfl, ...afl];
  assert.equal(withGaps(all).length, all.length);
  assert.ok(!isGapYear(all, "nfl", 1943) && !isGapYear(all, "nfl", 1972) && !isGapYear(all, "afl", 1965));
  assert.deepEqual([...satYears(all, "nfl")], []);
  assert.deepEqual([...satYears(all, "afl")], []);
  // a season the data lacks (the 1972 season, before it was loaded) is the only thing that turns a year into a gap
  const without1972 = all.filter((s) => !(s.league === "nfl" && s.year === 1972));
  assert.ok(isGapYear(without1972, "nfl", 1972));
  assert.equal(withGaps(without1972).filter((s) => s.league === "nfl" && s.year === 1972)[0].games, 0);
  assert.deepEqual(gapSeason("nfl", 1972).label, "1972");
});

test("coverage of early seasons is judged against their own era, not against 2025", () => {
  const rows = withCoverage([...nfl.map((s) => ({ ...s, games: s.year < 1960 ? 72 : 256, finals: s.year < 1960 ? 72 : 256 })), ...afl.map((s) => ({ ...s, games: 57, finals: 57 }))]);
  assert.equal(rows.find((s) => s.league === "nfl" && s.year === 1950)!.share, 1);
  assert.equal(rows.find((s) => s.league === "afl" && s.year === 1962)!.share, 1);
  const half = withCoverage(nfl.map((s) => ({ ...s, games: 100, finals: s.year === 1950 ? 40 : 100 })));
  assert.ok(half.find((s) => s.year === 1950)!.share < 0.5);
});

test("the AFL's champions: the latest, the most titles", () => {
  const boxes = championRow(afl, "afl");
  assert.equal(boxes.find((b) => b.kind === "recent")?.year, 1969);
  assert.deepEqual(boxes.filter((b) => b.kind === "recent").map((b) => b.year), [1969, 1968, 1967, 1966]);
  const most = boxes.find((b) => b.kind === "most");           // the Chiefs, with their Dallas Texans title: three of the ten
  assert.deepEqual([most?.f, most?.n], [143, 3]);
  assert.equal(titleHolders(afl, "afl").before(1960), null);
  assert.equal(titleHolders(afl, "afl").before(1961)?.champion, "Houston Oilers");
});

test("the last game of an NFL season before 1970 is the NFL Championship, the AFL's is the AFL Championship", () => {
  assert.equal(SUPER_BOWL_SINCE, 1970);
  for (const y of [1920, 1932, 1950, 1966, 1969]) assert.equal(finalName("nfl", y, say), "NFL Championship");
  assert.equal(finalName("nfl", 1970, say), "Super Bowl V");
  assert.equal(finalName("nfl", 1972, say), "Super Bowl VII");
  assert.equal(finalName("nfl", 2025, say), "Super Bowl LX");
  for (const y of [1960, 1964, 1969]) assert.equal(finalName("afl", y, say), "AFL Championship");
  assert.equal(roundName("afl", 1963, 2, 2, say), "AFL Championship");
  assert.equal(roundName("afl", 1963, 1, 2, say), "Semifinals");
  assert.equal(datedRound("nfl", 1969, 1970, "NFL Championship", true, say), "1970 NFL Championship");
  assert.equal(datedRound("nfl", 1970, 1971, "x", true, say), "Super Bowl V (1971)");
});

test("the championship games before the Super Bowl were played at a club's ground, not at a neutral site", () => {
  assert.ok(!neutralSite("nfl", 1966, "playoffs", true));
  assert.ok(!neutralSite("nfl", 1969, "playoffs", true));
  assert.ok(neutralSite("nfl", 1970, "playoffs", true));
  for (const y of [1960, 1966, 1969]) assert.ok(!neutralSite("afl", y, "playoffs", true));
});

test("an NFL title before 1970 is the NFL Championship, not the Super Bowl or the Vince Lombardi Trophy; the AFL has no cup of its own here", () => {
  assert.equal(championshipName("nfl", 1943, "Super Bowl"), "NFL Championship");
  assert.equal(championshipName("nfl", 1969, "Super Bowl"), "NFL Championship");
  assert.equal(championshipName("nfl", 1970, "Super Bowl"), "Super Bowl");
  assert.equal(championshipName("afl", 1964, "AFL Championship"), "AFL Championship");
  assert.equal(championshipName("nhl", 1920, "Stanley Cup"), "Stanley Cup");
  assert.equal(trophyPhrase("nfl", 1950), "rnd.nflOld");
  assert.equal(trophyPhrase("nfl", 1970), "trophy.name.nfl");
  assert.equal(trophyPhrase("nfl"), "trophy.name.nfl");
  assert.equal(trophyPhrase("cfl", 1950), "trophy.name.cfl");
  assert.equal(trophyPhrase("afl", 1964), null);
});

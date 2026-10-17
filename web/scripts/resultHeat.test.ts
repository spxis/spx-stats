import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameRow } from "../src/lib/api/types.ts";
import {
  addDays, buildHeat, clipHeatGames, eachDay, heatGamesFromRows, heatGamesFromTeam, heatRecord,
  packHeat, tallyHeat, toneOf, unpackHeat, weekdayUtc, type HeatGame,
} from "../src/lib/resultHeat.ts";
import type { TeamGame } from "../src/lib/teamSeason.ts";

/** Run in web/: pnpm test:rheat. The GitHub-style win-loss calendar: no gaps, W / L / T / OTL, pack round-trip. */

const g = (over: Partial<HeatGame> & Pick<HeatGame, "date" | "id">): HeatGame => ({
  year: Number(over.date.slice(0, 4)), res: "W", ot: false, mine: 3, theirs: 2, home: true,
  awayName: "Bruins", homeName: "Hurricanes", ...over,
});

test("each day from first through last is present; a reversed or empty span is empty", () => {
  assert.deepEqual(eachDay("2024-01-30", "2024-02-02"), ["2024-01-30", "2024-01-31", "2024-02-01", "2024-02-02"]);
  assert.deepEqual(eachDay("2020-02-28", "2020-03-01"), ["2020-02-28", "2020-02-29", "2020-03-01"]);
  assert.deepEqual(eachDay("2024-10-11", "2024-10-11"), ["2024-10-11"]);
  assert.deepEqual(eachDay("2024-10-12", "2024-10-11"), []);
});

test("addDays and weekday stay on UTC calendar days (2024-01-07 is a Sunday)", () => {
  assert.equal(addDays("2024-01-07", 1), "2024-01-08");
  assert.equal(addDays("2024-01-31", 1), "2024-02-01");
  assert.equal(weekdayUtc("2024-01-07"), 0);
  assert.equal(weekdayUtc("2024-01-13"), 6);
});

test("tone: empty, pending, one result, or split when two finished games disagree", () => {
  assert.equal(toneOf([]), null);
  assert.equal(toneOf([g({ date: "2024-01-01", id: 1, res: null })]), "pending");
  assert.equal(toneOf([g({ date: "2024-01-01", id: 1, res: "W" })]), "W");
  assert.equal(toneOf([g({ date: "2024-01-01", id: 1, res: "OTL" })]), "OTL");
  assert.equal(toneOf([g({ date: "2024-01-01", id: 1, res: "W" }), g({ date: "2024-01-01", id: 2, res: "L" })]), "split");
  assert.equal(toneOf([g({ date: "2024-01-01", id: 1, res: "W" }), g({ date: "2024-01-01", id: 2, res: null })]), "W");
});

test("the tally counts every finished game and writes the same record string as the rest of the site", () => {
  const games = [
    g({ date: "2024-01-01", id: 1, res: "W" }),
    g({ date: "2024-01-02", id: 2, res: "L" }),
    g({ date: "2024-01-03", id: 3, res: "T" }),
    g({ date: "2024-01-04", id: 4, res: "OTL" }),
    g({ date: "2024-01-05", id: 5, res: null }),
  ];
  assert.deepEqual(tallyHeat(games), { w: 1, l: 1, t: 1, otl: 1 });
  assert.equal(heatRecord(tallyHeat(games)), "1–1–1–1");
  assert.equal(heatRecord({ w: 4, l: 3, t: 0, otl: 0 }), "4–3");
});

test("the grid has a cell for every day from first game through last, including days with no game", () => {
  const grid = buildHeat([
    g({ date: "2024-10-11", id: 1, res: "W" }),
    g({ date: "2024-10-14", id: 2, res: "L" }),
  ]);
  assert.ok(grid);
  assert.equal(grid!.first, "2024-10-11");
  assert.equal(grid!.last, "2024-10-14");
  assert.equal(grid!.days, 4);
  const cells = grid!.years[0]!.weeks.flat().filter((c): c is NonNullable<typeof c> => c != null);
  assert.deepEqual(cells.map((c) => c.date), ["2024-10-11", "2024-10-12", "2024-10-13", "2024-10-14"]);
  assert.deepEqual(cells.map((c) => c.tone), ["W", null, null, "L"]);
});

test("a span that crosses 1 January stacks two years, newest first, and does not skip New Year's Day", () => {
  const grid = buildHeat([
    g({ date: "2023-12-30", id: 1, year: 2023, res: "W" }),
    g({ date: "2024-01-02", id: 2, year: 2023, res: "L" }),
  ]);
  assert.ok(grid);
  assert.deepEqual(grid!.years.map((y) => y.year), [2024, 2023]);
  const days = grid!.years.flatMap((y) => y.weeks.flat().filter((c): c is NonNullable<typeof c> => c != null).map((c) => c.date));
  assert.deepEqual(days, ["2024-01-01", "2024-01-02", "2023-12-30", "2023-12-31"]);
});

test("weeks start on Sunday so a Wednesday game sits in column 3", () => {
  // 2024-10-09 is a Wednesday.
  const grid = buildHeat([g({ date: "2024-10-09", id: 1 })]);
  const week = grid!.years[0]!.weeks[0]!;
  assert.equal(week.filter(Boolean).length, 1);
  assert.equal(week[3]!.date, "2024-10-09");
  assert.equal(week[0], null);
  assert.equal(week[2], null);
});

test("clipHeatGames keeps season years in from..to", () => {
  const games = [g({ date: "2023-01-01", id: 1, year: 2022 }), g({ date: "2024-01-01", id: 2, year: 2023 })];
  assert.deepEqual(clipHeatGames(games, 2023, 2023).map((x) => x.id), [2]);
});

test("heatGamesFromRows uses resultFor / countsOtl and leaves preseason out", () => {
  const row = (over: Partial<GameRow> & Pick<GameRow, "game_id" | "game_date" | "year">): GameRow => ({
    league: "nhl", phase: "regular", status: "final", away_id: 2, away: "Bruins", away_score: 2,
    home_id: 1, home: "Hurricanes", home_score: 3, overtime: false, source: "spx", checked: 1,
    away_f: 20, home_f: 10, ...over,
  });
  const games = heatGamesFromRows("nhl", 10, [
    row({ game_id: 1, game_date: "1998-10-10", year: 1998, overtime: true, home_score: 2, away_score: 3 }),
    row({ game_id: 2, game_date: "1999-10-10", year: 1999, overtime: true, home_score: 2, away_score: 3 }),
    row({ game_id: 3, game_date: "1999-09-20", year: 1999, phase: "preseason" }),
    row({ game_id: 4, game_date: "1999-10-12", year: 1999, status: "scheduled", home_score: null, away_score: null }),
  ]);
  assert.deepEqual(games.map((x) => [x.id, x.res]), [[1, "L"], [2, "OTL"], [4, null]]);
});

test("heatGamesFromTeam keeps regular and playoff rows and builds away/home names from loc", () => {
  const tg = (over: Partial<TeamGame> & Pick<TeamGame, "id" | "date" | "ph" | "loc">): TeamGame => ({
    oppF: 2, oppName: "Bruins", mine: 4, theirs: 1, res: "W", ot: false, margin: 3, src: "spx", v: 1,
    rec: "1–0", recPct: 1, tuple: [over.date, 2, 1, 4, 1, over.ph, "f", "spx", 0, 1, over.id],
    nhlId: null, nflWeek: null, retroBox: null, status: "final", startsAt: null, ...over,
  });
  const games = heatGamesFromTeam([
    tg({ id: 1, date: "2024-10-11", ph: "r", loc: "Home" }),
    tg({ id: 2, date: "2024-10-12", ph: "p", loc: "Away", res: "L", mine: 1, theirs: 2 }),
    tg({ id: 3, date: "2024-09-20", ph: "s", loc: "Home" }),
  ], 2024, "Hurricanes");
  assert.deepEqual(games.map((x) => [x.id, x.home, x.awayName, x.homeName, x.res]), [
    [1, true, "Bruins", "Hurricanes", "W"],
    [2, false, "Hurricanes", "Bruins", "L"],
  ]);
});

test("packHeat / unpackHeat is a round trip", () => {
  const games = [
    g({ date: "2024-10-11", id: 99, res: "OTL", ot: true, mine: 2, theirs: 3, home: false }),
    g({ date: "2024-10-12", id: 100, res: null, mine: null, theirs: null, awayName: null }),
  ];
  assert.deepEqual(unpackHeat(packHeat("nhl", 10, games)), games);
  assert.deepEqual(unpackHeat({ lg: "nhl", f: 10, names: [], rows: "" }), []);
});

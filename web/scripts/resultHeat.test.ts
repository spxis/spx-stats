import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameRow } from "../src/lib/api/types.ts";
import {
  HEAT_ROWS, HEAT_SPAN_ROWS, HEAT_TARGET_COLS, buildHeat, clipHeatGames, gameTone, heatGamesFromRows, heatGamesFromTeam,
  heatHover, heatPack, heatRecord, heatSeasons, packHeat, tallyHeat, unpackHeat, type HeatCell, type HeatGame,
} from "../src/lib/resultHeat.ts";
import type { TeamGame } from "../src/lib/teamSeason.ts";

/** Run in web/: pnpm test:rheat. One square per game, 8-row pack, W / L / T / OTL, pack round-trip. */

const g = (over: Partial<HeatGame> & Pick<HeatGame, "date" | "id">): HeatGame => ({
  year: Number(over.date.slice(0, 4)), res: "W", ot: false, mine: 3, theirs: 2, home: true,
  awayName: "Bruins", homeName: "Hurricanes", ...over,
});

const cellsOf = (grid: NonNullable<ReturnType<typeof buildHeat>>): HeatCell[] =>
  grid.columns.flat().filter((c): c is HeatCell => c != null);

test("gameTone is the result, or pending when there is none", () => {
  assert.equal(gameTone(g({ date: "2024-01-01", id: 1, res: "W" })), "W");
  assert.equal(gameTone(g({ date: "2024-01-01", id: 1, res: "OTL" })), "OTL");
  assert.equal(gameTone(g({ date: "2024-01-01", id: 1, res: null })), "pending");
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

test("the grid has one square per game and no empty day cells", () => {
  const games = [
    g({ date: "2024-10-11", id: 1, res: "W" }),
    g({ date: "2024-10-14", id: 2, res: "L" }),
  ];
  const grid = buildHeat(games);
  assert.ok(grid);
  assert.equal(grid!.games, 2);
  assert.equal(grid!.rows, HEAT_ROWS);
  const cells = cellsOf(grid!);
  assert.equal(cells.length, 2);
  assert.deepEqual(cells.map((c) => c.game.id), [1, 2]);
  assert.deepEqual(cells.map((c) => c.tone), ["W", "L"]);
  assert.equal(cells.some((c) => c.game.date === "2024-10-12"), false);
});

test("82 games fill 82 squares in 8-row columns (10 full columns and 2 in the last)", () => {
  const games = Array.from({ length: 82 }, (_, i) => g({ date: `2024-10-${String((i % 28) + 1).padStart(2, "0")}`, id: i + 1, year: 2024 }));
  const grid = buildHeat(games);
  assert.ok(grid);
  assert.equal(grid!.games, 82);
  assert.equal(cellsOf(grid!).length, 82);
  assert.equal(grid!.rows, HEAT_ROWS);
  assert.equal(grid!.cols, 11);
  assert.equal(grid!.columns[10]!.filter(Boolean).length, 2);
  assert.equal(grid!.columns[0]!.filter(Boolean).length, 8);
});

test("all-time packing is one graph, not a year stack, and labels each season's first column", () => {
  const games = [
    g({ date: "2023-12-30", id: 1, year: 2023, res: "W" }),
    g({ date: "2024-01-02", id: 2, year: 2023, res: "L" }),
    g({ date: "2024-10-10", id: 3, year: 2024, res: "W" }),
  ];
  const grid = buildHeat(games);
  assert.ok(grid);
  assert.equal(grid!.cols, 1);
  assert.deepEqual(grid!.marks, [{ col: 0, year: 2023 }]);
  assert.deepEqual(cellsOf(grid!).map((c) => c.game.year), [2023, 2023, 2024]);
  assert.equal(grid!.marks.filter((m) => m.col === 0).length, 1);
});

test("a new season that starts in a later column gets its own mark", () => {
  const games = [
    ...Array.from({ length: 8 }, (_, i) => g({ date: `2023-10-${String(i + 1).padStart(2, "0")}`, id: i + 1, year: 2023 })),
    g({ date: "2024-10-10", id: 9, year: 2024 }),
  ];
  const grid = buildHeat(games);
  assert.deepEqual(grid!.marks, [{ col: 0, year: 2023 }, { col: 1, year: 2024 }]);
});

test("clipHeatGames and heatSeasons keep season years", () => {
  const games = [g({ date: "2023-01-01", id: 1, year: 2022 }), g({ date: "2024-01-01", id: 2, year: 2023 })];
  assert.deepEqual(clipHeatGames(games, 2023, 2023).map((x) => x.id), [2]);
  assert.deepEqual(heatSeasons(games), [2022, 2023]);
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
    status: "final", ...over,
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

test("heatPack keeps a season in 8 rows and shrinks all-time to one GitHub-sized box", () => {
  const season = heatPack(82);
  assert.equal(season.rows, HEAT_ROWS);
  assert.equal(season.cols, 11);
  assert.equal(season.cell, 11);
  const all = heatPack(2400);
  assert.ok(all.cols * all.rows >= 2400);
  assert.ok(all.cols * (all.cell + all.gap) <= HEAT_TARGET_COLS * 14);
  assert.ok(all.rows * (all.cell + all.gap) <= HEAT_SPAN_ROWS * 14);
  const compact = heatPack(2400, true);
  assert.ok(compact.cols * (compact.cell + compact.gap) <= 340);
});

test("a season pack without fill stays at the GitHub cell, not a giant tile", () => {
  const natural = heatPack(96, { rows: HEAT_ROWS });
  const filled = heatPack(96, { width: 384, rows: HEAT_ROWS, fill: true });
  assert.equal(natural.rows, HEAT_ROWS);
  assert.equal(natural.cell, 11);
  assert.equal(filled.rows, HEAT_ROWS);
  assert.ok(filled.cell <= 14);
});

test("all-time packing uses the measured width with squares larger than a 3px strip", () => {
  const old = heatPack(5100, { width: 768 });
  assert.ok(old.cols * (old.cell + old.gap) <= 768);
  assert.ok(old.cell + old.gap >= 5);
  assert.ok(old.rows * (old.cell + old.gap) <= HEAT_SPAN_ROWS * 14);
});

test("heatHover names date, opponent, score and result", () => {
  assert.deepEqual(heatHover(g({ date: "1983-10-05", id: 1, res: "W", mine: 3, theirs: 2, home: true, awayName: "Kings" })), {
    date: "1983-10-05", opp: "Kings", home: true, score: "3–2", res: "W", ot: false,
  });
  assert.deepEqual(heatHover(g({ date: "1983-10-07", id: 2, res: "L", mine: 1, theirs: 4, home: false, homeName: "Canucks", ot: true })), {
    date: "1983-10-07", opp: "Canucks", home: false, score: "1–4", res: "L", ot: true,
  });
});

test("an all-time list of thousands of games still packs to one grid whose square count matches", () => {
  const games = Array.from({ length: 2400 }, (_, i) => {
    const year = 2000 + Math.floor(i / 80);
    return g({ date: `${year}-10-10`, id: i + 1, year, res: i % 3 === 0 ? "L" : "W" });
  });
  const pack = heatPack(2400);
  const grid = buildHeat(games);
  assert.ok(grid);
  assert.equal(grid!.games, 2400);
  assert.equal(cellsOf(grid!).length, 2400);
  assert.equal(grid!.rows, pack.rows);
  assert.equal(grid!.cols, pack.cols);
  assert.ok(grid!.cols * (pack.cell + pack.gap) <= HEAT_TARGET_COLS * 14);
  assert.ok(grid!.marks.length > 1);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { championRow, satYears, titleHolders, titleRun, titleStreak } from "../src/lib/champions.ts";

/** Run in web/: pnpm test:champions */
const season = (year: number, champion: number | null, o: Partial<{ games: number; teams: number; league: string }> = {}) => ({
  league: o.league ?? "cfl", year, label: String(year), games: o.games ?? 100, finals: o.games ?? 100, playoff_finals: 0, teams: o.teams ?? 9,
  champion: champion == null ? null : `Team ${champion}`, champion_note: null, champion_source: null, champion_franchise: champion,
});

// 2017 Toronto (1), 2018 Ottawa (2), 2019 Winnipeg (3), nothing in 2020, 2021 Toronto (1), 2022 Toronto (1)
const cfl = [season(2017, 1), season(2018, 2), season(2019, 3), season(2021, 1), season(2022, 1)];

test("years the league did not play: a missing row, an empty row, and the years the outage view names", () => {
  assert.deepEqual([...satYears(cfl, "cfl")], [2020]);
  const rows = [season(2003, 1), season(2004, null, { games: 0, teams: 0 }), season(2005, 2)];
  assert.deepEqual([...satYears(rows, "cfl")], [2004]);
  assert.deepEqual([...satYears(cfl, "cfl", [1994])].sort(), [1994, 2020]);
  assert.deepEqual([...satYears(cfl, "nhl")], []);
});

test("the champion going into a season is the nearest earlier one, however many seasons were not played", () => {
  const h = titleHolders(cfl, "cfl");
  assert.equal(h.before(2019)?.champion_franchise, 2);
  assert.equal(h.before(2020)?.champion_franchise, 3);
  assert.equal(h.before(2020)?.year, 2019);
  assert.equal(h.before(2021)?.champion_franchise, 3);
  assert.equal(h.before(2022)?.champion_franchise, 1);
});

test("two seasons in a row not played still go back to the last champion", () => {
  const h = titleHolders([season(2018, 2), season(2019, 3), season(2022, 1)], "cfl");
  assert.equal(h.before(2022)?.year, 2019);
  assert.equal(h.before(2021)?.year, 2019);
});

test("a season played without a champion on record is not skipped, unless the outage view says it was not played", () => {
  const rows = [season(1993, 1), season(1994, null), season(1995, 2)];
  assert.equal(titleHolders(rows, "cfl").before(1995), null);
  assert.equal(titleHolders(rows, "cfl", [1994]).before(1995)?.champion_franchise, 1);
});

test("nothing before the league's first season, and nothing for a league with no seasons", () => {
  assert.equal(titleHolders(cfl, "cfl").before(2017), null);
  assert.equal(titleHolders(cfl, "cfl").before(1990), null);
  assert.equal(titleHolders([], "cfl").before(2000), null);
  assert.equal(titleHolders(cfl, "nhl").before(2020), null);
});

test("a run of titles carries across a season not played", () => {
  const rows = [season(2018, 1), season(2019, 1), season(2021, 1), season(2022, 2)];
  const h = titleHolders(rows, "cfl");
  assert.equal(titleStreak(h.byYear, 1, 2019), 2);
  assert.equal(titleStreak(h.byYear, 1, 2021), 1);
  assert.equal(titleStreak(h.byYear, 1, 2021, h.sat), 3);
  assert.deepEqual(titleRun(h.byYear, 1, 2021, h.sat).map((x) => x.year), [2021, 2019, 2018]);
  assert.equal(titleStreak(h.byYear, 2, 2022, h.sat), 1);
});

test("the league page's repeat box counts a run that spans the gap", () => {
  const rows = [season(2018, 2), season(2019, 1), season(2020, null, { games: 0, teams: 0 }), season(2021, 1)];
  const box = championRow(rows, "cfl").find((b) => b.kind === "repeat");
  assert.equal(box?.n, 2);
  assert.equal(box?.from, "2019");
});

test("a title counts as reigning only from the most recent completed season of a league still playing", () => {
  const mixed = [season(1978, 1, { league: "wha" }), season(2024, 5, { league: "nhl" }), season(2025, 6, { league: "nhl" }), season(2026, null, { league: "nhl" })];
  assert.equal(titleHolders(mixed, "wha").reigning, null);
  assert.equal(titleHolders(mixed, "nhl").reigning?.year, 2025);
  assert.equal(titleHolders([...mixed.slice(0, 3), season(2026, 7, { league: "nhl" })], "nhl").reigning?.year, 2026);
});

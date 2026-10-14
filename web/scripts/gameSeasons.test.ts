import assert from "node:assert/strict";
import { test } from "node:test";
import { edgeSteps, playedYears, seasonSteps, windowSteps } from "../src/lib/gameSeasons.ts";

/** Run in web/: pnpm test:seasons */
const row = (year: number, games: number, finals = 0, playoff_finals = 0) => ({ year, games, finals, playoff_finals });

test("played years keep the seasons with any game, ascending", () => {
  assert.deepEqual(playedYears([row(2005, 0), row(2003, 1230), row(2004, 0, 0, 0), row(2006, 0, 0, 12), row(2002, 1, 0, 0)]), [2002, 2003, 2006]);
  assert.deepEqual(playedYears([]), []);
});

const years = [1997, 1998, 1999, 2000, 2005, 2006, 2024, 2025];

test("before a day: seasons starting in its year or earlier, latest first, three at most", () => {
  assert.deepEqual(seasonSteps(years, "2006-04-10", "before"), [2006, 2005, 2000]);
  assert.deepEqual(seasonSteps(years, "2003-07-01", "before"), [2000, 1999, 1998]);
  assert.deepEqual(seasonSteps(years, "2030-01-01", "before"), [2025, 2024, 2006]);
  assert.deepEqual(seasonSteps(years, "1990-05-05", "before"), []);
});

test("after a day: the season that started the year before comes first, then later ones, three at most", () => {
  assert.deepEqual(seasonSteps(years, "2006-04-10", "after"), [2005, 2006, 2024]);
  assert.deepEqual(seasonSteps(years, "2003-07-01", "after"), [2005, 2006, 2024]);
  assert.deepEqual(seasonSteps(years, "1990-05-05", "after"), [1997, 1998, 1999]);
  assert.deepEqual(seasonSteps(years, "2026-01-01", "after"), [2025]);
  assert.deepEqual(seasonSteps(years, "2027-01-01", "after"), []);
});

test("the limit and the order of the input do not matter", () => {
  assert.deepEqual(seasonSteps([2025, 1997, 2024], "2025-06-01", "before", 2), [2025, 2024]);
  assert.deepEqual(seasonSteps(years, "2006-04-10", "after", 1), [2005]);
  assert.deepEqual(seasonSteps(years, "not a date", "before"), []);
});

test("first and last day look in the end seasons only", () => {
  assert.deepEqual(edgeSteps(years, "first"), [1997, 1998, 1999]);
  assert.deepEqual(edgeSteps(years, "last"), [2025, 2024, 2006]);
  assert.deepEqual(edgeSteps([], "last"), []);
  assert.deepEqual(years, [1997, 1998, 1999, 2000, 2005, 2006, 2024, 2025], "the input is not reordered");
});

test("a window of days reads the seasons that can reach it", () => {
  assert.deepEqual(windowSteps(years, "2025-07-01", "2025-07-07"), [2024, 2025]);
  assert.deepEqual(windowSteps(years, "2005-12-30", "2006-01-03"), [2005, 2006]);
  assert.deepEqual(windowSteps(years, "2012-03-01", "2012-03-07"), []);
});

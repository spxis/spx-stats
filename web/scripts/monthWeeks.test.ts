import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultWeek, monthRun, monthWeeks, parseSelection, resolveSelection, type GameTuple } from "../src/lib/season.ts";

/** Run in web/: pnpm test:weeks */
const game = (date: string, id: number): GameTuple => [date, 1, 2, 3, 2, "r", "f", "spx", 0, null, id];

test("a month is cut into Monday to Sunday weeks, the first and last cut at the month's ends", () => {
  assert.deepEqual(monthWeeks("2000-04").map((w) => [w.n, w.start, w.end]), [
    [1, "2000-04-01", "2000-04-02"], [2, "2000-04-03", "2000-04-09"], [3, "2000-04-10", "2000-04-16"], [4, "2000-04-17", "2000-04-23"], [5, "2000-04-24", "2000-04-30"],
  ]);
  assert.deepEqual(monthWeeks("2026-02").map((w) => [w.start, w.end]), [["2026-02-01", "2026-02-01"], ["2026-02-02", "2026-02-08"], ["2026-02-09", "2026-02-15"], ["2026-02-16", "2026-02-22"], ["2026-02-23", "2026-02-28"]]);
  assert.equal(monthWeeks("2024-02").at(-1)?.end, "2024-02-29");
});

test("?week= is a day or all, and anything else is dropped", () => {
  assert.equal(parseSelection({ week: "2000-04-03" }).week, "2000-04-03");
  assert.equal(parseSelection({ week: "all" }).week, "all");
  for (const bad of ["", "2000-13-01", "x", "2000-04"]) assert.equal(parseSelection({ week: bad }).week, "", bad);
});

test("the list opens on the first week with games, or on the week of today in a month under way", () => {
  const games = [game("2000-04-02", 1), game("2000-04-05", 2), game("2000-04-06", 3), game("2000-04-20", 4), game("2000-04-27", 5)];
  const want = { phase: "r", team: "", month: "2000-04", day: "" };
  const r = resolveSelection(games, want);
  assert.deepEqual(r.weeks.map((w) => [w.n, w.games]), [[1, 1], [2, 2], [4, 1], [5, 1]], "weeks without games get no button");
  assert.equal(r.week, "");
  assert.equal(r.shownWeek, "2000-04-01");
  assert.equal(resolveSelection(games, want, "2000-04-21").shownWeek, "2000-04-17", "the week of today");
  assert.equal(resolveSelection(games, want, "2000-04-12").shownWeek, "2000-04-03", "no games that week: the latest before it");
  assert.equal(resolveSelection(games, want, "2000-03-30").shownWeek, "2000-04-01", "another month: the first week");
  assert.equal(resolveSelection(games, want, "2001-01-01").shownWeek, "2000-04-01");
  assert.equal(defaultWeek([], "2000-04", "2000-04-05"), null);
});

test("a chosen week, or all, is kept; a week that is not in the month is dropped", () => {
  const games = [game("2000-04-02", 1), game("2000-04-05", 2), game("2000-05-02", 3)];
  const base = { phase: "r", team: "", month: "2000-04", day: "" };
  assert.deepEqual([resolveSelection(games, { ...base, week: "2000-04-03" }).week, resolveSelection(games, { ...base, week: "2000-04-03" }).shownWeek], ["2000-04-03", "2000-04-03"]);
  assert.deepEqual([resolveSelection(games, { ...base, week: "all" }).week, resolveSelection(games, { ...base, week: "all" }).shownWeek], ["all", "all"]);
  assert.equal(resolveSelection(games, { ...base, week: "2000-04-10" }).week, "", "no games that week");
  assert.equal(resolveSelection(games, { ...base, month: "2000-05", week: "2000-04-03" }).week, "", "another month's week");
  assert.equal(resolveSelection([], base).shownWeek, "");
});

test("the months of a season run unbroken from the first game to the last, an empty month among them", () => {
  assert.deepEqual(monthRun(["2019-10", "2020-03", "2020-08"]), ["2019-10", "2019-11", "2019-12", "2020-01", "2020-02", "2020-03", "2020-04", "2020-05", "2020-06", "2020-07", "2020-08"]);
  assert.deepEqual(monthRun(["1915-03"]), ["1915-03"]);
  assert.deepEqual(monthRun([]), []);
  const r = resolveSelection([game("2000-04-02", 1), game("2000-06-02", 2)], { phase: "r", team: "", month: "2000-05", day: "" });
  assert.deepEqual(r.months, ["2000-04", "2000-05", "2000-06"]);
  assert.equal(r.month, "2000-05", "the empty month asked for is kept");
  assert.deepEqual(r.weeks, []);
});

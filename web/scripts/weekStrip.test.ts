import assert from "node:assert/strict";
import { test } from "node:test";
import { around, weekOf } from "../src/lib/weekStrip.ts";

/** Run in web/: pnpm test:week */
const g = (date: string, phase = "r") => ({ date, phase });
const season = [g("2026-10-07"), g("2026-10-08"), g("2026-10-08"), g("2026-10-10"), g("2027-04-16"), g("2027-04-20", "p"), g("2027-04-22", "p")];

test("the strip is three days either side of a day", () => {
  assert.deepEqual(around("2026-10-14"), ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"]);
  assert.deepEqual(around("2026-03-01").slice(0, 2), ["2026-02-26", "2026-02-27"]);
});

test("a season in progress centres on the reader's day", () => {
  const w = weekOf(season, false, "2026-10-14");
  assert.equal(w?.mode, "today");
  assert.equal(w?.chosen, "2026-10-14");
  assert.equal(w?.days[3], "2026-10-14");
  assert.equal(w?.days.length, 7);
});

test("today need not be a game day, and a few days past the ends still centre on it", () => {
  assert.equal(weekOf(season, false, "2026-10-05")?.mode, "today");
  assert.equal(weekOf(season, false, "2027-04-25")?.mode, "today");
});

test("before the season starts the first seven game days show", () => {
  const w = weekOf(season, false, "2026-09-01");
  assert.equal(w?.mode, "first");
  assert.deepEqual(w?.days, ["2026-10-07", "2026-10-08", "2026-10-10", "2027-04-16", "2027-04-20", "2027-04-22"]);
  assert.equal(w?.chosen, "2026-10-07");
});

test("a finished season shows the last playoff game days, ending with the final, whatever today is", () => {
  const w = weekOf(season, true, "2026-10-14");
  assert.equal(w?.mode, "playoffs");
  assert.deepEqual(w?.days, ["2027-04-20", "2027-04-22"]);
  assert.equal(w?.chosen, "2027-04-22");
});

test("only the last seven of many playoff days show", () => {
  const many = Array.from({ length: 12 }, (_, i) => g(`2027-05-${String(i + 1).padStart(2, "0")}`, "p"));
  const w = weekOf([g("2027-04-01"), ...many], true, "");
  assert.equal(w?.days.length, 7);
  assert.equal(w?.days[0], "2027-05-06");
  assert.equal(w?.chosen, "2027-05-12");
});

test("with no playoff games in the archive the last seven game days show", () => {
  const w = weekOf([g("2026-10-01"), g("2026-10-02"), g("2026-10-03")], true, "");
  assert.equal(w?.mode, "last");
  assert.equal(w?.chosen, "2026-10-03");
});

test("a season not yet complete whose last game is long past falls back to the last days", () => {
  const w = weekOf(season, false, "2028-01-01");
  assert.equal(w?.mode, "playoffs");
  assert.equal(w?.chosen, "2027-04-22");
});

test("before the reader's day is known a season in progress is shown as finished ones are (the page decides to wait)", () => {
  assert.equal(weekOf(season, false, "")?.mode, "playoffs");
});

test("no games, no strip", () => {
  assert.equal(weekOf([], true, "2026-10-14"), null);
});

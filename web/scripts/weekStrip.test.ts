import assert from "node:assert/strict";
import { test } from "node:test";
import { around, calendarWeek, calendarWeekStart, stripDates, stripWindow, usHolidayDates, weekDirection, weekOf } from "../src/lib/weekStrip.ts";
import { PHRASES } from "../src/lib/i18n/phrases.constants.ts";
import { FR } from "../src/lib/i18n/dictionaries/fr.constants.ts";
import { JA } from "../src/lib/i18n/dictionaries/ja.constants.ts";

/** Run in web/: pnpm test:week */
const g = (date: string, phase = "r") => ({ date, phase });
const season = [g("2026-10-07"), g("2026-10-08"), g("2026-10-08"), g("2026-10-10"), g("2027-04-16"), g("2027-04-20", "p"), g("2027-04-22", "p")];

test("the strip is three days either side of a day", () => {
  assert.deepEqual(around("2026-10-14"), ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"]);
  assert.deepEqual(around("2026-03-01").slice(0, 2), ["2026-02-26", "2026-02-27"]);
});

test("fixed weeks run Sunday through Saturday across month and year boundaries", () => {
  assert.deepEqual(calendarWeek("2026-10-14"), ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"]);
  assert.deepEqual(calendarWeek("2026-10-17"), ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"]);
  assert.deepEqual(calendarWeek("2026-01-01"), ["2025-12-28", "2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02", "2026-01-03"]);
  assert.deepEqual(calendarWeek("2026-10-14", 1), ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  assert.deepEqual(stripDates("2026-10-14", "dynamic"), around("2026-10-14"));
  assert.equal(calendarWeekStart("2026-10-14"), "2026-10-11");
  assert.equal(stripWindow("2026-10-11")[0], "2026-10-08");
  assert.equal(stripWindow("2026-10-11").at(-1), "2026-10-17");
});

test("chevron hint follows the calendar week, not the chosen weekday", () => {
  assert.equal(weekDirection("2026-10-03", "2026-10-14"), "past");
  assert.equal(weekDirection("2026-10-21", "2026-10-14"), "future");
  assert.equal(weekDirection("2026-10-17", "2026-10-14"), "current");
  assert.equal(weekDirection("2026-10-03", ""), "unknown");
});

test("US federal holidays include variable dates and weekend observances", () => {
  const h = usHolidayDates([2022, 2023]);
  for (const day of ["2021-12-31", "2022-01-01", "2022-01-17", "2022-02-21", "2022-05-30", "2022-06-19", "2022-06-20",
    "2022-07-04", "2022-09-05", "2022-10-10", "2022-11-11", "2022-11-24", "2022-12-25", "2022-12-26",
    "2023-01-01", "2023-01-02", "2023-01-16", "2023-02-20", "2023-05-29", "2023-06-19", "2023-07-04",
    "2023-09-04", "2023-10-09", "2023-11-10", "2023-11-11", "2023-11-23", "2023-12-25"]) assert.ok(h.has(day), day);
  assert.equal(h.get("2022-11-24"), "scores.holidayThanksgiving");
  assert.equal(h.get("2023-11-10"), "scores.holidayVeterans");
});

test("week and holiday labels are translated in all supported languages", () => {
  const keys = ["scores.daysAria", "scores.weekBack", "scores.weekForward", "scores.todayMark", "scores.todayLater", "scores.todayEarlier",
    "scores.nowMark", "scores.weekend", "scores.holidayNewYear", "scores.holidayMlk", "scores.holidayPresidents", "scores.holidayMemorial",
    "scores.holidayJuneteenth", "scores.holidayIndependence", "scores.holidayLabor", "scores.holidayIndigenous", "scores.holidayVeterans",
    "scores.holidayThanksgiving", "scores.holidayChristmas", "season.weekCalendar"] as const;
  for (const key of keys) {
    assert.ok(FR[key], `French ${key}`);
    assert.ok(JA[key], `Japanese ${key}`);
    assert.notEqual(FR[key], PHRASES[key], `French translation ${key}`);
    assert.notEqual(JA[key], PHRASES[key], `Japanese translation ${key}`);
  }
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

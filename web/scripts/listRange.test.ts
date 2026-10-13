import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { overlapFilters, readRange, readYear } from "../src/lib/listRange.ts";
import { parseRange, RANGE_HOLD_SCRIPT, RANGE_PAGES, rangeFromQuery, rangePresets } from "../src/lib/yearRange.ts";

/** Run in web/: pnpm test:range */

test("blank or missing from/to leave the range open", () => {
  assert.deepEqual(readRange(undefined, undefined), { ok: true, from: undefined, to: undefined });
  assert.deepEqual(readRange("", ""), { ok: true, from: undefined, to: undefined });
  assert.deepEqual(readRange("1990", undefined), { ok: true, from: 1990, to: undefined });
  assert.deepEqual(readRange(undefined, "2005"), { ok: true, from: undefined, to: 2005 });
  assert.deepEqual(readRange("1990", "1990"), { ok: true, from: 1990, to: 1990 });
});

test("a non-integer is a problem that names the parameter", () => {
  for (const bad of ["abc", "19.5", "1e3", "-1990", "+1990", " 1990", "1990 ", "0x7c6", "19900", "NaN", "1990,2000"]) {
    assert.deepEqual(readRange(bad, undefined), { ok: false, problem: { param: "from", message: "a whole year from 1800 to 2100" } }, bad);
    assert.deepEqual(readRange(undefined, bad), { ok: false, problem: { param: "to", message: "a whole year from 1800 to 2100" } }, bad);
  }
});

test("a year outside 1800..2100 is a problem", () => {
  assert.ok("problem" in readYear("from", "1799"));
  assert.ok("problem" in readYear("to", "2101"));
  assert.ok("problem" in readYear("from", "0"));
  assert.deepEqual(readYear("from", "1800"), { year: 1800 });
  assert.deepEqual(readYear("to", "2100"), { year: 2100 });
});

test("from after to is a problem on from; the first bad value is the one named", () => {
  assert.deepEqual(readRange("2000", "1990"), { ok: false, problem: { param: "from", message: "must not be after to" } });
  assert.equal(readRange("2000", "x").ok, false);
  assert.equal((readRange("x", "y") as { problem: { param: string } }).problem.param, "from");
  assert.equal((readRange("1990", "y") as { problem: { param: string } }).problem.param, "to");
});

test("the overlap filters keep first..last seasons that touch from..to", () => {
  assert.deepEqual(overlapFilters(1990, 2000), ["first_season=lte.2000", "last_season=gte.1990"]);
  assert.deepEqual(overlapFilters(1990, undefined), ["last_season=gte.1990"]);
  assert.deepEqual(overlapFilters(undefined, 2000), ["first_season=lte.2000"]);
  assert.deepEqual(overlapFilters(undefined, undefined), []);
});

test("the pages read a range leniently: clamped, swapped, ignored when it narrows nothing", () => {
  assert.deepEqual(rangeFromQuery("1990", "2000", 1871, 2026), { from: 1990, to: 2000 });
  assert.deepEqual(rangeFromQuery("2000", "1990", 1871, 2026), { from: 1990, to: 2000 });
  assert.deepEqual(rangeFromQuery("1500", "2000", 1871, 2026), { from: 1871, to: 2000 });
  assert.deepEqual(rangeFromQuery("1990", "9999", 1871, 2026), { from: 1990, to: 2026 });
  assert.deepEqual(rangeFromQuery("1990", "", 1871, 2026), { from: 1990, to: 2026 });
  assert.deepEqual(rangeFromQuery("", "2000", 1871, 2026), { from: 1871, to: 2000 });
  assert.equal(rangeFromQuery("", "", 1871, 2026), null);
  assert.equal(rangeFromQuery("abc", "1.5", 1871, 2026), null);
  assert.equal(rangeFromQuery("1871", "2026", 1871, 2026), null);
  assert.equal(rangeFromQuery("1800", "2100", 1917, 2026), null);
  assert.deepEqual(parseRange("2005-2005", 1871, 2026), { from: 2005, to: 2005 });
});

test("the shortcuts stay inside the span of the data", () => {
  const ids = (min: number, max: number) => rangePresets(min, max).map((p) => `${p.id}:${p.from}-${p.to}`);
  assert.deepEqual(ids(1871, 2026), ["all:1871-2026", "last10:2017-2026", "since:2000-2026", "since:1990-2026", "spx:1997-2013"]);
  assert.deepEqual(ids(1997, 2025), ["all:1997-2025", "last10:2016-2025", "since:2000-2025", "spx:1997-2013"]);
});

/** The head script, run against a fake page: does it hold the page back exactly when it should? */
function held(pathname: string, search: string, stored: Record<string, string>): boolean {
  let attr = false;
  const ctx = {
    location: { pathname, search },
    localStorage: { getItem: (k: string) => stored[k] ?? null },
    URLSearchParams,
    document: { documentElement: { setAttribute: () => { attr = true; } } },
  };
  vm.runInNewContext(RANGE_HOLD_SCRIPT, ctx);
  return attr;
}

test("the head script holds each page on its own saved range", () => {
  assert.deepEqual(Object.keys(RANGE_PAGES), ["/", "/players", "/teams"]);
  assert.equal(new Set(Object.values(RANGE_PAGES).map((p) => p.key)).size, 3);
  assert.equal(held("/players", "", { "spxn-range-players": "1990-2005" }), true);
  assert.equal(held("/teams", "", { "spxn-range-teams": "1990-2005" }), true);
  assert.equal(held("/", "", { "spxn-range": "1990-2005" }), true);
  // another page's saved range does not hold this one
  assert.equal(held("/players", "", { "spxn-range-teams": "1990-2005", "spxn-range": "1990-2005" }), false);
  assert.equal(held("/teams", "", { "spxn-range-players": "1990-2005" }), false);
  // an address range: the server draws a list from it, so only the home chart waits
  assert.equal(held("/players", "?from=1990&to=2005", { "spxn-range-players": "1990-2005" }), false);
  assert.equal(held("/teams", "?to=2005", {}), false);
  assert.equal(held("/", "?from=1990", {}), true);
  // junk and other paths
  assert.equal(held("/players", "", { "spxn-range-players": "abc" }), false);
  assert.equal(held("/players", "?from=abc", {}), false);
  assert.equal(held("/about", "", { "spxn-range": "1990-2005", "spxn-range-players": "1990-2005" }), false);
});

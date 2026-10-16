import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { overlapFilters, readRange, readYear } from "../src/lib/listRange.ts";
import { grabAt, panByPixels, panRange, parseRange, RANGE_HOLD_SCRIPT, RANGE_PAGES, rangeFromQuery, rangePresets } from "../src/lib/yearRange.ts";

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
  assert.deepEqual(Object.keys(RANGE_PAGES), ["/", "/players", "/teams", "/admin/people"]);
  assert.equal(new Set(Object.values(RANGE_PAGES).map((p) => p.key)).size, 4);
  assert.equal(held("/players", "", { "spxn-range-players": "1990-2005" }), true);
  assert.equal(held("/teams", "", { "spxn-range-teams": "1990-2005" }), true);
  assert.equal(held("/", "", { "spxn-range": "1990-2005" }), true);
  // another page's saved range does not hold this one
  assert.equal(held("/players", "", { "spxn-range-teams": "1990-2005", "spxn-range": "1990-2005" }), false);
  assert.equal(held("/teams", "", { "spxn-range-players": "1990-2005" }), false);
  // an address range: the server draws the players list from it, so only the pages drawn in the browser (the home chart, the teams list) wait
  assert.equal(held("/players", "?from=1990&to=2005", { "spxn-range-players": "1990-2005" }), false);
  assert.equal(held("/teams", "?to=2005", {}), true);
  assert.equal(held("/", "?from=1990", {}), true);
  // junk and other paths
  assert.equal(held("/players", "", { "spxn-range-players": "abc" }), false);
  assert.equal(held("/players", "?from=abc", {}), false);
  // a league page waits for an address range only: it has nothing saved, and the home range never reaches it
  assert.equal(held("/nhl", "?from=1990&to=2005", {}), true);
  assert.equal(held("/nfl", "?to=2005", {}), true);
  assert.equal(held("/nhl", "", { "spxn-range": "1990-2005", "spxn-range-players": "1990-2005", "": "1990-2005" }), false);
  assert.equal(held("/nhl", "?from=abc", {}), false);
  assert.equal(held("/nhl/scores", "?from=1990", {}), false);
  assert.equal(held("/about", "", { "spxn-range": "1990-2005", "spxn-range-players": "1990-2005" }), false);
});

test("a city page is held on its own saved range and on an address range, and no other page's", () => {
  assert.equal(held("/city/vancouver", "", { "spxn-range-c:/city/vancouver": "1990-2005" }), true);
  assert.equal(held("/city/vancouver", "?from=1990&to=2005", {}), true);
  assert.equal(held("/city/vancouver", "", { "spxn-range-c:/city/montreal": "1990-2005" }), false);
  assert.equal(held("/city/vancouver", "", { "spxn-range-teams": "1990-2005", "spxn-range": "1990-2005" }), false);
  assert.equal(held("/city/vancouver", "", { "spxn-range-c:/city/vancouver": "abc" }), false);
  assert.equal(held("/cities", "", { "spxn-range-c:/cities": "1990-2005" }), false);
  assert.equal(held("/city/vancouver/extra", "?from=1990", {}), false);
});

test("panning keeps the width and stops at the ends", () => {
  const r = { from: 1990, to: 2000 };
  assert.deepEqual(panRange(r, 5, 1950, 2025), { from: 1995, to: 2005 });
  assert.deepEqual(panRange(r, -5, 1950, 2025), { from: 1985, to: 1995 });
  assert.deepEqual(panRange(r, 0, 1950, 2025), r);
  // clamped: the window stops at the first and last season, still ten years wide
  assert.deepEqual(panRange(r, -500, 1950, 2025), { from: 1950, to: 1960 });
  assert.deepEqual(panRange(r, 500, 1950, 2025), { from: 2015, to: 2025 });
  // a window that reaches an end already cannot go further that way
  assert.deepEqual(panRange({ from: 2015, to: 2025 }, 3, 1950, 2025), { from: 2015, to: 2025 });
  assert.deepEqual(panRange({ from: 1950, to: 1960 }, -3, 1950, 2025), { from: 1950, to: 1960 });
  // one season, and the full span, which has nowhere to go
  assert.deepEqual(panRange({ from: 2000, to: 2000 }, 7, 1950, 2025), { from: 2007, to: 2007 });
  assert.deepEqual(panRange({ from: 1950, to: 2025 }, 9, 1950, 2025), { from: 1950, to: 2025 });
  assert.deepEqual(panRange({ from: 1950, to: 2025 }, -9, 1950, 2025), { from: 1950, to: 2025 });
});

test("panning moves by whole years", () => {
  const r = { from: 1990, to: 2000 };
  assert.deepEqual(panRange(r, 2.4, 1950, 2025), { from: 1992, to: 2002 });
  assert.deepEqual(panRange(r, 2.6, 1950, 2025), { from: 1993, to: 2003 });
  assert.deepEqual(panRange(r, -2.6, 1950, 2025), { from: 1987, to: 1997 });
  // 75 years drawn over 750 px: 10 px is one year
  assert.deepEqual(panByPixels(r, 24, 750, 1950, 2025), { from: 1992, to: 2002 });
  assert.deepEqual(panByPixels(r, 26, 750, 1950, 2025), { from: 1993, to: 2003 });
  assert.deepEqual(panByPixels(r, -4, 750, 1950, 2025), r);
  assert.deepEqual(panByPixels(r, 99999, 750, 1950, 2025), { from: 2015, to: 2025 });
  assert.deepEqual(panByPixels(r, -99999, 750, 1950, 2025), { from: 1950, to: 1960 });
  assert.deepEqual(panByPixels(r, 50, 0, 1950, 2025), r);
  for (const dx of [-333, -17.5, 0, 3.3, 41, 640]) {
    const p = panByPixels(r, dx, 412, 1950, 2025);
    assert.ok(Number.isInteger(p.from) && Number.isInteger(p.to) && p.to - p.from === 10, String(dx));
  }
});

test("a press grabs the bar between the handles and a handle at its ends", () => {
  // a wide bar from x=100 to x=300: the middle pans, 10 px next to each handle takes it, outside takes the nearer one
  assert.equal(grabAt(50, 100, 300), "start");
  assert.equal(grabAt(350, 100, 300), "end");
  assert.equal(grabAt(100, 100, 300), "start");
  assert.equal(grabAt(108, 100, 300), "start");
  assert.equal(grabAt(293, 100, 300), "end");
  assert.equal(grabAt(111, 100, 300), "pan");
  assert.equal(grabAt(200, 100, 300), "pan");
  assert.equal(grabAt(289, 100, 300), "pan");
  // a narrow bar pans at its middle, padded to a 24 px grip for a finger (8 px for a mouse)
  assert.equal(grabAt(106, 100, 112), "pan");
  assert.equal(grabAt(100, 100, 112), "pan");
  assert.equal(grabAt(112, 100, 112), "pan");
  assert.equal(grabAt(95, 100, 112), "pan");
  assert.equal(grabAt(117, 100, 112), "pan");
  assert.equal(grabAt(93, 100, 112), "start");
  assert.equal(grabAt(119, 100, 112), "end");
  assert.equal(grabAt(106, 100, 112, 8), "pan");
  assert.equal(grabAt(99, 100, 112, 8), "start");
  assert.equal(grabAt(113, 100, 112, 8), "end");
  // a bar of 30 px: the 24 px middle pans, the rest goes to the handles
  assert.equal(grabAt(115, 100, 130), "pan");
  assert.equal(grabAt(102, 100, 130), "start");
  assert.equal(grabAt(128, 100, 130), "end");
  // no width at all: the middle still pans, either side of it a handle
  assert.equal(grabAt(100, 100, 100), "pan");
  assert.equal(grabAt(80, 100, 100), "start");
  assert.equal(grabAt(120, 100, 100), "end");
});

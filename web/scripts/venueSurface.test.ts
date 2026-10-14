import assert from "node:assert/strict";
import { test } from "node:test";
import { PHRASES } from "../src/lib/i18n/phrases.constants.ts";
import { FR } from "../src/lib/i18n/dictionaries/fr.constants.ts";
import { JA } from "../src/lib/i18n/dictionaries/ja.constants.ts";
import { periodRaw, periodsOf, periodYears, ROOF_KEY, roofWord, stateWord, SURFACE_KEY, STATE_KEY, surfaceWord, type VenuePeriod } from "../src/lib/venueSurface.ts";
import { factsText, packVenues, unpackVenues } from "../src/lib/venueWire.ts";
import type { VenueRow } from "../src/lib/venueModel.ts";
import { venueKey } from "../src/lib/venueVisits.ts";

/** Run in web/: pnpm test:venues */

const say = ((key: string) => PHRASES[key as keyof typeof PHRASES]) as unknown as Parameters<typeof surfaceWord>[1];

test("every surface code, roof value and status has a phrase in English, French and Japanese", () => {
  const keys = [...Object.values(SURFACE_KEY), ...Object.values(ROOF_KEY), ...Object.values(STATE_KEY), "venues.demolished", "venue.periodHead", "venue.periodNote"];
  for (const k of keys) {
    assert.ok(k in PHRASES, `English ${k}`);
    assert.ok((FR as Record<string, string>)[k], `French ${k}`);
    assert.ok((JA as Record<string, string>)[k], `Japanese ${k}`);
  }
});

test("a code is a word; any other text, from a database without migration 089, is shown as it came", () => {
  assert.equal(surfaceWord("artificial", say), "Artificial turf");
  assert.equal(surfaceWord("artificial turf", say), "artificial turf");
  assert.equal(surfaceWord("constructor", say), "constructor", "a prototype name is not a code");
  assert.equal(surfaceWord(null, say), null);
  assert.equal(roofWord("retractable", say), "Retractable");
  assert.equal(stateWord("demolished", say), "Demolished");
  assert.equal(stateWord("open", say), null);
  assert.equal(stateWord(null, say), null);
});

test("years of a period", () => {
  assert.equal(periodYears({ from: 1989, until: 2004 }, "today"), "1989–2004");
  assert.equal(periodYears({ from: 2011, until: null }, "today"), "2011–today");
  assert.equal(periodYears({ from: null, until: 1975 }, "today"), "…–1975");
  assert.equal(periodYears({ from: 1998, until: 1998 }, "today"), "1998");
  assert.equal(periodYears({ from: null, until: null }, "today"), null);
});

test("periods of a kind come oldest first, and a product name is kept as written unless it only repeats the word", () => {
  const p = (o: Partial<VenuePeriod>): VenuePeriod => ({ kind: "surface", seq: 1, value: "artificial", raw: null, from: null, until: null, sport: null, ...o });
  const list = [p({ seq: 3, raw: "AstroTurf 3D Xtreme", from: 2016 }), p({ seq: 1, raw: "AstroTurf", from: 1989, until: 2004 }), p({ kind: "roof", value: "dome" }), p({ seq: 2, raw: "FieldTurf", from: 2005, until: 2015 })];
  assert.deepEqual(periodsOf(list, "surface").map((x) => x.raw), ["AstroTurf", "FieldTurf", "AstroTurf 3D Xtreme"]);
  assert.equal(periodsOf(list, "roof").length, 1);
  assert.equal(periodRaw({ raw: "AstroTurf" }, "Artificial turf"), "AstroTurf");
  assert.equal(periodRaw({ raw: "dome" }, "Dome"), null);
  assert.equal(periodRaw({ raw: " " }, "Dome"), null);
  assert.equal(periodRaw({ raw: null }, "Dome"), null);
});

test("the facts line names the surface as a word and says when a venue is demolished", () => {
  assert.equal(factsText({ capacity: null, opened: null, surface: "artificial", roof: "retractable", state: "demolished" }, say), "artificial turf · retractable roof · demolished");
  assert.equal(factsText({ capacity: null, opened: null, surface: "lawn", roof: null }, say), "lawn");
});

const venue = (o: Partial<VenueRow>): VenueRow => ({
  id: "x", key: "geo:0.00000,0.00000", slug: "x", name: "X", former: null, lat: 0, lon: 0, cc: "CA", place: null, citySlug: null, wiki: null, address: null, addressHref: null,
  leagues: ["mlb"], clubs: [], opened: null, closed: null, state: null, capacity: null, roof: null, surface: null, owner: null, from: 1950, to: null, current: true, al: [], extra: [], kind: "home", tag: null, planned: null, games: null, ...o,
});

test("the state of a venue survives the wire, and costs nothing when the closing year already says it", () => {
  const rows = [
    venue({ name: "Open Park", state: "open" }),
    venue({ name: "Closed Park", state: "closed", closed: 1976, current: false, to: 1976 }),
    venue({ name: "Gone Park", state: "demolished", current: false, to: 1960 }),
    venue({ name: "Spring Park", kind: "spring", state: null }),
  ];
  for (const r of rows) { r.key = venueKey(null, r.lat, r.lon); r.slug = r.name.toLowerCase().replace(/ /g, "-"); }
  const wire = JSON.parse(JSON.stringify(packVenues(rows, ["mlb"], (cc) => cc)));
  const back = unpackVenues(wire, ["mlb"], say, (cc) => cc);
  assert.deepEqual(back.map((r) => r.state), ["open", "closed", "demolished", null]);
  assert.equal(wire.s, 1);
  const carried = wire.v.map((v: unknown[]) => v[23] ?? 0);
  assert.deepEqual(carried, [0, 0, 3, 0], "only the demolished venue carries its state");
  assert.ok(back[2].extra.some((e) => e.includes("demolished")), "the map panel says so");
});

test("a database without migration 089 gives no status: nothing is invented, and nothing extra is sent", () => {
  const rows = [venue({ name: "Old Park" }), venue({ name: "Shut Park", closed: 1990, current: false, to: 1990 })];
  for (const r of rows) { r.key = venueKey(null, r.lat, r.lon); r.slug = r.name.toLowerCase().replace(/ /g, "-"); }
  const wire = JSON.parse(JSON.stringify(packVenues(rows, ["mlb"], (cc) => cc)));
  assert.equal(wire.s, undefined);
  assert.deepEqual(unpackVenues(wire, ["mlb"], say, (cc) => cc).map((r) => r.state), [null, null], "a missing status stays missing even beside a closing year");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyFilter, filterQuery, leagueColor, readFilter, venueColor, venueMatches, type VenueRow } from "../src/lib/venueModel.ts";

/** Run in web/: pnpm test:venues */

const B = { min: 1900, max: 2026 };
const LEAGUES = ["nhl", "nba", "mls"];

const venue = (o: Partial<VenueRow>): VenueRow => ({
  id: "x", name: "X", former: null, lat: 0, lon: 0, cc: "US", place: null, citySlug: null, wiki: null, address: null, addressHref: null,
  leagues: ["nhl"], clubs: [], opened: null, closed: null, capacity: null, roof: null, surface: null, from: 1950, to: null, current: true, al: [], extra: [], ...o,
});

test("no filter keeps everything, even a venue with no known years", () => {
  assert.ok(venueMatches(venue({ from: null, to: null }), emptyFilter(B), B));
});

test("league, status and country", () => {
  const f = { ...emptyFilter(B), leagues: ["nba"] };
  assert.ok(!venueMatches(venue({}), f, B));
  assert.ok(venueMatches(venue({ leagues: ["nhl", "nba"] }), f, B));
  assert.ok(!venueMatches(venue({ current: false, to: 1990 }), { ...emptyFilter(B), status: "current" }, B));
  assert.ok(venueMatches(venue({ current: false, to: 1990 }), { ...emptyFilter(B), status: "former" }, B));
  assert.ok(!venueMatches(venue({ cc: "US" }), { ...emptyFilter(B), cc: "CA" }, B));
});

test("conference and division use the clubs playing now", () => {
  const v = venue({ al: ["nhl|Eastern|Atlantic"] });
  assert.ok(venueMatches(v, { ...emptyFilter(B), conf: "nhl|Eastern" }, B));
  assert.ok(!venueMatches(v, { ...emptyFilter(B), conf: "nhl|Western" }, B));
  assert.ok(venueMatches(v, { ...emptyFilter(B), conf: "nhl|Eastern", div: "nhl|Eastern|Atlantic" }, B));
  assert.ok(!venueMatches(v, { ...emptyFilter(B), div: "nhl|Eastern|Metropolitan" }, B));
});

test("the year range keeps venues used in any year of it", () => {
  const old = venue({ from: 1920, to: 1968, current: false });
  assert.ok(venueMatches(old, { ...emptyFilter(B), from: 1960, to: 1980 }, B));
  assert.ok(!venueMatches(old, { ...emptyFilter(B), from: 1969, to: 1980 }, B));
  assert.ok(venueMatches(venue({ from: 1990, to: null }), { ...emptyFilter(B), from: 2000, to: 2010 }, B));
  assert.ok(!venueMatches(venue({ from: 1990, to: null }), { ...emptyFilter(B), from: 1950, to: 1980 }, B));
});

test("the address round-trips and bad values are ignored", () => {
  const f = readFilter("?league=nhl,mls,zzz&status=former&nat=ca&from=1970&to=1990", B, LEAGUES);
  assert.deepEqual(f.leagues, ["nhl", "mls"]);
  assert.equal(f.status, "former");
  assert.equal(f.cc, "CA");
  assert.deepEqual([f.from, f.to], [1970, 1990]);
  const q = filterQuery(f, B);
  assert.deepEqual(q, { league: "nhl,mls", status: "former", nat: "CA", conf: null, div: null, from: "1970", to: "1990" });
  assert.deepEqual(filterQuery(emptyFilter(B), B), { league: null, status: null, nat: null, conf: null, div: null, from: null, to: null });
  const bad = readFilter("?status=x&nat=USA&from=2000&to=1990&league=", B, LEAGUES);
  assert.deepEqual(bad, emptyFilter(B));
});

test("every league gets a colour, the site's own where it has one", () => {
  assert.equal(leagueColor("nhl", 0), "var(--nhl)");
  const order = new Map(["nhl", "mls", "wc", "xfl"].map((l, i) => [l, i]));
  const colors = new Set(["mls", "wc", "xfl"].map((l) => leagueColor(l, order.get(l)!)));
  assert.equal(colors.size, 3);
  assert.equal(venueColor(venue({ leagues: ["nhl", "nba"] }), order), "var(--muted)");
  assert.equal(venueColor(venue({ leagues: ["mls"] }), order), leagueColor("mls", 1));
});

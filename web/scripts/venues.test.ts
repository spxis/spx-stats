import assert from "node:assert/strict";
import { test } from "node:test";
import { slugify } from "../src/lib/slug.ts";
import { packVenues, unpackVenues } from "../src/lib/venueWire.ts";
import { venueKey } from "../src/lib/venueVisits.ts";
import { emptyFilter, filterQuery, leagueColor, readFilter, venueColor, venueMatches, type VenueKind, type VenueRow } from "../src/lib/venueModel.ts";

/** Run in web/: pnpm test:venues */

const B = { min: 1900, max: 2026 };
const LEAGUES = ["nhl", "nba", "mls"];

const venue = (o: Partial<VenueRow>): VenueRow => ({
  id: "x", key: "geo:0.00000,0.00000", slug: "x", name: "X", former: null, lat: 0, lon: 0, cc: "US", place: null, citySlug: null, wiki: null, address: null, addressHref: null,
  leagues: ["nhl"], clubs: [], opened: null, closed: null, state: null, capacity: null, roof: null, surface: null, owner: null, from: 1950, to: null, current: true, al: [], extra: [], kind: "home", tag: null, planned: null, games: null, ...o,
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
  assert.deepEqual(q, { league: "nhl,mls", status: "former", visited: null, nat: "CA", conf: null, div: null, show: null, from: "1970", to: "1990" });
  assert.deepEqual(filterQuery(emptyFilter(B), B), { league: null, status: null, visited: null, nat: null, conf: null, div: null, show: null, from: null, to: null });
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

const say = ((key: string, vars?: Record<string, unknown>) => `${key}${vars ? JSON.stringify(vars) : ""}`) as unknown as Parameters<typeof unpackVenues>[2];
const countryName = (cc: string) => (cc === "US" ? "United States" : cc === "CA" ? "Canada" : cc);

test("packed rows come back exactly as they went in, whatever shortcut they could take", () => {
  const club = (o: Partial<VenueRow["clubs"][number]>) => ({ lg: "nhl", f: 1, name: "Boston Bruins", href: "/nhl/team/boston-bruins", from: 1995, to: null, logo: null, ...o });
  const rows: VenueRow[] = [
    venue({ name: "TD Garden", cc: "US", place: "Boston, MA", citySlug: "boston", wiki: "https://en.wikipedia.org/wiki/TD_Garden", address: "100 Legends Way, Boston, MA, United States",
      addressHref: "https://www.google.com/maps/search/?api=1&query=100%20Legends%20Way%2C%20Boston%2C%20MA%2C%20United%20States", clubs: [club({}), club({ lg: "nba", f: 9, name: "Boston Celtics", href: "/nba/team/boston-celtics" })],
      opened: 1995, capacity: 19156, surface: "hardwood", owner: "Delaware North", al: ["nhl|East|Atlantic"] }),
    // a partial address linked by coordinates, a Wikipedia title that is not the name, an address that does not end in the place, no place at all
    venue({ name: "Old Forum", former: "Forum 1920\u20131960", lat: 45.49, lon: -73.57, cc: "CA", place: "Montreal, QC", citySlug: null, wiki: "https://en.wikipedia.org/wiki/Montreal_Forum", address: "Montreal, QC, Canada",
      addressHref: "https://www.google.com/maps/search/?api=1&query=45.49%2C-73.57", clubs: [club({ f: 2, name: "Montreal Canadiens", href: "/nhl/team/montreal-canadiens", from: 1926, to: 1996, logo: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f8/Montreal_Canadiens.svg/120px-Montreal_Canadiens.svg.png?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail" })], roof: "dome" }),
    venue({ name: "X/Y Park", cc: null, place: null, wiki: "https://example.com/x", address: "Somewhere else entirely", addressHref: "https://example.com/m", clubs: [club({ f: 3, name: "Odd FC", href: "/odd/path", from: null, to: 1930, logo: "https://example.com/odd.png" }), club({ f: 4, name: "Two FC", href: "/nhl/team/two-fc", logo: "https://upload.wikimedia.org/wikipedia/en/9/9a/The_logo.gif?utm_source=en.wikipedia.org&utm_campaign=imageinfo&utm_content=thumbnail" }), club({ f: 5, name: "Three FC", href: "/nhl/team/three-fc", logo: "https://thumb.wikimedia.org/wikipedia/en/thumb/4/43/A_B.svg/250px-A_B.svg.png" }), club({ f: 6, name: "Four FC", href: "/nhl/team/four-fc", logo: "https://thumb.wikimedia.org/wikipedia/en/thumb/4/43/A_B.svg/250px-Other.svg.png" })] }),
    venue({ name: "Bare", clubs: [club({})] }),
  ];
  for (const r of rows) {
    r.key = r.name === "TD Garden" ? "Q1068528" : venueKey(null, r.lat, r.lon);
    r.slug = r.name === "Old Forum" ? "old-forum-q1" : slugify(r.name);
    r.leagues = [...new Set(r.clubs.map((c) => c.lg))];
    r.current = r.clubs.some((c) => c.to == null);
    r.from = r.clubs.some((c) => c.from == null) ? null : Math.min(...r.clubs.map((c) => c.from as number));
    r.to = r.current ? null : Math.max(...r.clubs.map((c) => c.to as number));
  }
  const order = ["nhl", "nba"];
  const wire = JSON.parse(JSON.stringify(packVenues(rows, order, countryName)));
  const back = unpackVenues(wire, order, say, countryName);
  assert.equal(back.length, rows.length);
  rows.forEach((r, i) => {
    const { id, extra, ...rest } = r;
    const { id: id2, extra: extra2, ...rest2 } = back[i];
    assert.deepEqual(rest2, rest);
    assert.equal(id2, String(i));
    void id; void extra; void extra2;
  });
  assert.deepEqual(wire.v.map((v: unknown[]) => v[17] || null), [null, "old-forum-q1", null, null], "a row carries its slug only when it is not the name's");
  assert.deepEqual(wire.v.map((v: unknown[]) => v[18] || null), ["Q1068528", null, null, null], "a row carries its Wikidata id, and a venue without one has its key made from its coordinates");
  assert.equal(back[1].key, "geo:45.49000,-73.57000");
  assert.ok(JSON.stringify(wire).length < JSON.stringify(rows).length / 2, "the packed rows are much smaller");
  const habs = wire.c.find((c: unknown[]) => c[2] === "Montreal Canadiens")[4] as string;
  assert.ok(habs.length < 80 && !habs.includes("utm_"), `a Wikimedia logo goes short (${habs})`);
});

test("spring training parks and future venues show only when asked, and a future venue has no years to filter", () => {
  const spring = venue({ kind: "spring", tag: "cactus", leagues: ["mlb"], from: 1990, to: 2000, current: false });
  const future = venue({ kind: "future", tag: "approved", planned: 2029, from: 2029, to: null, current: false });
  assert.ok(!venueMatches(spring, emptyFilter(B), B), "home venues are what the page opens with");
  assert.ok(!venueMatches(future, emptyFilter(B), B));
  const all = { ...emptyFilter(B), show: ["home", "spring", "future"] as VenueKind[] };
  assert.ok(venueMatches(spring, all, B) && venueMatches(future, all, B));
  assert.ok(!venueMatches(spring, { ...all, from: 2005, to: 2010 }, B), "a spring park is used in years");
  assert.ok(venueMatches(future, { ...all, from: 2005, to: 2010 }, B), "a future venue is not");
  assert.ok(venueMatches(future, { ...all, status: "current" }, B) && venueMatches(future, { ...all, status: "former" }, B), "a future venue is neither current nor former");
  assert.ok(!venueMatches(spring, { ...all, status: "current" }, B));
  assert.ok(!venueMatches(venue({}), { ...emptyFilter(B), show: ["spring"] }, B));
});

test("the show choice is kept in the address, in a fixed order, and home alone is not written", () => {
  const f = readFilter("?show=future,home,zzz", B, LEAGUES);
  assert.deepEqual(f.show, ["home", "future"]);
  assert.equal(filterQuery(f, B).show, "home,future");
  assert.equal(filterQuery(readFilter("?show=home", B, LEAGUES), B).show, null);
  assert.deepEqual(readFilter("?show=zzz", B, LEAGUES).show, ["home"]);
});

test("spring training parks and future venues survive the wire, with a club that has no franchise", () => {
  const c = (o: Partial<VenueRow["clubs"][number]>) => ({ lg: "mlb", f: 7, name: "Houston Astros", href: "/mlb/team/houston-astros", from: 1985, to: null, logo: null, ...o });
  const rows: VenueRow[] = [
    venue({ name: "Fenway Park", slug: "fenway-park", kind: "home", games: 9123, leagues: ["mlb"], clubs: [c({})] }),
    venue({ name: "Osceola County Stadium", kind: "spring", tag: "grapefruit", leagues: ["mlb"], from: 1985, to: 2000, current: false, clubs: [c({ to: 2000 }), c({ f: 0, name: "Unknown Club", href: "", from: 1960, to: 1965 }), c({ f: 0, name: "Other Club", href: "", from: 1970, to: 1971 })] }),
    venue({ name: "New Arena", kind: "future", tag: "under_construction", planned: 2028, leagues: ["nhl"], from: 2028, to: null, current: false, clubs: [c({ lg: "nhl", f: 3, name: "Ottawa Senators", href: "/nhl/team/ottawa-senators", from: 2028 })] }),
  ];
  const order = ["nhl", "mlb"];
  const wire = JSON.parse(JSON.stringify(packVenues(rows, order, countryName)));
  const back = unpackVenues(wire, order, say, countryName);
  assert.deepEqual(back.map((b) => [b.kind, b.tag, b.planned, b.games, b.slug]), [["home", null, null, 9123, "fenway-park"], ["spring", "grapefruit", null, null, ""], ["future", "under_construction", 2028, null, ""]]);
  assert.deepEqual(back[1].clubs.map((x) => [x.f, x.name, x.href]), [[7, "Houston Astros", "/mlb/team/houston-astros"], [0, "Unknown Club", ""], [0, "Other Club", ""]]);
  assert.deepEqual(back[2].clubs.map((x) => [x.lg, x.f, x.from, x.to]), [["nhl", 3, 2028, null]]);
  assert.equal(back[2].current, false);
  assert.equal(back[2].to, null);
});

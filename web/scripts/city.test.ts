import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fold } from "../src/lib/fold.ts";
import { withCupTitles } from "../src/lib/cup.ts";
import { buildStays, clipStay, MIN_RANKED_SEASONS, rankOf, titlesByDecade, totalsOf, unitOf, unitTotals, winShare, type CityRef, type ClubSeason, type Placement } from "../src/lib/cityModel.ts";

/** Run in web/: pnpm test:city */

/** A small CSV reader for the seed files (quoted fields, doubled quotes, a header row). */
function csv(file: string): Record<string, string>[] {
  const text = readFileSync(new URL(`../../db/seed/${file}`, import.meta.url), "utf8");
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const cities = csv("city.csv"), metros = csv("metro.csv"), aliases = csv("city_alias.csv"), hints = csv("place_region.csv");
const citySlugs = new Set(cities.map((c) => c.slug));

test("cities: slugs are plain and unique, regions belong to their country", () => {
  assert.equal(citySlugs.size, cities.length, "a slug is used twice");
  for (const c of cities) {
    assert.match(c.slug, SLUG, c.slug);
    assert.ok(c.name, c.slug);
    assert.match(c.region, /^(US|CA)-[A-Z]{2}$/, c.slug);
    assert.equal(c.region.slice(0, 2), c.country_code, `${c.slug}: region ${c.region} is not in ${c.country_code}`);
  }
});

test("metro areas: every city names a metro that exists, and every metro has at least two cities", () => {
  const known = new Set(metros.map((m) => m.slug));
  assert.equal(known.size, metros.length);
  for (const c of cities) if (c.metro) assert.ok(known.has(c.metro), `${c.slug}: no metro ${c.metro}`);
  for (const m of metros) assert.ok(cities.filter((c) => c.metro === m.slug).length >= 2, `${m.slug} groups fewer than two cities`);
});

test("aliases: each points at a city, and no two spellings fold to the same name", () => {
  const seen = new Map<string, string>();
  for (const a of aliases) {
    assert.ok(citySlugs.has(a.slug), `${a.alias}: no city ${a.slug}`);
    const key = fold(a.alias);
    assert.ok(key, a.alias);
    assert.equal(seen.get(key), undefined, `"${a.alias}" and "${seen.get(key)}" are the same name once folded`);
    seen.set(key, a.alias);
  }
});

test("normalisation: accents, dots and spacing do not make a second city", () => {
  assert.equal(fold("Montréal"), fold("Montreal"));
  assert.equal(fold("St. Louis"), fold("St Louis"));
  assert.equal(fold("Washington, D.C."), fold("Washington D.C."));
  const look = new Map(aliases.map((a) => [fold(a.alias), a.slug]));
  const slugOf = (name: string) => look.get(fold(name));
  assert.equal(slugOf("Montréal"), "montreal");
  assert.equal(slugOf("Montreal"), "montreal");
  assert.equal(slugOf("St Louis"), "st-louis");
  assert.equal(slugOf("Washington, D.C."), "washington-dc");
  assert.equal(slugOf("L.A. Lakers"), "los-angeles");
  assert.equal(slugOf("Los Angeles Rams"), "los-angeles");
  assert.equal(slugOf("Vegas"), "las-vegas");
  assert.equal(slugOf("Québec"), "quebec-city");
  // a region's name is not a city
  for (const region of ["Minnesota", "Golden State", "Tampa Bay", "New England", "Arizona", "Carolina"]) assert.equal(slugOf(region), undefined, region);
});

test("metro decisions: boroughs are New York, the Bay Area stays three pages in one metro, Anaheim is in the Los Angeles area", () => {
  const look = new Map(aliases.map((a) => [fold(a.alias), a.slug]));
  for (const b of ["Brooklyn", "Manhattan", "The Bronx", "New York City"]) assert.equal(look.get(fold(b)), "new-york", b);
  const metroOf = (slug: string) => cities.find((c) => c.slug === slug)?.metro;
  assert.equal(metroOf("anaheim"), "los-angeles");
  assert.equal(metroOf("los-angeles"), "los-angeles");
  assert.equal(metroOf("east-rutherford"), "new-york");
  assert.equal(metroOf("oakland"), "san-francisco-bay");
  assert.equal(metroOf("san-francisco"), "san-francisco-bay");
  assert.notEqual(metroOf("oakland"), undefined);
  assert.ok(citySlugs.has("oakland") && citySlugs.has("san-francisco"));
});

test("region hints name a state or province", () => {
  for (const h of hints) assert.match(h.region, /^(US|CA)-[A-Z]{2}$/, h.name);
  assert.equal(new Set(hints.map((h) => fold(h.name))).size, hints.length);
});

test("coordinates (when the Wikidata file is there) sit in North America and name each city once", () => {
  const places = csv("city_place.csv");
  const seen = new Set<string>();
  for (const p of places) {
    assert.ok(citySlugs.has(p.slug), p.slug);
    assert.ok(!seen.has(p.slug), `${p.slug} twice`);
    seen.add(p.slug);
    assert.match(p.wikidata_id, /^Q\d+$/, p.slug);
    const lat = Number(p.latitude), lon = Number(p.longitude);
    assert.ok(lat > 24 && lat < 72 && lon > -170 && lon < -52, `${p.slug} ${lat},${lon}`);
  }
  // the long-standing cities must have been found
  for (const s of ["vancouver", "los-angeles", "montreal", "new-york", "toronto", "chicago"]) assert.ok(seen.has(s), `${s} has no coordinates`);
});

// ---- the numbers ----

const ref = (slug: string, metro: string | null = null): CityRef => ({ slug, name: slug, nameFr: null, region: "US-XX", country: "US", lat: 0, lon: 0, metro, metroName: metro, metroNameFr: null });
const place = (league: string, year: number, f: number, city: string): Placement => ({ league, year, f, city, basis: "identity", venueLat: null, venueLon: null, venueCity: null });
const season = (league: string, year: number, f: number, w: number | null, l: number | null, champion = false, team = `T${f}`): ClubSeason => ({ league, year, f, team, w, l, t: 0, otl: 0, champion });

test("a stay is a club's seasons in one city; a season the league skipped does not break a run", () => {
  const seasons = [season("nhl", 2003, 1, 40, 30), season("nhl", 2005, 1, 41, 31, true), season("nhl", 2006, 1, 20, 50), season("nhl", 2003, 2, 10, 10), season("nhl", 2005, 2, 11, 9), season("nhl", 2004, 3, 1, 1)];
  const places = [place("nhl", 2003, 1, "a"), place("nhl", 2005, 1, "a"), place("nhl", 2006, 1, "b"), place("nhl", 2003, 2, "a"), place("nhl", 2005, 2, "a")];
  // 2004 is a year the league did play (club 3 has a season in it, unplaced): club 1 skipped it, so its run breaks there
  const stays = buildStays(places, seasons);
  const one = stays.find((s) => s.f === 1 && s.city === "a")!;
  assert.deepEqual(one.runs, [[2003, 2003], [2005, 2005]]);
  assert.equal(one.seasons, 2);
  assert.deepEqual(one.titles, [2005]);
  assert.equal(one.titleTeams[0], "T1");
  assert.equal(stays.find((s) => s.f === 1 && s.city === "b")!.seasons, 1);
  assert.equal(stays.find((s) => s.f === 3), undefined, "an unplaced season belongs to no city");
  // with no season in 2004 anywhere, 2003 and 2005 are neighbours
  const lockout = buildStays(places, seasons.filter((s) => s.year !== 2004));
  assert.deepEqual(lockout.find((s) => s.f === 1 && s.city === "a")!.runs, [[2003, 2005]]);
});

test("win share counts a tie as half a win and an overtime loss as a loss", () => {
  assert.equal(winShare(0, 0, 0, 0), null);
  assert.equal(winShare(3, 1, 0, 0), 0.75);
  assert.equal(winShare(1, 1, 2, 0), 0.5);
  assert.equal(winShare(1, 1, 0, 2), 0.25);
});

test("titles by decade and totals", () => {
  const seasons = [season("nhl", 1991, 1, 50, 30, true), season("nhl", 1999, 1, 50, 30, true), season("nhl", 2001, 1, 50, 30, true), season("nba", 1995, 2, 60, 22, true), season("nba", 1996, 2, 60, 22)];
  const stays = buildStays([...seasons.map((s) => place(s.league, s.year, s.f, "x"))], seasons);
  const d = titlesByDecade(stays);
  assert.deepEqual(d.get(1990), { nhl: 2, nba: 1 });
  assert.deepEqual(d.get(2000), { nhl: 1 });
  const t = totalsOf(stays);
  assert.equal(t.clubs, 2); assert.equal(t.titles, 4); assert.equal(t.seasons, 5); assert.deepEqual(t.leagues, ["nba", "nhl"]);
  assert.equal(t.first, 1991); assert.equal(t.last, 2001);
});

test("a stay narrowed to a range of years adds up again for those years only", () => {
  const seasons = [season("nhl", 1990, 1, 40, 30, true, "Old"), season("nhl", 1991, 1, 20, 50), season("nhl", 1992, 1, 30, 40), season("nhl", 1995, 1, 10, 10, true, "New"), season("nhl", 1996, 1, 5, 15), season("nhl", 1993, 9, 1, 1), season("nhl", 1994, 9, 1, 1)];
  const places = seasons.filter((s) => s.f === 1).map((s) => place(s.league, s.year, 1, "x"));
  const stay = buildStays(places, seasons).find((s) => s.f === 1)!;
  assert.deepEqual(stay.runs, [[1990, 1992], [1995, 1996]]);
  assert.equal(clipStay(stay, 1980, 2010), stay, "a range that holds every season changes nothing");
  assert.equal(clipStay(stay, 1993, 1994), null, "no season inside");
  const a = clipStay(stay, 1991, 1995)!;
  assert.deepEqual(a.runs, [[1991, 1992], [1995, 1995]]);
  assert.equal(a.seasons, 3); assert.equal(a.first, 1991); assert.equal(a.last, 1995);
  assert.deepEqual(a.titles, [1995]); assert.deepEqual(a.titleTeams, ["New"]);
  assert.deepEqual([a.w, a.l], [60, 100]);
  assert.equal(a.share, winShare(60, 100, 0, 0));
  assert.equal(a.name, stay.name, "the club keeps the name it wears here");
  assert.equal(a.active, stay.active);
  // the figures of a range agree with the club's own seasons
  const b = clipStay(stay, 1990, 1990)!;
  assert.deepEqual(totalsOf([b]), { ...totalsOf([b]), seasons: 1, titles: 1, first: 1990, last: 1990 });
  assert.deepEqual(b.titleTeams, ["Old"]);
});

test("ranks: ties share a place, and a short history is not ranked by rate or share", () => {
  const mk = (n: number, titles: number, w: number, l: number): ClubSeason[] => Array.from({ length: n }, (_, i) => season("mlb", 1900 + i, 0, w, l, i < titles));
  const make = (slug: string, n: number, titles: number, w: number, l: number, f: number) => ({ slug, seasons: mk(n, titles, w, l).map((s) => ({ ...s, f })) });
  const defs = [make("a", MIN_RANKED_SEASONS, 5, 90, 70, 1), make("b", MIN_RANKED_SEASONS, 5, 80, 80, 2), make("c", MIN_RANKED_SEASONS, 2, 70, 90, 3), make("d", 10, 9, 100, 62, 4)];
  const all = defs.flatMap((d) => d.seasons);
  const stays = buildStays(defs.flatMap((d) => d.seasons.map((s) => place("mlb", s.year, s.f, d.slug))), all.map((s, i) => ({ ...s, year: s.year + 0 * i })));
  const cs = defs.map((d) => ref(d.slug));
  const totals = unitTotals(cs, stays);
  assert.equal(rankOf(totals, "a", "titles")?.rank, 2, "d has 9 titles, a and b tie on 5");
  assert.equal(rankOf(totals, "b", "titles")?.rank, 2);
  assert.equal(rankOf(totals, "c", "titles")?.rank, 4);
  assert.equal(rankOf(totals, "d", "rate"), null, "ten seasons are too few");
  assert.equal(rankOf(totals, "a", "share")?.rank, 1);
  assert.equal(rankOf(totals, "a", "rate")?.of, 3);
});

test("a metro area adds up its cities and ranks as one", () => {
  const seasons = [season("nfl", 2000, 1, 10, 6, true), season("nfl", 2000, 2, 8, 8)];
  const stays = buildStays([place("nfl", 2000, 1, "east"), place("nfl", 2000, 2, "city")], seasons);
  const cs = [ref("city", "metro"), ref("east", "metro"), ref("lone")];
  assert.equal(unitOf(cs[0]), "metro");
  assert.equal(unitOf(cs[2]), "lone");
  const units = unitTotals(cs, stays);
  assert.equal(units.get("metro")?.clubs, 2);
  assert.equal(units.get("metro")?.titles, 1);
  assert.equal(units.has("lone"), false);
});

test("Stanley Cup titles before the NHL join the NHL franchise's stay, or make a club of the city with no seasons", () => {
  const stays = buildStays([place("nhl", 1917, 7, "vancouver"), place("nhl", 1919, 7, "vancouver")], [season("nhl", 1917, 7, null, null, false, "Vancouver Millionaires"), season("nhl", 1919, 7, null, null)]);
  const cup = [
    { year: 1915, team: "Vancouver Millionaires", league: "PCHA", club: "Vancouver Millionaires", franchise: 7, city: "vancouver", wins: 1 },
    { year: 1899, team: "Montreal Shamrocks", league: "CAHL", club: "Montreal Shamrocks", franchise: null, city: "montreal", wins: 2 },
    { year: 1900, team: "Montreal Shamrocks", league: "CAHL", club: "Montreal Shamrocks", franchise: null, city: "montreal", wins: 3 },
    { year: 1914, team: "Toronto Hockey Club", league: "NHA", club: "Toronto Blueshirts", franchise: null, city: null, wins: 2 },
  ];
  const finalists = [{ year: 1916, team: "Portland Rosebuds", league: "PCHA", club: "Portland Rosebuds", franchise: null, city: "portland" }, { year: 1915, team: "Vancouver Millionaires", league: "PCHA", club: "x", franchise: 7, city: "vancouver" }];
  const all = withCupTitles(stays, cup, finalists);
  const van = all.find((s) => s.f === 7)!;
  assert.deepEqual(van.titles, [1915]);
  assert.deepEqual(van.before, [1915]);
  assert.equal(van.first, 1915, "the stay now starts with the title");
  assert.equal(van.seasons, 2, "the title is not a season");
  assert.deepEqual(van.runs, [[1917, 1919]], "runs are of seasons only");
  const mtl = all.find((s) => s.city === "montreal")!;
  assert.ok(mtl.cup && mtl.f < 0 && mtl.seasons === 0 && mtl.rows.length === 0);
  assert.deepEqual(mtl.titles, [1899, 1900]);
  assert.equal(all.find((s) => s.city === "portland")!.titles.length, 0, "a finalist has a club but no title");
  assert.deepEqual(all.find((s) => s.city === "portland")!.finals, [1916]);
  assert.equal(all.filter((s) => s.cup).length, 2, "no city, no club; a finalist that is a franchise with a stay adds none");
  const totals = totalsOf(all.filter((s) => s.city === "vancouver"));
  assert.equal(totals.titles, 1);
  // a range that holds only the title still shows the club; one that misses it does not
  assert.equal(clipStay(van, 1910, 1916)?.titles.length, 1);
  assert.equal(clipStay(van, 1918, 1919)?.titles.length, 0);
  assert.equal(clipStay(mtl, 1890, 1899)?.titles.length, 1);
  assert.equal(clipStay(mtl, 1901, 1990), null);
});

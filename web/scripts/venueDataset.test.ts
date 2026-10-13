import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  clubsText, compareVals, csvField, DATASET, formerNamesText, queryVenues, RECORD_FIELDS, venueOrder, venueRecords, venuesCsv, venuesGeoJson, wikipediaTitle,
  type VenueDetail, type VenueQuery, type VenueRecord,
} from "../src/lib/venueDataset.ts";
import { readCursor, type Order } from "../src/lib/listQuery.ts";
import type { VenueRow } from "../src/lib/venueModel.ts";

/** Run in web/: pnpm test:venues */

const row = (o: Partial<VenueRow>): VenueRow => ({
  id: "x", name: "X", former: null, lat: 40, lon: -75, cc: "US", place: null, citySlug: null, wiki: null, address: null, addressHref: null,
  leagues: ["nhl"], clubs: [], opened: null, closed: null, capacity: null, roof: null, surface: null, owner: null, from: 1950, to: null, current: true, al: [], extra: [], ...o,
});

/** What listParams.ts afterValues does with a cursor, without its zod and Next imports. */
const afterValues = (raw: string, sortText: string, order: Order) => readCursor(raw, sortText, order);

const QUERY: VenueQuery = { words: [], status: "all" };
const PAGE: { fields: readonly string[] | null; limit: number; offset: number; after: null } = { fields: null, limit: 50, offset: 0, after: null };
const sortOf = (text: string) => ({ order: venueOrder(text.split(",").map((p) => ({ key: p.split(".")[0], dir: p.split(".")[1] as "asc" | "desc" }))), sortText: text });

const rec = (o: Partial<VenueRecord>): VenueRecord => ({
  id: "Q1", wikidata_id: "Q1", name: "A", former_names: [], latitude: 40, longitude: -75, city: null, region: null, country: "US", leagues: ["nhl"], clubs: [],
  first_year: 1950, last_year: null, current: true, opened: null, closed: null, capacity: null, roof: null, surface: null, wikipedia_title: null, ...o,
});

/** A small RFC 4180 reader, to check that what the CSV writes is what a program reads back. */
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let cur: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\r" && text[i + 1] === "\n") { cur.push(field); out.push(cur); cur = []; field = ""; i++; }
    else field += c;
  }
  assert.equal(field, "");
  assert.deepEqual(cur, []);
  return out;
}

/* ---------- records -------------------------------------------------------------------- */

test("a record takes its ids, place and names from the row and its detail", () => {
  const detail = new Map<string, VenueDetail>([
    ["Q42", { wid: "Q42", city: "Montréal", iso: "CA-QC", names: [{ name: "Molson Centre", from: 1996, until: 2002 }, { name: "Bell Centre", from: 2002, until: null }] }],
  ]);
  const rows = [
    row({ id: "Q42", name: "Bell Centre", lat: 45.4961, lon: -73.5693, cc: "ca", wiki: "https://en.wikipedia.org/wiki/Bell_Centre", leagues: ["nhl"], clubs: [{ lg: "nhl", f: 6, name: "Montréal Canadiens", href: "/nhl/team/x", from: 1996, to: null, logo: "https://example.test/logo.svg" }] }),
    row({ id: "40.00000|-75.00000", name: "Old Barn", lat: 40, lon: -75 }),
  ];
  const [a, b] = venueRecords(rows, detail);
  assert.equal(a.id, "Q42");
  assert.equal(a.wikidata_id, "Q42");
  assert.deepEqual(a.former_names, [{ name: "Molson Centre", from: 1996, until: 2002 }]);
  assert.equal(a.region, "CA-QC");
  assert.equal(a.country, "CA");
  assert.equal(a.wikipedia_title, "Bell Centre");
  assert.deepEqual(a.clubs, [{ league: "nhl", franchise_id: 6, name: "Montréal Canadiens", from: 1996, to: null }]);
  assert.equal(b.id, "geo:40.00000,-75.00000");
  assert.equal(b.wikidata_id, null);
  assert.deepEqual(b.former_names, []);
});

test("a Wikipedia title is read back from the address", () => {
  assert.equal(wikipediaTitle("https://en.wikipedia.org/wiki/Madison_Square_Garden_(1968)"), "Madison Square Garden (1968)");
  assert.equal(wikipediaTitle("https://en.wikipedia.org/wiki/Stade_Ol%C3%A9ym"), "Stade Oléym");
  assert.equal(wikipediaTitle("https://fr.wikipedia.org/wiki/X"), null);
  assert.equal(wikipediaTitle(null), null);
  assert.equal(wikipediaTitle("https://en.wikipedia.org/wiki/%E0%A4%A"), null);
});

/* ---------- CSV ------------------------------------------------------------------------ */

test("a CSV field is quoted only when it has to be", () => {
  assert.equal(csvField("plain"), "plain");
  assert.equal(csvField("Café Zürich"), "Café Zürich");
  assert.equal(csvField("東京ドーム"), "東京ドーム");
  assert.equal(csvField("a,b"), '"a,b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField("two\nlines"), '"two\nlines"');
  assert.equal(csvField("one\r\ntwo"), '"one\r\ntwo"');
  assert.equal(csvField(" lead"), '" lead"');
  assert.equal(csvField(null), "");
  assert.equal(csvField(undefined), "");
  assert.equal(csvField(0), "0");
  assert.equal(csvField(false), "false");
});

test("the CSV reads back exactly, with commas, quotes, accents and Japanese in names", () => {
  const records = [
    rec({ id: "Q1", wikidata_id: "Q1", name: 'Joe\'s "Big, Loud" Arena', city: "Zürich", region: "CH-ZH", country: "CH", former_names: [{ name: "Café, Grand", from: 1990, until: 2001 }, { name: "Arena Two", from: null, until: 1989 }] }),
    rec({ id: "Q2", wikidata_id: "Q2", name: "東京ドーム", city: "文京区", country: "JP", capacity: 55000, surface: "artificial turf", roof: "dome", wikipedia_title: "Tokyo Dome", leagues: ["mlb"] }),
    rec({ id: "geo:1.00000,2.00000", wikidata_id: null, name: "No Id", latitude: -33.5, longitude: 151.25, clubs: [{ league: "nfl", franchise_id: 3, name: 'Team "A", B', from: 1999, to: null }, { league: "nba", franchise_id: 4, name: "C", from: 1980, to: 1990 }], leagues: ["nfl", "nba"] }),
  ];
  const text = venuesCsv(records);
  assert.ok(text.endsWith("\r\n"));
  assert.ok(!text.includes("\n\n"));
  const table = parseCsv(text);
  assert.deepEqual(table[0], [...RECORD_FIELDS]);
  assert.equal(table.length, 4);
  for (const line of table) assert.equal(line.length, RECORD_FIELDS.length);
  const col = (r: string[], k: (typeof RECORD_FIELDS)[number]) => r[RECORD_FIELDS.indexOf(k)];
  assert.equal(col(table[1], "name"), 'Joe\'s "Big, Loud" Arena');
  assert.equal(col(table[1], "city"), "Zürich");
  assert.equal(col(table[1], "former_names"), "Café, Grand (1990-2001); Arena Two (-1989)");
  assert.equal(col(table[2], "name"), "東京ドーム");
  assert.equal(col(table[2], "city"), "文京区");
  assert.equal(col(table[2], "capacity"), "55000");
  assert.equal(col(table[2], "wikipedia_title"), "Tokyo Dome");
  assert.equal(col(table[3], "wikidata_id"), "");
  assert.equal(col(table[3], "latitude"), "-33.5");
  assert.equal(col(table[3], "clubs"), 'nfl:3 Team "A", B (1999-); nba:4 C (1980-1990)');
  assert.equal(col(table[3], "leagues"), "nfl;nba");
  assert.equal(col(table[3], "current"), "true");
});

test("the lists in a CSV cell are written the way /sources says", () => {
  assert.equal(formerNamesText([{ name: "Qwest Field", from: 2004, until: 2011 }]), "Qwest Field (2004-2011)");
  assert.equal(clubsText([{ league: "nhl", franchise_id: 12, name: "Boston Bruins", from: 1995, to: null }]), "nhl:12 Boston Bruins (1995-)");
});

/* ---------- GeoJSON -------------------------------------------------------------------- */

test("the GeoJSON is a valid RFC 7946 FeatureCollection of Points in [longitude, latitude] order", () => {
  const records = [
    rec({ id: "Q42", wikidata_id: "Q42", name: "Bell Centre", latitude: 45.4961, longitude: -73.5693, country: "CA", city: "Montréal" }),
    rec({ id: "geo:-33.50000,151.25000", wikidata_id: null, name: "Sydney Place", latitude: -33.5, longitude: 151.25 }),
  ];
  const doc = JSON.parse(JSON.stringify(venuesGeoJson(records, new Date("2026-10-13T12:00:00Z"))));
  assert.equal(doc.type, "FeatureCollection");
  assert.ok(Array.isArray(doc.features));
  assert.equal(doc.features.length, 2);
  for (const f of doc.features) {
    assert.equal(f.type, "Feature");
    assert.equal(typeof f.id, "string");
    assert.equal(f.geometry.type, "Point");
    const [lon, lat, ...rest] = f.geometry.coordinates as number[];
    assert.deepEqual(rest, []);
    assert.ok(Number.isFinite(lon) && lon >= -180 && lon <= 180, `longitude ${lon}`);
    assert.ok(Number.isFinite(lat) && lat >= -90 && lat <= 90, `latitude ${lat}`);
    assert.equal(typeof f.properties, "object");
    assert.ok(f.properties && !Array.isArray(f.properties));
    assert.ok(!("latitude" in f.properties) && !("longitude" in f.properties), "the position is the geometry, not a property");
  }
  // Montreal is west of Greenwich and north of the equator: longitude first.
  assert.deepEqual(doc.features[0].geometry.coordinates, [-73.5693, 45.4961]);
  assert.deepEqual(doc.features[1].geometry.coordinates, [151.25, -33.5]);
  assert.equal(doc.features[0].id, "Q42");
  assert.equal(doc.features[0].properties.wikidata_id, "Q42");
  assert.equal(doc.features[0].properties.city, "Montréal");
});

test("the GeoJSON names its dataset, licence, attribution, sources and date at the top level", () => {
  const doc = JSON.parse(JSON.stringify(venuesGeoJson([], new Date("2026-10-13T12:00:00Z"))));
  assert.equal(doc.name, DATASET.name);
  assert.match(doc.licence, /CC0 1\.0/);
  assert.match(doc.licence, /CC BY-SA 4\.0/);
  assert.match(doc.attribution, /Wikidata/);
  assert.match(doc.attribution, /Wikipedia/);
  assert.equal(doc.generated, "2026-10-13T12:00:00.000Z");
  assert.deepEqual(doc.sources.map((s: { name: string }) => s.name), ["Wikidata", "English Wikipedia", "SPX Stats archive"]);
  for (const s of doc.sources) assert.match(s.url, /^https:\/\//);
  assert.deepEqual(doc.features, []);
});

/* ---------- GET /api/venues: filter, sort, page ----------------------------------------- */

const R = [
  rec({ id: "Q1", name: "Alpha Arena", city: "Boston", country: "US", leagues: ["nhl", "nba"], capacity: 17000, opened: 1995, first_year: 1995, last_year: null, current: true, clubs: [{ league: "nhl", franchise_id: 1, name: "Bruins", from: 1995, to: null }] }),
  rec({ id: "Q2", name: "Beta Garden", city: "Montréal", country: "CA", leagues: ["nhl"], capacity: 17500, opened: 1924, first_year: 1924, last_year: 1996, current: false, former_names: [{ name: "Forum Neuf", from: 1924, until: 1950 }], clubs: [{ league: "nhl", franchise_id: 6, name: "Canadiens", from: 1924, to: 1996 }] }),
  rec({ id: "Q3", name: "Gamma Field", city: null, country: "US", leagues: ["mlb"], capacity: null, opened: null, first_year: null, last_year: null, current: true, clubs: [] }),
  rec({ id: "Q4", name: "Delta Park", city: "Toronto", country: "CA", leagues: ["mlb", "cfl"], capacity: 17000, opened: 1989, first_year: 1989, last_year: 2004, current: false, clubs: [{ league: "mlb", franchise_id: 9, name: "Blue Jays", from: 1989, to: 2004 }] }),
  rec({ id: "Q5", name: "Écran Dôme", city: "Québec", country: "CA", leagues: ["nfl"], capacity: 40000, opened: 2001, first_year: 2001, last_year: null, current: true, clubs: [] }),
];
const ids = (p: { data: { id?: string }[] }) => p.data.map((d) => d.id);
const run = (q: Partial<VenueQuery>, sort = "name.asc", extra: Partial<typeof PAGE> = {}) => queryVenues(R, { ...QUERY, ...q }, { ...PAGE, ...sortOf(sort), ...extra });

test("filters: league, status, country, years, words", () => {
  assert.deepEqual(ids(run({ league: "nhl" })), ["Q1", "Q2"]);
  assert.deepEqual(ids(run({ league: "cfl" })), ["Q4"]);
  assert.deepEqual(ids(run({ status: "current" })), ["Q1", "Q5", "Q3"]);
  assert.deepEqual(ids(run({ status: "former" })), ["Q2", "Q4"]);
  assert.deepEqual(ids(run({ nat: "ca" })), ["Q2", "Q4", "Q5"]);
  // a range keeps venues used in any year of it, and keeps one whose years are unknown (Q3), as the page does
  assert.deepEqual(ids(run({ from: 1997, to: 2000 })), ["Q1", "Q4", "Q3"]);
  assert.deepEqual(ids(run({ to: 1950 })), ["Q2", "Q3"]);
  assert.deepEqual(ids(run({ from: 2010 })), ["Q1", "Q5", "Q3"]);
  // words: accents ignored, former names, cities and clubs searched
  assert.deepEqual(ids(run({ words: ["ecran"] })), ["Q5"]);
  assert.deepEqual(ids(run({ words: ["forum"] })), ["Q2"]);
  assert.deepEqual(ids(run({ words: ["montreal"] })), ["Q2"]);
  assert.deepEqual(ids(run({ words: ["blue", "jays"] })), ["Q4"]);
  assert.deepEqual(ids(run({ words: ["zzz"] })), []);
});

test("sorting: names fold accents, empty values come last either way, ties fall back to the id", () => {
  assert.deepEqual(ids(run({}, "name.asc")), ["Q1", "Q2", "Q4", "Q5", "Q3"]);
  assert.deepEqual(ids(run({}, "capacity.desc")), ["Q5", "Q2", "Q1", "Q4", "Q3"]);
  assert.deepEqual(ids(run({}, "capacity.asc")), ["Q1", "Q4", "Q2", "Q5", "Q3"]);
  assert.deepEqual(ids(run({}, "capacity.desc,name.desc")), ["Q5", "Q2", "Q4", "Q1", "Q3"]);
  assert.deepEqual(ids(run({}, "city.asc")), ["Q1", "Q2", "Q5", "Q4", "Q3"]);
  assert.deepEqual(ids(run({}, "opened.asc")), ["Q2", "Q4", "Q1", "Q5", "Q3"]);
  assert.deepEqual(ids(run({}, "clubs.desc,name.asc")), ["Q1", "Q2", "Q4", "Q5", "Q3"]);
});

test("offset paging counts the total; fields keep the id and the listed keys", () => {
  const p = run({}, "name.asc", { limit: 2, offset: 2 });
  assert.equal(p.data.length, 2);
  assert.deepEqual(p.page, { limit: 2, offset: 2, sort: "name.asc", next: p.page.next, total: 5 });
  assert.ok(p.page.next);
  const last = run({}, "name.asc", { limit: 2, offset: 4 });
  assert.equal(last.data.length, 1);
  assert.equal(last.page.next, null);
  const f = run({}, "name.asc", { fields: ["city", "capacity"] });
  assert.deepEqual(Object.keys(f.data[0]).sort(), ["capacity", "city", "id"]);
  assert.deepEqual(run({ league: "xxx" }).data, []);
});

test("following page.next visits every venue once, whatever the sort", () => {
  for (const sort of ["name.asc", "name.desc", "capacity.desc,name.asc", "city.asc", "opened.desc", "clubs.desc"]) {
    const { order, sortText } = sortOf(sort);
    const seen: (string | undefined)[] = [];
    let after: ReturnType<typeof afterValues> = null;
    for (let guard = 0; guard < 10; guard++) {
      const p = queryVenues(R, QUERY, { fields: null, limit: 2, offset: 0, order, sortText, after });
      assert.equal(p.page.total, after ? null : 5);
      assert.equal(p.page.offset, after ? null : 0);
      seen.push(...ids(p));
      if (!p.page.next) break;
      after = afterValues(p.page.next, sortText, order);
      assert.ok(after, "the cursor reads back for its own sort");
    }
    assert.deepEqual(seen, ids(run({}, sort)), sort);
    assert.equal(new Set(seen).size, 5, sort);
  }
});

test("a cursor stays valid when its row has gone, and is refused by another sort", () => {
  const { order, sortText } = sortOf("name.asc");
  const first = queryVenues(R, QUERY, { fields: null, limit: 2, offset: 0, order, sortText, after: null });
  const gone = R.filter((r) => r.id !== first.data[1].id);
  const after = afterValues(first.page.next!, sortText, order);
  const next = queryVenues(gone, QUERY, { fields: null, limit: 10, offset: 0, order, sortText, after });
  assert.deepEqual(ids(next), ["Q4", "Q5", "Q3"].filter((i) => i !== first.data[1].id));
  const other = sortOf("capacity.desc");
  assert.equal(afterValues(first.page.next!, other.sortText, other.order), null);
});

test("comparison puts empty values last in both directions", () => {
  const asc = venueOrder([{ key: "capacity", dir: "asc" }]);
  const desc = venueOrder([{ key: "capacity", dir: "desc" }]);
  assert.ok(compareVals(asc, [5, "a"], [null, "b"]) < 0);
  assert.ok(compareVals(desc, [5, "a"], [null, "b"]) < 0);
  assert.equal(compareVals(asc, [null, "a"], [null, "a"]), 0);
});

/* ---------- the routes ----------------------------------------------------------------- */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the downloads are kept routes: one revalidate hour, no request, no query, no per-request work", () => {
  for (const file of ["../src/app/venues.csv/route.ts", "../src/app/venues.geojson/route.ts"]) {
    assert.ok(existsSync(new URL(file, import.meta.url)), file);
    const src = read(file);
    assert.match(src, /export const revalidate = 3600;/, file);
    assert.match(src, /export async function GET\(\)/, file);
    assert.doesNotMatch(src, /request|searchParams|cookies|headers\(|dynamic\s*=/, file);
    assert.doesNotMatch(src, /\bsql\b/i, file);
  }
  assert.match(read("../src/app/venues.csv/route.ts"), /text\/csv; charset=utf-8/);
  assert.match(read("../src/app/venues.geojson/route.ts"), /application\/geo\+json/);
});

test("the API route is a list API: it goes through respond() and the checked parameters", () => {
  const src = read("../src/app/api/venues/route.ts");
  assert.match(src, /respond\(/);
  assert.match(src, /listVenues\(/);
  for (const p of ["league", "status", "from", "to", "sort", "limit", "offset", "after", "fields"]) assert.ok(src.includes(p), `contract names ${p}`);
  const data = read("../src/lib/venueData.ts");
  assert.match(data, /parseListParams\("venues"/);
});

test("the /venues page and /sources link the downloads and describe the dataset", () => {
  const links = read("../src/components/VenueDataLinks.tsx");
  for (const href of ["/venues.csv", "/venues.geojson", "/api/venues"]) assert.ok(links.includes(`href="${href}"`), href);
  assert.match(read("../src/app/[locale]/s/venues/page.tsx"), /<VenueDownload /);
  assert.match(read("../src/app/[locale]/s/sources/page.tsx"), /venuesData\.licence/);
});

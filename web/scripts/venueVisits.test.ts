import assert from "node:assert/strict";
import { test } from "node:test";
import { cardSvg, cardText, cardWords } from "../src/lib/venueCard.ts";
import { emptyFilter, filterQuery, readFilter, venueMatches, type VenueRow } from "../src/lib/venueModel.ts";
import {
  countVisits, exportVisits, isVenueKey, mergeVisits, NOTE_MAX, parseVisits, serializeVisits, setDetails, setVisited, validDate, venueKey, visitMatches, VISITS_VERSION,
  type Visits,
} from "../src/lib/venueVisits.ts";

/** Run in web/: pnpm test:venues */

const V = (d: string | null, n: string, t: number) => ({ d, n, t });

test("a venue is kept under its Wikidata id, else its coordinates, the same id as the open dataset", () => {
  assert.equal(venueKey("q131370", 40.1, -75.2), "Q131370");
  assert.equal(venueKey(null, 41.88, -87.6741234), "geo:41.88000,-87.67412");
  assert.ok(isVenueKey("Q131370") && isVenueKey("geo:41.88000,-87.67412"));
  assert.ok(!isVenueKey("__proto__") && !isVenueKey("Q0") && !isVenueKey("geo:1,2") && !isVenueKey("<script>"));
});

test("a day must be a real calendar day", () => {
  assert.ok(validDate("2024-02-29") && !validDate("2023-02-29") && !validDate("2024-13-01") && !validDate("2024-1-1") && !validDate("yesterday"));
});

test("a list survives writing and reading, and the same list always writes the same text", () => {
  const a: Visits = { Q2: V("2011-06-15", "Game 7", 20), Q1: V(null, "", 10), "geo:41.88000,-87.67412": V("2019-01-02", "", 30) };
  const text = serializeVisits(a);
  assert.deepEqual(JSON.parse(text).v, VISITS_VERSION);
  assert.deepEqual(parseVisits(text), { visits: a, status: "ok", skipped: 0 });
  assert.equal(serializeVisits({ ...a }), text);
  assert.deepEqual(Object.keys(JSON.parse(text).visits), ["Q1", "Q2", "geo:41.88000,-87.67412"]);
  assert.deepEqual(JSON.parse(text).visits.Q1, { t: 10 }, "empty parts are left out");
});

test("an exported file reads back, and says which app made it", () => {
  const a: Visits = { Q5: V("2000-01-01", "x", 1) };
  const file = JSON.parse(exportVisits(a, "2026-10-13"));
  assert.equal(file.app, "spxn-venue-visits");
  assert.equal(file.exported, "2026-10-13");
  assert.deepEqual(parseVisits(exportVisits(a, "2026-10-13")).visits, a);
  assert.equal(parseVisits(JSON.stringify({ app: "other-app", v: 1, visits: {} })).status, "bad");
});

test("no text, bad JSON and the wrong shapes never throw", () => {
  assert.equal(parseVisits(null).status, "empty");
  assert.equal(parseVisits("").status, "empty");
  for (const text of ["{", "not json", "null", "[]", "42", '"x"', "{}", '{"v":"1","visits":{}}', '{"v":0,"visits":{}}', '{"v":1.5,"visits":{}}', '{"v":1}', '{"v":1,"visits":[]}', '{"v":1,"visits":"x"}']) {
    const p = parseVisits(text);
    assert.equal(p.status, "bad", text);
    assert.deepEqual(p.visits, {});
  }
  assert.equal(parseVisits('{"v":1,"visits":{}}').status, "empty");
});

test("a list from a newer version is read as empty and flagged, so it can be left alone", () => {
  const p = parseVisits(JSON.stringify({ v: VISITS_VERSION + 1, visits: { Q1: { t: 1 } }, extra: true }));
  assert.equal(p.status, "newer");
  assert.deepEqual(p.visits, {});
});

test("unusable entries are dropped and counted, usable ones are cleaned", () => {
  const p = parseVisits(JSON.stringify({
    v: 1,
    visits: {
      Q1: { d: "2024-02-30", n: "  too   many   spaces  ", t: 5 },
      Q2: { d: "2024-02-29", n: "x".repeat(NOTE_MAX + 50), t: "soon" },
      Q3: "yes", Q4: null, Q5: [], "not a key": { t: 1 }, constructor: { t: 1 },
    },
  }));
  assert.deepEqual(parseVisits('{"v":1,"visits":{"__proto__":{"t":1}}}'), { visits: {}, status: "empty", skipped: 1 });
  assert.equal(p.status, "ok");
  assert.deepEqual(Object.keys(p.visits).sort(), ["Q1", "Q2"]);
  assert.deepEqual(p.visits.Q1, V(null, "too many spaces", 5));
  assert.equal(p.visits.Q2.d, "2024-02-29");
  assert.equal(p.visits.Q2.n.length, NOTE_MAX);
  assert.equal(p.visits.Q2.t, 0);
  assert.ok(p.skipped >= 3);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("merging keeps both lists and the entry that changed last", () => {
  const a: Visits = { Q1: V("2020-01-01", "old", 10), Q2: V(null, "", 5) };
  const b: Visits = { Q1: V("2021-01-01", "new", 20), Q3: V(null, "", 1), Q2: V("2000-01-01", "older", 1) };
  const m = mergeVisits(a, b);
  assert.deepEqual(Object.keys(m).sort(), ["Q1", "Q2", "Q3"]);
  assert.equal(m.Q1.n, "new");
  assert.equal(m.Q2.t, 5, "the older entry does not win");
  assert.equal(mergeVisits(a, a).Q1, a.Q1);
  assert.deepEqual(a.Q1, V("2020-01-01", "old", 10), "the inputs are not changed");
  assert.equal(mergeVisits({ Q1: V(null, "a", 7) }, { Q1: V(null, "b", 7) }).Q1.n, "a", "a tie keeps the first");
});

test("marking, unmarking and editing a visit", () => {
  const none: Visits = {};
  const on = setVisited(none, "Q1", true, 100);
  assert.deepEqual(on, { Q1: V(null, "", 100) });
  assert.equal(setVisited(on, "Q1", true, 200), on, "already marked: nothing changes");
  assert.equal(setVisited(none, "Q1", false, 200), none);
  assert.deepEqual(setVisited(on, "Q1", false, 200), {});
  assert.deepEqual(on, { Q1: V(null, "", 100) }, "the input is not changed");
  const edited = setDetails(on, "Q1", "2015-04-02", "  Game 3 ", 300);
  assert.deepEqual(edited.Q1, V("2015-04-02", "Game 3", 300));
  assert.equal(setDetails(edited, "Q1", "2015-04-02", "Game 3", 400), edited, "same day and note: nothing changes");
  assert.equal(setDetails(edited, "Q1", "2015-02-31", "Game 3", 400).Q1.d, null, "a day that is not real is dropped");
  assert.equal(setDetails(none, "Q9", null, "x", 1).Q9.n, "x", "editing details marks it visited");
});

const row = (key: string, leagues: string[], current: boolean) => ({ key, leagues, current });
const ROWS = [row("Q1", ["mlb"], true), row("Q2", ["mlb"], false), row("Q3", ["mlb"], false), row("Q4", ["nhl", "nba"], true), row("Q5", ["nhl"], false)];

test("counts: all, per league, and how many of the visited are gone", () => {
  const c = countVisits(ROWS, { Q1: V(null, "", 1), Q2: V(null, "", 1), Q4: V(null, "", 1), Q5: V(null, "", 1), Q99: V(null, "", 1) });
  assert.deepEqual(c.all, { of: 5, seen: 4, goneOf: 3, goneSeen: 2 }, "a venue not in the list (Q99) is ignored");
  assert.deepEqual(c.byLeague.mlb, { of: 3, seen: 2, goneOf: 2, goneSeen: 1 });
  assert.deepEqual(c.byLeague.nhl, { of: 2, seen: 2, goneOf: 1, goneSeen: 1 });
  assert.deepEqual(c.byLeague.nba, { of: 1, seen: 1, goneOf: 0, goneSeen: 0 }, "a venue two leagues used counts in each");
  assert.deepEqual(countVisits(ROWS, {}).all, { of: 5, seen: 0, goneOf: 3, goneSeen: 0 });
  assert.deepEqual(countVisits([], {}), { all: { of: 0, seen: 0, goneOf: 0, goneSeen: 0 }, byLeague: {} });
});

const B = { min: 1900, max: 2026 };
const venue = (key: string): VenueRow => ({
  id: "0", key, slug: "x", name: "X", former: null, lat: 0, lon: 0, cc: "US", place: null, citySlug: null, wiki: null, address: null, addressHref: null,
  leagues: ["nhl"], clubs: [], opened: null, closed: null, capacity: null, roof: null, surface: null, owner: null, from: 1950, to: null, current: true, al: [], extra: [],
});

test("the visited filter: only visited, only the others, or both", () => {
  const seen: Visits = { Q1: V(null, "", 1) };
  assert.ok(visitMatches("", "Q2", seen) && visitMatches("yes", "Q1", seen) && !visitMatches("yes", "Q2", seen) && visitMatches("no", "Q2", seen) && !visitMatches("no", "Q1", seen));
  const yes = { ...emptyFilter(B), visited: "yes" as const }, no = { ...emptyFilter(B), visited: "no" as const };
  assert.ok(venueMatches(venue("Q1"), yes, B, seen) && !venueMatches(venue("Q2"), yes, B, seen));
  assert.ok(!venueMatches(venue("Q1"), no, B, seen) && venueMatches(venue("Q2"), no, B, seen));
  assert.ok(venueMatches(venue("Q2"), yes, B), "without the reader's list the filter filters nothing");
  assert.ok(!venueMatches(venue("Q1"), { ...yes, leagues: ["nba"] }, B, seen), "it combines with the other filters");
});

test("the visited filter is kept in the address", () => {
  const LEAGUES = ["nhl", "nba"];
  assert.equal(readFilter("?visited=yes", B, LEAGUES).visited, "yes");
  assert.equal(readFilter("?visited=no&league=nhl", B, LEAGUES).visited, "no");
  assert.equal(readFilter("?visited=maybe", B, LEAGUES).visited, "");
  assert.equal(filterQuery({ ...emptyFilter(B), visited: "no" }, B).visited, "no");
  assert.equal(filterQuery(emptyFilter(B), B).visited, null);
  assert.deepEqual(readFilter("?visited=yes", B, LEAGUES), { ...emptyFilter(B), visited: "yes" });
});

test("the summary card holds counts only and is safe SVG", () => {
  const c = countVisits(ROWS, { Q1: V(null, "secret note", 1), Q2: V("2020-01-01", "secret note", 1) });
  const w = cardWords(c, ["mlb", "nhl", "nba", "cfl"], {
    title: "Venues <visited>", site: "spxn.com/venues", name: (lg) => lg.toUpperCase(), of: (seen, of) => `${seen} of ${of}`, gone: (n) => `${n} of them gone`,
  });
  assert.equal(w.headline, "2 of 5");
  assert.equal(w.gone, "1 of them gone");
  assert.deepEqual(w.leagues.map((l) => l.name), ["MLB", "NHL", "NBA"], "a league with no venues is left out");
  const svg = cardSvg(w);
  assert.ok(svg.startsWith("<svg ") && svg.endsWith("</svg>"));
  assert.ok(svg.includes("VENUES &lt;VISITED&gt;") && !svg.includes("<visited>"), "words are escaped");
  assert.ok(svg.includes("2 of 5") && svg.includes("spxn.com/venues") && !svg.includes("secret"));
  assert.ok(cardText(w).includes("MLB 2 of 3"));
  assert.equal(cardWords(countVisits(ROWS, {}), ["mlb"], { title: "t", site: "s", name: String, of: (a, b) => `${a}/${b}`, gone: String }).gone, null);
});

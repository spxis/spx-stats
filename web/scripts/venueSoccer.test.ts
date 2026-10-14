import assert from "node:assert/strict";
import { test } from "node:test";
import { queryVenues, readKinds, venueOrder, venueRecords } from "../src/lib/venueDataset.ts";
import { emptyFilter, readFilter, venueMatches } from "../src/lib/venueModel.ts";
import { parsePitchFile, pitchFileName } from "../src/lib/venuePark.ts";
import { venueSlugs, venueSlugsAfter } from "../src/lib/venueSlug.ts";
import { summarizeGames, type VenueMatch } from "../src/lib/venueSoccerGames.ts";
import { currentName, matchCount, settleNames, soccerNamesLine, soccerPlace, soccerRows, spansOf, yearsOf, type SoccerContext, type SoccerVenue } from "../src/lib/venueSoccerRows.ts";
import { finishRow, packVenues, unpackVenues } from "../src/lib/venueWire.ts";

/** Run in web/: pnpm test:venues */

const say = ((key: string, vars?: Record<string, unknown>) => `${key}${vars ? JSON.stringify(vars) : ""}`) as unknown as SoccerContext["say"];
const ctx: SoccerContext = { say, country: () => null, address: (v) => (v.address ? { text: `${v.address}, ${v.city}`, href: "https://maps.example/x" } : null) };
const countryName = (cc: string) => cc;

const stadium = (o: Partial<SoccerVenue> = {}): SoccerVenue => ({
  venueId: 1, wid: "Q1186333", name: "Lusail Stadium", names: [{ name: "Lusail Stadium", from: null, until: null }], city: "Lusail", region: "QA-ZA", cc: "QA", lat: 25.42, lon: 51.49,
  capacity: 88966, opened: 2022, closed: null, surface: null, roof: null, address: null, postal: null, wikiTitle: "Lusail Stadium",
  pitch: { length: 105, width: 68, source: "published", cite: "enwiki:Lusail Stadium@1" }, spans: [{ lg: "wc", first: 2022, last: 2022, matches: 10 }], ...o,
});

test("a venue's matches become one span for each competition, in the competitions' order, and other competitions are left out", () => {
  const spans = spansOf([
    { venue_id: 1, league: "mls", year: 2001 }, { venue_id: 1, league: "mls", year: 2010 }, { venue_id: 1, league: "wc", year: 1994 },
    { venue_id: 1, league: "nhl", year: 2000 }, { venue_id: 2, league: "wwc", year: 2015 },
  ]);
  assert.deepEqual(spans.get(1), [{ lg: "wc", first: 1994, last: 1994, matches: 1 }, { lg: "mls", first: 2001, last: 2010, matches: 2 }]);
  assert.deepEqual(spans.get(2), [{ lg: "wwc", first: 2015, last: 2015, matches: 1 }]);
  assert.equal(matchCount({ spans: spans.get(1)! }), 3);
  assert.deepEqual(yearsOf({ spans: spans.get(1)! }), { first: 1994, last: 2010 });
  assert.deepEqual(yearsOf({ spans: [] }), { first: null, last: null });
});

test("names: the current one has no end, a name is cut where the next begins, and one name is no list", () => {
  const names = settleNames([{ name: "Santa Clara Stadium", from: 2007, until: 2013 }, { name: "Levi's Stadium", from: 2013, until: 2026 }, { name: "Levi's Stadium", from: 2026, until: null }]);
  assert.equal(currentName(names, "x"), "Levi's Stadium");
  assert.equal(currentName([], "fallback"), "fallback");
  assert.equal(soccerNamesLine(names), "Santa Clara Stadium 2007–2013 · Levi's Stadium 2013–2026 · Levi's Stadium 2026–");
  assert.equal(soccerNamesLine([{ name: "A", from: null, until: null }]), null);
});

test("a place carries its state or province only in the United States and Canada", () => {
  assert.equal(soccerPlace({ city: "Seattle", region: "US-WA", cc: "US" }), "Seattle, WA");
  assert.equal(soccerPlace({ city: "Lusail", region: "QA-ZA", cc: "QA" }), "Lusail");
  assert.equal(soccerPlace({ city: null, region: null, cc: "QA" }), null);
});

test("a stadium is a soccer row with a competition for each club; one that stands is open, a closed one ends with its last match", () => {
  const { rows, unplaced } = soccerRows([stadium(), stadium({ venueId: 2, wid: "Q2", name: "Old Ground", closed: 1999, spans: [{ lg: "wc", first: 1970, last: 1970, matches: 6 }, { lg: "mls", first: 1996, last: 1998, matches: 4 }] })], new Set(), ctx);
  assert.equal(unplaced.length, 0);
  const [a, b] = rows;
  for (const r of rows) finishRow(r, ["wc", "wwc", "mls"]);
  assert.equal(a.kind, "soccer");
  assert.deepEqual(a.leagues, ["wc"]);
  assert.equal(a.current, true);
  assert.equal(a.games, 10);
  assert.deepEqual(a.clubs.map((c) => [c.lg, c.f, c.from, c.to]), [["wc", 0, 2022, null]]);
  assert.equal(b.current, false);
  assert.deepEqual([b.from, b.to], [1970, 1998]);
  assert.deepEqual(b.leagues, ["wc", "mls"]);
});

test("a stadium that is a home venue gets no row of its own, and one with no coordinates is kept apart", () => {
  const { rows, unplaced, detail } = soccerRows([stadium({ wid: "Q5" }), stadium({ venueId: 3, wid: "Q3", lat: null, lon: null }), stadium({ venueId: 4, wid: "Q4" })], new Set(["Q5"]), ctx);
  assert.deepEqual(rows.map((r) => r.id), ["soccer:Q4"]);
  assert.deepEqual(unplaced.map((r) => r.id), ["soccer:Q3"]);
  assert.equal(detail.get("soccer:Q3")?.wid, "Q3");
  assert.equal(detail.has("soccer:Q5"), false);
});

test("slugs of the stadiums never change a home venue's, and stay unique", () => {
  const home = venueSlugs([{ id: "h", name: "BC Place", wid: "Q1", city: "Vancouver" }, { id: "h2", name: "Estadio Nacional", wid: "Q9", city: "Lima" }]);
  const taken = new Set(home.values());
  const out = venueSlugsAfter([
    { id: "a", name: "Estadio Nacional", wid: "Q10", city: "Santiago" }, { id: "b", name: "Estadio Nacional", wid: "Q11", city: "Santiago" }, { id: "c", name: "Lusail Stadium", wid: "Q12", city: "Lusail" },
    { id: "d", name: "Estadio Nacional", wid: "Q13", city: "Lima" },
  ], taken);
  const slugs = [...out.values()];
  assert.equal(new Set(slugs).size, slugs.length, "every slug is unique");
  assert.ok(slugs.every((s) => !taken.has(s)), "none takes a home venue's");
  assert.equal(out.get("c"), "lusail-stadium");
  assert.equal(home.get("h"), "bc-place");
  // the same input in another order gives the same slugs
  const again = venueSlugsAfter([
    { id: "d", name: "Estadio Nacional", wid: "Q13", city: "Lima" }, { id: "c", name: "Lusail Stadium", wid: "Q12", city: "Lusail" }, { id: "b", name: "Estadio Nacional", wid: "Q11", city: "Santiago" },
    { id: "a", name: "Estadio Nacional", wid: "Q10", city: "Santiago" },
  ], taken);
  assert.deepEqual([...again].sort(), [...out].sort());
});

test("a soccer row survives the wire with its page address, its kind, its competitions' years and its country", () => {
  const { rows } = soccerRows([stadium({ address: "Lusail Boulevard" }), stadium({ venueId: 2, wid: "Q2", name: "Estadio Centenario", spans: [{ lg: "wc", first: 1930, last: 1930, matches: 10 }, { lg: "mls", first: 2001, last: 2002, matches: 2 }] })], new Set(), ctx);
  rows[0].slug = "lusail-stadium";
  rows[1].slug = "estadio-centenario-q2";
  const order = ["nhl", "wc", "wwc", "mls"];
  for (const r of rows) finishRow(r, order);
  const wire = JSON.parse(JSON.stringify(packVenues(rows, order, countryName)));
  const back = unpackVenues(wire, order, say, countryName);
  assert.equal(back.length, 2);
  for (const [i, r] of back.entries()) {
    assert.equal(r.kind, "soccer");
    assert.equal(r.slug, rows[i].slug);
    assert.equal(r.key, rows[i].key);
    assert.equal(r.name, rows[i].name);
    assert.deepEqual(r.leagues, rows[i].leagues);
    assert.deepEqual([r.from, r.to, r.current, r.games], [rows[i].from, rows[i].to, rows[i].current, rows[i].games]);
    assert.deepEqual(r.clubs.map((c) => [c.lg, c.name, c.href, c.from, c.to]), rows[i].clubs.map((c) => [c.lg, c.name, c.href, c.from, c.to]));
  }
  assert.equal(back[1].clubs[1].href, "/mls");
  assert.equal(back[0].address, rows[0].address);
});

test("the Soccer layer shows only when asked, with the other kinds as before", () => {
  const { rows } = soccerRows([stadium()], new Set(), ctx);
  const r = rows[0];
  finishRow(r, ["wc"]);
  const B = { min: 1900, max: 2026 };
  assert.ok(!venueMatches(r, emptyFilter(B), B), "home alone by default");
  assert.ok(venueMatches(r, readFilter("?show=home,soccer", B, ["wc"]), B));
  assert.deepEqual(readFilter("?show=soccer", B, ["wc"]).show, ["soccer"]);
  assert.ok(venueMatches(r, { ...readFilter("?show=soccer&league=wc", B, ["wc"]) }, B));
  assert.ok(!venueMatches(r, { ...readFilter("?show=soccer&league=mls", B, ["wc", "mls"]) }, B));
});

test("the dataset: kind soccer is asked for by name, is in all, and is not in the default answer", () => {
  assert.deepEqual(readKinds("soccer"), { ok: true, kinds: ["soccer"] });
  assert.deepEqual(readKinds("all"), { ok: true, kinds: ["home", "spring", "future", "soccer"] });
  const { rows, detail } = soccerRows([stadium()], new Set(), ctx);
  finishRow(rows[0], ["wc"]);
  const records = venueRecords(rows, detail);
  assert.equal(records[0].kind, "soccer");
  assert.equal(records[0].wikidata_id, "Q1186333");
  assert.equal(records[0].games, 10);
  const page = (kind: string | undefined) => {
    const k = readKinds(kind);
    assert.ok(k.ok);
    return queryVenues(records, { kind: k.kinds, words: [], status: "all" }, { order: venueOrder([{ key: "name", dir: "asc" }]), sortText: "name.asc", fields: ["kind"], limit: 50, offset: 0, after: null }).page.total;
  };
  assert.equal(page(undefined), 0);
  assert.equal(page("soccer"), 1);
  assert.equal(page("all"), 1);
});

test("a pitch is a file named by its size to the half metre, and only a size a football pitch can have is a file", () => {
  assert.equal(pitchFileName(105, 68, "en"), "pitch-105x68.en.svg");
  assert.equal(pitchFileName(104.6, 67.8, "ja"), "pitch-104.5x68.ja.svg");
  assert.equal(pitchFileName(100.58, 64.01, "en"), "pitch-100.5x64.en.svg");
  assert.deepEqual(parsePitchFile("pitch-105x68.en.svg"), { length: 105, width: 68, language: "en" });
  assert.deepEqual(parsePitchFile("pitch-104.5x68.5.ja.svg"), { length: 104.5, width: 68.5, language: "ja" });
  for (const bad of ["pitch-200x68.en.svg", "pitch-105x20.en.svg", "pitch-60x90.en.svg", "pitch-105x68.fr.svg", "pitch-105.3x68.en.svg", "pitch-105x68.en.png", "pitch-105x68.svg", "nhl.en.svg", "pitch-../x68.en.svg"]) {
    assert.equal(parsePitchFile(bad), null, bad);
  }
});

const m = (o: Partial<VenueMatch>): VenueMatch => ({
  match_id: 1, league: "wc", year: 2022, stage_key: "group", stage_order: 1, group_name: "Group A", match_date: "2022-11-21", home_team_id: "N-a", home: "A", home_slug: "a", home_flag: "AA", home_goals: 1,
  away: "B", away_slug: "b", away_flag: "BB", away_goals: 0, extra_time: false, shootout: false, home_penalties: null, away_penalties: null, ...o,
});

test("World Cups: one edition for each tournament, rounds in the order played, and the final when it was played here", () => {
  const g = summarizeGames([
    m({ match_id: 3, stage_key: "final", stage_order: 9, match_date: "2022-12-18" }),
    m({ match_id: 1 }), m({ match_id: 2, match_date: "2022-11-25" }),
    m({ match_id: 4, league: "wwc", year: 2023, stage_key: "semi", stage_order: 7, match_date: "2023-08-01" }),
    m({ match_id: 5, year: 1994, match_date: "1994-06-20" }),
  ]);
  assert.deepEqual(g.editions.map((e) => [e.lg, e.year, e.matches.length]), [["wc", 1994, 1], ["wc", 2022, 3], ["wwc", 2023, 1]]);
  assert.deepEqual(g.editions[1].rounds.map((r) => [r.stage, r.matches]), [["group", 2], ["final", 1]]);
  assert.equal(g.editions[1].final?.match_id, 3);
  assert.equal(g.editions[0].final, null);
  assert.equal(g.mls, null);
  assert.deepEqual(g.editions[1].matches.map((x) => x.match_id), [1, 2, 3], "matches in date order");
});

test("MLS: the clubs that played at home with their years, finals apart (a neutral ground), playoffs counted", () => {
  const g = summarizeGames([
    m({ match_id: 10, league: "mls", year: 2001, stage_key: "regular", home_team_id: "C-x", home: "MetroStars", home_slug: "x", match_date: "2001-04-01" }),
    m({ match_id: 11, league: "mls", year: 2010, stage_key: "regular", home_team_id: "C-x", home: "Red Bulls", home_slug: "x", match_date: "2010-04-01" }),
    m({ match_id: 12, league: "mls", year: 2005, stage_key: "conference_semi", home_team_id: "C-y", home: "Y FC", home_slug: "y", match_date: "2005-10-01" }),
    m({ match_id: 13, league: "mls", year: 2003, stage_key: "final", home_team_id: "C-z", home: "Z FC", home_slug: "z", match_date: "2003-11-01" }),
  ]);
  assert.ok(g.mls);
  assert.deepEqual(g.mls.tenants.map((t) => [t.slug, t.name, t.from, t.to, t.matches]), [["x", "Red Bulls", 2001, 2010, 2], ["y", "Y FC", 2005, 2005, 1]]);
  assert.deepEqual(g.mls.finals.map((x) => x.match_id), [13]);
  assert.equal(g.mls.matches, 4);
  assert.equal(g.mls.playoffs, 2);
  assert.equal(g.mls.seasons, 4);
  assert.deepEqual(g.editions, []);
});

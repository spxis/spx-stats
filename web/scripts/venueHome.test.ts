import assert from "node:assert/strict";
import { test } from "node:test";
import { latestFinals, summarizeGames, type FinalGameRow, type GameSeasonRow } from "../src/lib/venueGames.ts";
import { futureLeagues, futureRows, springRows, type FutureRow, type LayerContext, type SpringRow } from "../src/lib/venueLayerRows.ts";
import { tenanciesOf, type PeriodRow } from "../src/lib/venueTenancy.ts";
import { queryVenues, readKinds, venueOrder, venueRecords, venuesCsv, RECORD_FIELDS, type VenueDetail, type VenueQuery } from "../src/lib/venueDataset.ts";
import { finishRow } from "../src/lib/venueWire.ts";

/** Run in web/: pnpm test:venues */

const period = (o: Partial<PeriodRow>): PeriodRow => ({ wikidata_id: "Q1", franchise_id: 1, league: "mlb", valid_from: "1977-04-07", valid_to: "1988-10-03", last_season: 2025, league_last: 2026, ...o });

test("a club's periods at a venue become one tenancy in whole years", () => {
  const t = tenanciesOf([
    period({}),
    period({ franchise_id: 2, league: "cfl", valid_from: "1959-01-01", valid_to: "1989-07-12" }),
    period({ franchise_id: 2, league: "cfl", valid_from: "1989-07-12", valid_to: "1989-08-01" }),
  ]);
  assert.deepEqual(t.get("Q1"), [{ lg: "cfl", f: 2, from: 1959, to: 1989 }, { lg: "mlb", f: 1, from: 1977, to: 1988 }]);
});

test("a period that ends on 1 January ended the year before, and a lower-case id is the same venue", () => {
  const t = tenanciesOf([period({ wikidata_id: "q9", valid_from: "1916-01-01", valid_to: "1958-01-01" })]);
  assert.deepEqual(t.get("Q9"), [{ lg: "mlb", f: 1, from: 1916, to: 1957 }]);
});

test("an open period is still open, unless the franchise stopped playing: then it ended in its last season", () => {
  const open = tenanciesOf([period({ valid_to: null })]);
  assert.equal(open.get("Q1")?.[0].to, null);
  const folded = tenanciesOf([period({ valid_to: null, last_season: 1995 })]);
  assert.equal(folded.get("Q1")?.[0].to, 1995);
  const lastYearPlayed = tenanciesOf([period({ valid_to: null, last_season: 2025 })]);
  assert.equal(lastYearPlayed.get("Q1")?.[0].to, null, "a club that played last season still plays there");
});

test("a club that left and came back is one tenancy from its first year to its last, and open if it is back", () => {
  const t = tenanciesOf([
    period({ valid_from: "1990-01-01", valid_to: "1995-06-01" }),
    period({ valid_from: "2001-04-01", valid_to: null }),
  ]);
  assert.deepEqual(t.get("Q1"), [{ lg: "mlb", f: 1, from: 1990, to: null }]);
});

const gs = (o: Partial<GameSeasonRow>): GameSeasonRow => ({ league: "mlb", year: 1977, games: 80, regular_games: 80, playoff_games: 0, final_games: 0, first_date: "1977-04-07", last_date: "1977-10-02", ...o });

test("games at a venue are totalled by league, with its seasons in order", () => {
  const g = summarizeGames([
    gs({ year: 1978, games: 81, regular_games: 81, first_date: "1978-04-14", last_date: "1978-09-24" }),
    gs({}),
    gs({ league: "cfl", year: 1978, games: 9, regular_games: 8, playoff_games: 1, final_games: 1, first_date: "1978-07-12", last_date: "1978-11-26" }),
  ], ["mlb", "cfl"]);
  assert.ok(g);
  assert.equal(g.games, 170);
  assert.equal(g.finals, 1);
  assert.equal(g.firstDate, "1977-04-07");
  assert.equal(g.lastDate, "1978-11-26");
  assert.deepEqual(g.leagues.map((l) => [l.league, l.games, l.regular, l.playoffs, l.finals]), [["mlb", 161, 161, 0, 0], ["cfl", 9, 8, 1, 1]]);
  assert.deepEqual(g.leagues[0].seasons, [{ year: 1977, games: 80 }, { year: 1978, games: 81 }]);
  assert.equal(summarizeGames([], []), null);
});

test("two rows of one season and league are one season", () => {
  const g = summarizeGames([gs({}), gs({ games: 2, regular_games: 2 })]);
  assert.deepEqual(g?.leagues[0].seasons, [{ year: 1977, games: 82 }]);
});

test("the latest finals come first, at most the number asked for", () => {
  const f = (id: number, date: string): FinalGameRow => ({ game_id: id, game_date: date, league: "mlb", year: 1990, round_label: null, home_franchise_id: 1, away_franchise_id: 2, home_score: 1, away_score: 0 });
  assert.deepEqual(latestFinals([f(1, "1990-10-01"), f(3, "1992-10-01"), f(2, "1991-10-01")], 2).map((x) => x.game_id), [3, 2]);
});

const ctx: LayerContext = {
  leagues: ["nhl", "nba", "mlb", "nfl"], href: (lg, f) => `/${lg}/team/t${f}`, logo: (f) => (f === 7 ? "https://example.test/logo.svg" : null), country: () => "US",
  say: ((key: string, vars?: Record<string, unknown>) => `${key}${vars ? JSON.stringify(vars) : ""}`) as unknown as LayerContext["say"],
};

const park = (o: Partial<SpringRow>): SpringRow => ({
  wikidata_id: "Q5", name: "Osceola County Stadium", league: "grapefruit", city: "Kissimmee", region: "US-FL", country_code: "US", latitude: 28.3, longitude: -81.4, opened_year: 1985,
  closed_year: 2000, capacity: 5100, wikipedia_title: "Osceola County Stadium", first_year: 1985, last_year: 2000, in_use: false,
  tenants: [{ franchise_id: 7, club: "Houston Astros", from: 1985, to: 2000 }], names: [], ...o,
});

test("a spring training park is a row with its tenants, years and league, and one with no coordinates is left out", () => {
  const { rows, detail } = springRows([park({}), park({ wikidata_id: "Q6", latitude: null, longitude: null })], ctx);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.deepEqual([r.kind, r.tag, r.place, r.current, r.from, r.to, r.slug], ["spring", "grapefruit", "Kissimmee, FL", false, 1985, 2000, ""]);
  assert.deepEqual(r.clubs.map((c) => [c.lg, c.f, c.href, c.logo]), [["mlb", 7, "/mlb/team/t7", "https://example.test/logo.svg"]]);
  assert.equal(r.wiki, "https://en.wikipedia.org/wiki/Osceola_County_Stadium");
  assert.equal(r.key, "geo:28.30000,-81.40000");
  assert.deepEqual(detail.get(r.id), { wid: "Q5", city: "Kissimmee", iso: "US-FL", names: [] });
});

test("a club the archive has no franchise for is listed by name with no page, and a club back at a park is one entry", () => {
  const { rows } = springRows([park({ in_use: true, last_year: null, tenants: [
    { franchise_id: null, club: "Old Club", from: 1960, to: 1965 }, { franchise_id: 7, club: "Houston Astros", from: 1985, to: 1990 }, { franchise_id: 7, club: "Houston Astros", from: 1995, to: null },
  ] })], ctx);
  assert.deepEqual(rows[0].clubs.map((c) => [c.f, c.name, c.href, c.from, c.to]), [[0, "Old Club", "", 1960, 1965], [7, "Houston Astros", "/mlb/team/t7", 1985, null]]);
  assert.equal(rows[0].current, true);
});

const venue = (o: Partial<FutureRow>): FutureRow => ({
  wikidata_id: "Q8", venue_key: "wikidata:Q8", name: "Nissan Stadium (2027)", status: "under_construction", planned_open_year: 2027, capacity: 60000, latitude: 36.17, longitude: -86.77, city: "Nashville",
  region: "US-TN", country_code: "US", replaces_venue_name: "Nissan Stadium", wikipedia_title: "Nissan Stadium (2027)", clubs: [{ club: "Tennessee Titans", league: "nfl", franchise_id: 9 }, { club: "Some Team", league: "mls", franchise_id: 4 }], ...o,
});

test("a future venue is a row with the year the source plans, no club playing there, and only clubs of leagues the list has", () => {
  const { rows } = futureRows([venue({}), venue({ venue_key: "x", clubs: [{ club: "Some Team", league: "mls", franchise_id: 4 }] }), venue({ venue_key: "y", latitude: null })], { ...ctx, leagues: ["nhl", "nfl"] });
  assert.equal(rows.length, 1, "no club of the list's leagues, or no coordinates: left out");
  const r = rows[0];
  finishRow(r, ["nhl", "nfl"]);
  assert.deepEqual([r.kind, r.tag, r.planned, r.current, r.from, r.to, r.leagues], ["future", "under_construction", 2027, false, 2027, null, ["nfl"]]);
  assert.deepEqual(r.clubs.map((c) => [c.lg, c.f, c.from, c.to]), [["nfl", 9, 2027, null]]);
  assert.ok(r.extra.some((e) => e.includes("venuesPage.replaces")));
});

test("every future venue with coordinates is a row, whatever the league of its clubs (the list's leagues include theirs)", () => {
  const list = [
    venue({}), venue({ venue_key: "b", clubs: [{ club: "Some Team", league: "mls", franchise_id: 4 }] }), venue({ venue_key: "c", clubs: [{ club: "Two Teams", league: "nba", franchise_id: 1 }, { club: "Two Teams", league: "nhl", franchise_id: 2 }] }),
    venue({ venue_key: "d", clubs: [{ club: "Nobody", league: "wnba", franchise_id: null }], latitude: null, longitude: null }),
  ];
  assert.deepEqual(futureLeagues(list).sort(), ["mls", "nba", "nfl", "nhl"], "a league with no coordinates does not count");
  const { rows } = futureRows(list, { ...ctx, leagues: futureLeagues(list) });
  assert.equal(rows.length, list.filter((v) => v.latitude != null && v.longitude != null).length);
  assert.deepEqual(rows.map((r) => r.clubs.length), [2, 1, 2]);
});

test("a future venue with no planned year keeps none", () => {
  const { rows } = futureRows([venue({ planned_open_year: null })], ctx);
  assert.equal(rows[0].planned, null);
  assert.equal(rows[0].from, null);
});

test("the dataset says what kind each record is, and the API can ask for one kind", () => {
  const { rows: s, detail: sd } = springRows([park({})], ctx);
  const { rows: f, detail: fd } = futureRows([venue({})], ctx);
  for (const r of [...s, ...f]) finishRow(r, ["nhl", "nfl", "mlb"]);
  const records = venueRecords([...s, ...f], new Map<string, VenueDetail>([...sd, ...fd]));
  assert.deepEqual(records.map((r) => [r.kind, r.status, r.spring_league, r.planned_open_year, r.games]), [["spring", null, "grapefruit", null, null], ["future", "under_construction", null, 2027, null]]);
  const csv = venuesCsv(records).split("\r\n");
  assert.equal(csv[0].split(",").slice(-7).join(","), "kind,status,spring_league,planned_open_year,games,wikipedia_fields,wikipedia_key");
  assert.ok(csv[1].endsWith(",spring,,grapefruit,,,,") && csv[2].endsWith(",future,under_construction,,2027,,,"));
  assert.ok((RECORD_FIELDS as readonly string[]).includes("kind"));
  const q = (kind?: VenueQuery["kind"]) => queryVenues(records, { kind, words: [], status: "all" }, { order: venueOrder([{ key: "name", dir: "asc" }]), sortText: "name.asc", fields: null, limit: 50, offset: 0, after: null });
  assert.equal(q().page.total, 2);
  assert.deepEqual(q(["future"]).data.map((r) => r.kind), ["future"]);
  assert.equal(q(["home"]).page.total, 0);
  assert.equal(q(["spring", "future"]).page.total, 2);
});

test("?kind= of the API: home when left out, a comma list or all when asked, a 400 naming kind otherwise", () => {
  assert.deepEqual(readKinds(undefined), { ok: true, kinds: ["home"] });
  assert.deepEqual(readKinds("all"), { ok: true, kinds: ["home", "spring", "future", "soccer"] });
  assert.deepEqual(readKinds("soccer,home"), { ok: true, kinds: ["home", "soccer"] });
  assert.deepEqual(readKinds("future"), { ok: true, kinds: ["future"] });
  assert.deepEqual(readKinds("future,home"), { ok: true, kinds: ["home", "future"] });
  for (const bad of ["stadium", "home,", "home,stadium", "home,home", "all,home", "ALL", ",", "home future"]) {
    const r = readKinds(bad);
    assert.equal(r.ok, false, bad);
  }
  const { rows: s } = springRows([park({})], ctx);
  const { rows: f } = futureRows([venue({})], ctx);
  const home = { ...s[0], id: "Q1", kind: "home" as const, tag: null };
  const detail = new Map<string, VenueDetail>([["Q1", { wid: "Q1", city: null, iso: null, names: [] }], [s[0].id, { wid: "Q5", city: null, iso: null, names: [] }], [f[0].id, { wid: "Q8", city: null, iso: null, names: [] }]]);
  for (const r of [home, ...s, ...f]) finishRow(r, ["nhl", "nfl", "mlb"]);
  const records = venueRecords([home, ...s, ...f], detail);
  const page = (kind: string | undefined) => {
    const k = readKinds(kind);
    assert.ok(k.ok);
    return queryVenues(records, { kind: k.kinds, words: [], status: "all" }, { order: venueOrder([{ key: "name", dir: "asc" }]), sortText: "name.asc", fields: ["kind"], limit: 50, offset: 0, after: null }).data.map((r) => r.kind);
  };
  assert.deepEqual(page(undefined), ["home"], "the default is home alone");
  assert.deepEqual(page("spring,future").sort(), ["future", "spring"]);
  assert.deepEqual(page("all").sort(), ["future", "home", "spring"]);
});

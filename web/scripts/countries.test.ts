import assert from "node:assert/strict";
import { test } from "node:test";
import { coolCards, decadeOf, rangeTally, rankCountries, shareSeries, stackSeries, tally, versus, withOther, type LeagueCount, type SeasonCount } from "../src/lib/countryModel.ts";
import { colorsOf, rampColor } from "../src/lib/countryRamp.ts";

/** Run in web/: pnpm test:countries */

test("tally puts the known countries best first and keeps the unknown apart", () => {
  const t = tally([["US", 5], ["CA", 5], ["ZZ", 3], ["JP", 1], ["US", 2]]);
  assert.deepEqual(t.list, [{ code: "US", n: 7 }, { code: "CA", n: 5 }, { code: "JP", n: 1 }]);
  assert.equal(t.unknown, 3);
  assert.equal(t.known, 13);
  assert.equal(t.total, 16);
});

test("withOther keeps the biggest and sums the rest", () => {
  const { top, other } = withOther([{ code: "A", n: 5 }, { code: "B", n: 4 }, { code: "C", n: 2 }, { code: "D", n: 1 }], 2);
  assert.deepEqual(top.map((c) => c.code), ["A", "B"]);
  assert.equal(other, 3);
});

const season = (league: string, year: number, rows: [string, number][]): SeasonCount[] => {
  const all = rows.reduce((a, [, n]) => a + n, 0), known = rows.filter(([c]) => c !== "ZZ").reduce((a, [, n]) => a + n, 0);
  return rows.map(([country, players]) => ({ league, year, country, players, season_players: all, season_known: known }));
};

test("a decade's share weighs its seasons by their rosters, and the unknown are left out of the base", () => {
  const rows = [...season("mlb", 1990, [["US", 90], ["DO", 10], ["ZZ", 50]]), ...season("mlb", 1991, [["US", 60], ["DO", 40]]), ...season("mlb", 2001, [["US", 50], ["DO", 50]])];
  const s = shareSeries(rows, "mlb", "DO", "decade");
  assert.deepEqual(s.map((p) => [p.x, p.n, p.of]), [[1990, 50, 200], [2000, 50, 100]]);
  assert.equal(s[0].share, 0.25);
  assert.equal(decadeOf(1999), 1990);
  const by = shareSeries(rows, "mlb", "DO", "season");
  assert.deepEqual(by.map((p) => p.x), [1990, 1991, 2001]);
  assert.deepEqual(shareSeries(rows, "nhl", "DO", "season"), []);
});

test("rangeTally adds seasons up inside the range only", () => {
  const rows = [...season("mlb", 1990, [["US", 9], ["DO", 1]]), ...season("mlb", 1991, [["US", 8], ["DO", 2]]), ...season("mlb", 1992, [["US", 5], ["DO", 5]])];
  const t = rangeTally(rows, "mlb", 1990, 1991);
  assert.deepEqual(t.list, [{ code: "US", n: 17 }, { code: "DO", n: 3 }]);
});

test("stackSeries separates the kept countries, the rest and the unknown", () => {
  const s = stackSeries([{ year: 2000, country: "US", players: 5 }, { year: 2000, country: "JP", players: 1 }, { year: 2001, country: "US", players: 4 }, { year: 2001, country: "ZZ", players: 2 }, { year: 2001, country: "CA", players: 3 }], ["US"]);
  assert.deepEqual(s.years, [2000, 2001]);
  assert.deepEqual(s.counts.US, [5, 4]);
  assert.deepEqual(s.other, [1, 3]);
  assert.deepEqual(s.unknown, [0, 2]);
});

test("the ranker adds the players' counting stats first, then works out the rates", () => {
  const bat = (ab: number, h: number) => ({ ab, h, bb: 0, hbp: 0, sf: 0, "2b": 0, "3b": 0, hr: 0, g: 100 });
  // two Dominican hitters (a regular and one with a handful of at-bats) pool to 150/500, not to the mean of .300 and .500
  const r = rankCountries("batting", [
    { code: "DO", players: 3, stats: { ab: 500, h: 150, bb: 0, hbp: 0, sf: 0, "2b": 0, "3b": 0, hr: 0, g: 130 } },
    { code: "US", players: 9, stats: { ab: 2000, h: 500, bb: 0, hbp: 0, sf: 0, "2b": 0, "3b": 0, hr: 0, g: 600 } },
    { code: "MX", players: 2, stats: bat(900, 400) },
    { code: "JP", players: 5, stats: bat(100, 40) },
    { code: "ZZ", players: 9, stats: bat(900, 300) },
  ]);
  assert.deepEqual(r.rows.map((x) => x.code).sort(), ["DO", "US"], "MX has two players, JP too few at-bats, ZZ is not a country");
  assert.equal(r.rows.find((x) => x.code === "DO")!.values.avg, 0.3);
  assert.equal(r.best.avg, "DO");
  assert.deepEqual(r.small, { countries: 2, players: 7 });
});

test("a lower figure is the better one for ERA", () => {
  const p = (er: number, ipouts: number) => ({ er, ipouts, bb: 0, h: 0, so: 0 });
  const r = rankCountries("pitching", [{ code: "US", players: 5, stats: p(100, 900) }, { code: "DO", players: 4, stats: p(60, 900) }]);
  assert.equal(r.best.era, "DO");
  assert.equal(r.rows[0].code, "DO", "ranked by ERA, lowest first");
});

const lc = (league: string, country: string, players: number, first_year: number, league_players: number, league_known: number): LeagueCount =>
  ({ league, country, players, first_year, last_year: 2025, first_person_id: 1, first_name: "X", league_players, league_known });

test("league against league: players by country and the share of the known", () => {
  const rows = [lc("mlb", "US", 80, 1871, 100, 100), lc("mlb", "DO", 20, 1956, 100, 100), lc("nhl", "CA", 50, 1917, 100, 60), lc("nhl", "US", 10, 1920, 100, 60), lc("nhl", "ZZ", 40, 1917, 100, 60)];
  const v = versus(rows);
  assert.deepEqual(v.map((x) => x.code), ["US", "CA", "DO"]);
  assert.equal(v[0].total, 90);
  assert.equal(v[1].byLeague.nhl.share, 50 / 60);
});

test("the cards name only what the numbers support", () => {
  // two leagues with their countries known, one with a tenth known, one with a handful of players
  const league = [
    lc("mlb", "US", 8000, 1871, 10000, 10000), lc("mlb", "DO", 1, 1956, 10000, 10000), lc("mlb", "JP", 1, 1964, 10000, 10000), lc("mlb", "PE", 1, 2019, 10000, 10000),
    lc("nfl", "US", 800, 1930, 1000, 1000), lc("nfl", "CA", 200, 1950, 1000, 1000),
    lc("nhl", "CA", 600, 1917, 10000, 1000), lc("nba", "FR", 1, 2001, 80, 80),
  ];
  const season = Array.from({ length: 3 }, (_, i) => ({ league: "mlb", year: 1950 + 10 * i, country: "US", players: 10, season_players: 10, season_known: 10 }));
  const cards = coolCards(season, league);
  const ids = cards.map((c) => c.id);
  assert.ok(ids.includes("mostCountries") && ids.includes("single") && ids.includes("newest") && ids.includes("mixed"));
  assert.ok(cards.every((c) => c.league === "mlb" || c.league === "nfl"), "the NHL (a tenth known) and the NBA (a handful of players) are left out");
  assert.equal(cards.find((c) => c.id === "newest")!.country, "PE");
  assert.ok(!coolCards(season, league.filter((r) => r.league === "mlb")).some((c) => c.id === "mixed"), "one league is not the most mixed of anything");
});

test("the map ramp darkens with the count and leaves a zero out", () => {
  assert.equal(rampColor(0, 100), rampColor(0, 100));
  assert.notEqual(rampColor(1, 100), rampColor(100, 100));
  assert.deepEqual(Object.keys(colorsOf({ US: 10, CA: 0, JP: 2 })).sort(), ["JP", "US"]);
});

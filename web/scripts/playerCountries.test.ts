import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { LeagueCount } from "../src/lib/countryModel.ts";
import { against, chipSplit, countryArgs, coverage, fromLeagueRows, fromRows, isPlainLeague, referenceOf, slicesOf } from "../src/lib/playerCountryModel.ts";

/** Run in web/: pnpm test:playercountries. The country section of /players: the query it sends, the counts it shapes, the chips, the donut slices and the bars. */

const lc = (league: string, country: string, players: number, known: number, all: number): LeagueCount =>
  ({ league, country, players, first_year: 1950, last_year: 2020, first_person_id: null, first_name: null, league_players: all, league_known: known });

test("the call names only the choices made, and the letter and words are cleaned", () => {
  assert.equal(countryArgs({}), "p_by=last");
  assert.equal(countryArgs({ league: "nhl", from: 2000, to: 2010, letter: "S", letterBy: "first", words: ["ab", "cd"], position: "C" }),
    "p_by=first&p_league=nhl&p_letter=s&p_position=C&p_from=2000&p_to=2010&p_q=ab%20cd");
  assert.equal(countryArgs({ league: "xyz", letter: "ss", words: [] }), "p_by=last", "a league that is not one and a letter that is not one are left out");
});

test("a league on its own can be answered from the all-time views; any other choice cannot", () => {
  assert.ok(isPlainLeague({}));
  assert.ok(isPlainLeague({ league: "nba" }));
  for (const f of [{ from: 2000 }, { to: 2000 }, { letter: "a" }, { position: "G" }, { words: ["x"] }]) assert.ok(!isPlainLeague(f), JSON.stringify(f));
});

test("rows from the function give the known countries best first (ties by code) and the unknown ones apart", () => {
  const t = fromRows([{ country: "SE", n: 5 }, { country: "CA", n: 5 }, { country: "ZZ", n: 3 }, { country: null, n: 2 }, { country: "US", n: 9 }]);
  assert.deepEqual(t.list.map((c) => c.code), ["US", "CA", "SE"]);
  assert.equal(t.unknown, 5);
  assert.equal(t.known, 19);
  assert.equal(t.total, 24);
});

test("the league views add up one league, or all of them, and count the players with no country from the league's own totals", () => {
  const rows = [lc("nhl", "CA", 100, 150, 160), lc("nhl", "US", 50, 150, 160), lc("nba", "US", 30, 28, 30), lc("nhl", "ZZ", 10, 150, 160)];
  const nhl = fromLeagueRows(rows, "nhl");
  assert.deepEqual(nhl.list, [{ code: "CA", n: 100 }, { code: "US", n: 50 }]);
  assert.equal(nhl.unknown, 10);
  const all = fromLeagueRows(rows);
  assert.equal(all.list.find((c) => c.code === "US")!.n, 80);
  assert.equal(all.unknown, 12, "10 in the NHL and 2 in the NBA");
  assert.equal(fromLeagueRows(rows, "mlb").total, 0);
});

test("coverage: nothing under a tenth known, a note under half", () => {
  const t = (known: number, unknown: number) => fromRows([{ country: "US", n: known }, { country: "ZZ", n: unknown }]);
  assert.equal(coverage(t(0, 0)), "none");
  assert.equal(coverage(t(5, 95)), "none");
  assert.equal(coverage(t(30, 70)), "low");
  assert.equal(coverage(t(50, 50)), "ok");
  assert.equal(coverage(t(990, 10)), "ok");
});

test("chips: the biggest countries, the chosen one kept in view, the rest for the more list", () => {
  const list = Array.from({ length: 12 }, (_, i) => ({ code: String.fromCharCode(65 + i) + "X", n: 100 - i }));
  const plain = chipSplit(list, "", 8);
  assert.equal(plain.shown.length, 8);
  assert.equal(plain.more.length, 4);
  assert.deepEqual(plain.shown.map((c) => c.code), list.slice(0, 8).map((c) => c.code));
  const small = chipSplit(list, "KX", 8);
  assert.equal(small.shown.length, 8);
  assert.equal(small.shown.at(-1)!.code, "KX");
  assert.ok(!small.more.some((c) => c.code === "KX"));
  assert.equal(small.shown.length + small.more.length, 12);
  const big = chipSplit(list, "BX", 8);
  assert.deepEqual(big.shown, plain.shown, "a chosen country already shown changes nothing");
  assert.deepEqual(chipSplit(list, "ZZZ", 8).shown, plain.shown, "a country with no players is not added");
  assert.deepEqual(chipSplit(list.slice(0, 3), "", 8), { shown: list.slice(0, 3), more: [] });
});

test("the donut: six countries, the others together, the unknown last", () => {
  const rows = Array.from({ length: 9 }, (_, i) => ({ country: `C${i}`, n: 90 - i })).concat([{ country: "ZZ", n: 4 }]);
  const slices = slicesOf(fromRows(rows));
  assert.equal(slices.length, 8);
  assert.deepEqual(slices.slice(0, 6).map((s) => s.slot), [0, 1, 2, 3, 4, 5]);
  assert.equal(slices[6].kind, "other");
  assert.equal(slices[6].n, 90 - 6 + 90 - 7 + 90 - 8);
  assert.equal(slices[7].kind, "unknown");
  assert.equal(slices.reduce((a, s) => a + s.n, 0), fromRows(rows).total);
  assert.deepEqual(slicesOf(fromRows([{ country: "US", n: 3 }])), [{ code: "US", n: 3, slot: 0 }]);
});

test("the bars: the list's share of the known against the reference's, for its biggest countries", () => {
  const mine = fromRows([{ country: "CA", n: 60 }, { country: "US", n: 30 }, { country: "SE", n: 10 }, { country: "ZZ", n: 50 }]);
  const ref = fromRows([{ country: "US", n: 200 }, { country: "CA", n: 100 }, { country: "FI", n: 100 }]);
  const bars = against(mine, ref, 2);
  assert.deepEqual(bars.map((b) => b.code), ["CA", "US"]);
  assert.equal(bars[0].mine, 0.6);
  assert.equal(bars[0].theirs, 0.25);
  assert.equal(bars[1].theirs, 0.5);
  assert.equal(against(mine, ref).find((b) => b.code === "SE")!.theirs, 0, "a country the reference lacks is zero");
  assert.deepEqual(against(mine, fromRows([])), []);
  assert.deepEqual(against(fromRows([]), ref), []);
});

test("the bars are set against all the leagues for one league's history, and against the league's history once years narrow it", () => {
  assert.equal(referenceOf({}), null);
  assert.equal(referenceOf({ league: "nhl" }), "leagues");
  assert.equal(referenceOf({ league: "nhl", letter: "a" }), "leagues");
  assert.equal(referenceOf({ league: "nhl", from: 2000, to: 2010 }), "league");
  assert.equal(referenceOf({ league: "nope" }), null);
});

test("migration 096 counts the way the letter row does", () => {
  const sql = readFileSync(new URL("../../db/migrations/096_player_countries.sql", import.meta.url), "utf8");
  const letters = readFileSync(new URL("../../db/migrations/091_player_letters.sql", import.meta.url), "utf8");
  for (const piece of [
    "regexp_replace(regexp_replace(s.search, '( (jr|sr|ii|iii|iv))+$', ''), '^.* ', '')",
    "(p_league is null or s.leagues @> array[p_league])",
    "(p_position is null or s.position ilike p_position or s.positions @> array[p_position])",
    "(p_to is null or s.first_season <= p_to)",
    "(p_from is null or s.last_season >= p_from)",
    "s.search !~ '^(jr|sr|ii|iii|iv)( (jr|sr|ii|iii|iv))*$'",
  ]) {
    assert.ok(sql.includes(piece), piece);
    assert.ok(letters.includes(piece), piece);
  }
  assert.match(sql, /grant execute on function api\.player_countries\(text, integer, integer, text, text, text, text\) to anon, authenticated/);
});

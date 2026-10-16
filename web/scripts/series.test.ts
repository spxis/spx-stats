import assert from "node:assert/strict";
import { test } from "node:test";
import { bestOfIn, roundKeys, winsNeeded } from "../src/lib/playoffFormat.ts";
import { buildSeries, deriveSeries, describeRounds, planRounds, type PlayoffGame } from "../src/lib/series.ts";

/** Run in web/: pnpm test:series */

let nextId = 1;
const day = (start: string, n: number) => new Date(Date.parse(`${start}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The games of one series between franchise `a` and franchise `b`, one letter each, a day apart from `start`:
 * W = `a` won, L = `b` won, s = still to be played (scheduled), x = cancelled.
 */
function games(a: number, b: number, letters: string, start = "2026-10-11"): PlayoffGame[] {
  return [...letters].map((c, i) => {
    const aHome = i % 2 === 0;
    const fin = c === "W" || c === "L";
    const aWon = c === "W";
    const winnerScore = 5, loserScore = 2;
    const aScore = fin ? (aWon ? winnerScore : loserScore) : null, bScore = fin ? (aWon ? loserScore : winnerScore) : null;
    return {
      game_id: nextId++, game_date: day(start, i), status: fin ? "final" : c === "x" ? "cancelled" : "scheduled",
      away_id: aHome ? b : a, away: aHome ? `Team ${b}` : `Team ${a}`, away_score: aHome ? bScore : aScore,
      home_id: aHome ? a : b, home: aHome ? `Team ${a}` : `Team ${b}`, home_score: aHome ? aScore : bScore,
      overtime: false, source: "test", away_f: aHome ? b : a, home_f: aHome ? a : b, checked: null,
    } as PlayoffGame;
  });
}
const build = (letters: string, opts: { bestOf?: number } = {}) => buildSeries("mlb", 2026, games(1, 2, letters), 1, opts)!;

test("the bug: 2-0 with five games to come is in progress, not won, and nobody is out", () => {
  const s = build("WWsssss");
  assert.equal(s.live, true);
  assert.equal(s.winner, null);
  assert.equal(s.basis, null);
  assert.equal(s.bestOf, 7);
  assert.equal(s.needed, 4);
  assert.equal(s.remaining, 5);
  assert.equal(s.next, "2026-10-13");
  assert.deepEqual([s.sides[0].wins, s.sides[1].wins], [2, 0]);
  assert.equal(s.sides[0].f, 1, "the side ahead is first");
  assert.equal(s.games.length, 7);
  assert.deepEqual(s.games.map((g) => g.played), [true, true, false, false, false, false, false]);
});

test("games not yet needed are marked 'if necessary': at 2-0 in a best of 7, games 5 to 7", () => {
  const s = build("WWsssss");
  assert.deepEqual(s.games.map((g) => g.ifNeeded), [false, false, false, false, true, true, true]);
  // The tiles after the last played game carry the series score as it stands.
  assert.deepEqual(s.games.slice(2).map((g) => g.run), [[2, 0], [2, 0], [2, 0], [2, 0], [2, 0]]);
  // 3-2 in a best of 7: game 6 could be the last, game 7 is only if necessary.
  const t = build("WLWLWss");
  assert.deepEqual(t.games.slice(5).map((g) => g.ifNeeded), [false, true]);
});

test("the side ahead is listed first, and a level series keeps the franchise order", () => {
  assert.equal(build("LLsssss").sides[0].f, 2);
  const level = build("WLssss" + "s");
  assert.equal(level.live, true);
  assert.equal(level.sides[0].f, 1);
  assert.deepEqual([level.sides[0].wins, level.sides[1].wins], [1, 1]);
});

test("a sweep is decided at 4-0 and the unplayed games left in the data are dropped", () => {
  const s = build("WWWWss");
  assert.equal(s.live, false);
  assert.equal(s.winner, 0);
  assert.equal(s.basis, "wins");
  assert.equal(s.sides[1].wins, 0);
  assert.equal(s.games.length, 4);
  assert.equal(s.remaining, 0);
  assert.equal(s.next, null);
});

test("a series won in seven", () => {
  const s = build("WLWLLWW");
  assert.equal(s.live, false);
  assert.equal(s.winner, 0);
  assert.deepEqual([s.sides[0].wins, s.sides[1].wins], [4, 3]);
  assert.equal(s.games.length, 7);
  // The winner is first even when it was the franchise with the higher id.
  const t = buildSeries("mlb", 2026, games(1, 2, "LLWLWWL"), 1)!;
  assert.equal(t.winner, 0);
  assert.equal(t.sides[0].f, 2);
});

test("best of 5: 2-1 is open, 3-1 is decided", () => {
  const open = build("WLWss", { bestOf: 5 });
  assert.equal(open.live, true);
  assert.equal(open.needed, 3);
  assert.deepEqual(open.games.map((g) => g.ifNeeded), [false, false, false, false, true]);
  const done = build("WLWWs", { bestOf: 5 });
  assert.equal(done.live, false);
  assert.equal(done.winner, 0);
  assert.equal(done.games.length, 4);
});

test("best of 3: 1-0 is open, 2-0 is decided", () => {
  const open = build("Wss", { bestOf: 3 });
  assert.equal(open.live, true);
  assert.equal(open.needed, 2);
  assert.equal(open.games[2].ifNeeded, true);
  assert.equal(open.games[1].ifNeeded, false);
  const done = build("WWs", { bestOf: 3 });
  assert.equal(done.live, false);
  assert.equal(done.winner, 0);
  assert.equal(done.games.length, 2);
});

test("the format is read off the games when the round's format is unknown", () => {
  // 2 played and 2 to come: four games listed, so best of 5 (three wins settle it).
  const s = build("WWss");
  assert.equal(s.bestOf, 5);
  assert.equal(s.needed, 3);
  assert.equal(s.live, true);
  assert.equal(build("WWWs").live, false);
  // One game listed: a single game, best of 1.
  assert.equal(build("W").bestOf, 1);
});

test("a series whose remaining games were cancelled is decided by the wins it has", () => {
  const s = build("WWLxx", { bestOf: 7 });
  assert.equal(s.live, false);
  assert.equal(s.winner, 0);
  assert.deepEqual([s.sides[0].wins, s.sides[1].wins], [2, 1]);
  assert.equal(s.games.length, 3);
  assert.equal(s.remaining, 0);
});

test("a game scheduled long before the season's latest result was never played, and does not keep a series open", () => {
  const old = games(1, 2, "WWWLs", "2026-09-20");
  const later = games(3, 4, "WLW", "2026-10-11");
  const s = deriveSeries("mlb", 2026, [...old, ...later]).find((x) => x.sides.some((t) => t.f === 1))!;
  assert.equal(s.live, false);
  assert.equal(s.winner, 0);
  assert.equal(s.games.length, 4);
});

test("a season: a round with a known format settles by it, so a 2-0 lead in the league championship series is still open", () => {
  // MLB 2026, eight clubs: wild card series (1 beat 2, 3 beat 4), division series (1 v 5, 3 v 6), then the league championship series 1 v 3.
  const all = [
    ...games(1, 2, "WW", "2026-09-29"), ...games(3, 4, "WW", "2026-09-29"),
    ...games(1, 5, "WLWLW", "2026-10-03"), ...games(3, 6, "WWW", "2026-10-03"),
    ...games(1, 3, "WWs", "2026-10-11"),
  ];
  const list = deriveSeries("mlb", 2026, all);
  const lcs = list.find((s) => s.sides.some((t) => t.f === 1) && s.sides.some((t) => t.f === 3))!;
  assert.equal(lcs.live, true, "read off its three games it would look like a best of 3 and be over");
  assert.equal(lcs.bestOf, 7);
  assert.equal(lcs.winner, null);
  // The division series 1 v 5 went 3-2 in a best of 5 and is decided.
  const ds = list.find((s) => s.sides.some((t) => t.f === 5))!;
  assert.equal(ds.live, false);
  assert.equal(ds.winner, 0);
  assert.equal(ds.bestOf, 5);
});

test("rounds are named from the league's format, by year and number of rounds", () => {
  assert.deepEqual(roundKeys("mlb", 2026, 4, true, false), ["wcSeries", "ds", "lcs", "final"]);
  assert.deepEqual(roundKeys("mlb", 2026, 3, false, true), ["wcSeries", "ds", "lcs"], "an unfinished season takes the first rounds of the format");
  assert.deepEqual(roundKeys("mlb", 2019, 4, true, false), ["wcGame", "ds", "lcs", "final"]);
  assert.deepEqual(roundKeys("mlb", 2005, 3, true, false), ["ds", "lcs", "final"]);
  assert.deepEqual(roundKeys("nhl", 2025, 4, true, false), ["first", "second", "confFinal", "final"]);
  assert.deepEqual(roundKeys("nhl", 2005, 4, true, false), ["confQuarters", "confSemis", "confFinal", "final"]);
  assert.deepEqual(roundKeys("nba", 2025, 4, true, false), ["first", "confSemis", "confFinals", "final"]);
  assert.deepEqual(roundKeys("wnba", 2024, 3, true, false), ["first", "semis", "final"]);
  assert.deepEqual(roundKeys("wnba", 1997, 2, true, false), ["semis", "final"]);
  assert.equal(bestOfIn("wnba", 2024, "final"), 5);
  assert.equal(bestOfIn("wnba", 1997, "final"), 3);
  assert.deepEqual(roundKeys("nfl", 2025, 4, true, false), ["wildcard", "divisional", "confChamp", "final"]);
  assert.deepEqual(roundKeys("cfl", 2025, 3, true, false), ["cflSemi", "cflFinal", "final"]);
  assert.equal(roundKeys("nhl", 2025, 5, true, false), null, "a season that matches no row keeps the generic names");
  assert.equal(roundKeys("mlb", 2026, 3, false, false), null, "a finished season whose last round has several series is not matched");
});

test("the formats: games a series is played to", () => {
  assert.equal(bestOfIn("mlb", 2026, "wcSeries"), 3);
  assert.equal(bestOfIn("mlb", 2026, "ds"), 5);
  assert.equal(bestOfIn("mlb", 2026, "lcs"), 7);
  assert.equal(bestOfIn("mlb", 1980, "lcs"), 5);
  assert.equal(bestOfIn("mlb", 2026, "final"), 7);
  assert.equal(bestOfIn("nhl", 2025, "first"), 7);
  assert.equal(bestOfIn("nba", 1990, "first"), 5);
  assert.equal(bestOfIn("nfl", 2025, "final"), 1);
  assert.equal(bestOfIn("nba", 1970, "divSemis"), null);
  assert.equal(winsNeeded(7), 4);
  assert.equal(winsNeeded(5), 3);
  assert.equal(winsNeeded(3), 2);
  assert.equal(winsNeeded(1), 1);
});

/** The word each round name is made of, standing in for the English. */
const say = (key: string, vars?: Record<string, unknown>) => (vars?.n != null ? `Round ${vars.n}` : vars?.numeral != null ? `Super Bowl ${vars.numeral}` : key);

test("a season names its rounds and has no final until the league's last round is under way", () => {
  const all = [
    ...games(1, 2, "WW", "2026-09-29"), ...games(3, 4, "WW", "2026-09-29"),
    ...games(1, 5, "WLWLW", "2026-10-03"), ...games(3, 6, "WWW", "2026-10-03"),
    ...games(1, 3, "WWsssss", "2026-10-11"),
  ];
  const list = deriveSeries("mlb", 2026, all);
  const plan = planRounds("mlb", 2026, list);
  assert.deepEqual(plan.keys, ["wcSeries", "ds", "lcs"]);
  assert.equal(plan.final, 0, "the league championship series is not the last round of the format");
  assert.deepEqual(describeRounds("mlb", 2026, list, say as never).names, ["round.wcSeries", "round.ds", "round.lcs"]);
});

test("a finished season: the last round's one series is the final", () => {
  const all = [
    ...games(1, 2, "WW", "2026-09-29"), ...games(3, 4, "WW", "2026-09-29"),
    ...games(1, 5, "WWW", "2026-10-03"), ...games(3, 6, "WWW", "2026-10-03"),
    ...games(1, 3, "WWWW", "2026-10-11"),
    ...games(1, 9, "WWWW", "2026-10-20"),
  ];
  // Team 9 has no earlier series: it plays the World Series with a bye; team 1 has played three rounds.
  const list = deriveSeries("mlb", 2026, all);
  const names = describeRounds("mlb", 2026, list, say as never);
  assert.equal(names.names.at(-1), "final.mlb");
  assert.equal(names.final, names.names.length);
  assert.ok(list.every((s) => !s.live));
});

test("an open final is still the final, but has no winner", () => {
  const all = [
    ...games(1, 2, "WW", "2026-09-29"), ...games(3, 4, "WW", "2026-09-29"),
    ...games(1, 5, "WWW", "2026-10-03"), ...games(3, 6, "WWW", "2026-10-03"),
    ...games(1, 3, "WWWW", "2026-10-11"),
    ...games(1, 9, "WWsssss", "2026-10-20"),
  ];
  const list = deriveSeries("mlb", 2026, all);
  const plan = planRounds("mlb", 2026, list);
  assert.equal(plan.final, plan.round.length ? Math.max(...plan.round) : 0);
  const last = list.find((s) => s.sides.some((t) => t.f === 9))!;
  assert.equal(last.live, true);
  assert.equal(last.winner, null);
});

test("a season's earlier finished years keep their generic names when the format does not fit", () => {
  const all = [...games(1, 2, "WWWW", "2000-05-01"), ...games(1, 3, "WWWW", "2000-05-20")];
  const list = deriveSeries("nhl", 2000, all);
  const names = describeRounds("nhl", 2000, list, say as never).names;
  assert.deepEqual(names, ["round.semis", "final.nhl"]);
});

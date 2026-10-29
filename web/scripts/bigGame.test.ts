import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameRow } from "../src/lib/api/types.ts";
import { labelBigGame, seriesBigGames } from "../src/lib/bigGame.ts";

/** Run in web/: pnpm test:biggame */

let nextId = 100;
const name = (f: number) => (f === 1 ? "Milwaukee Brewers" : f === 2 ? "Tampa Bay Rays" : `Club ${f}`);
const day = (start: string, n: number) => new Date(Date.parse(`${start}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** One series between franchise 1 and 2, a day apart: W = franchise 1 won, L = franchise 2 won, s = still to be played. Franchise 1 is home in game 1. */
function series(letters: string, start = "2026-10-23", a = 1, b = 2): GameRow[] {
  return [...letters].map((c, i) => {
    const aHome = i % 2 === 0, fin = c === "W" || c === "L", aWon = c === "W";
    const aScore = fin ? (aWon ? 5 : 2) : null, bScore = fin ? (aWon ? 2 : 5) : null;
    return {
      league: "mlb", year: 2026, game_id: nextId++, game_date: day(start, i), phase: "playoffs", status: fin ? "final" : "scheduled",
      away_id: aHome ? b : a, away: name(aHome ? b : a), away_score: aHome ? bScore : aScore,
      home_id: aHome ? a : b, home: name(aHome ? a : b), home_score: aHome ? aScore : bScore,
      overtime: false, source: "test", checked: null, away_f: aHome ? b : a, home_f: aHome ? a : b,
    } as GameRow;
  });
}
const say = (key: string, vars?: Record<string, string | number>) => (key === "final.mlb" ? "World Series" : key).replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k]));
const big = (games: GameRow[]) => seriesBigGames("mlb", 2026, games, say as never, "Round robin", "Postseason");

test("a decided final names the round, the game and the series, and gives each club its wins", () => {
  const games = series("WWLWW");
  const m = big(games);
  const last = m.get(games[4].game_id)!;
  assert.equal(last.round, "World Series");
  assert.equal(last.final, true);
  assert.equal(last.n, 5);
  assert.deepEqual(last.series, { kind: "wins", a: 4, b: 1, lead: { f: 1, name: "Brewers" } });
  // Game 5: Brewers (franchise 1) are home, so the away club (Rays) has 1 win and the home club 4.
  assert.deepEqual(last.wins, [1, 4]);
});

test("a game in the middle is a lead, a level series is tied, and the game before it stands alone", () => {
  const games = series("WWLLsss");
  const m = big(games);
  assert.deepEqual(m.get(games[0].game_id)!.series, { kind: "leads", a: 1, b: 0, lead: { f: 1, name: "Brewers" } });
  assert.deepEqual(m.get(games[3].game_id)!.series, { kind: "tied", a: 2, b: 2, lead: null });
  assert.equal(m.get(games[3].game_id)!.n, 4);
});

test("a series decided with fewer wins than it takes is missing games: only the round is named", () => {
  // Three rounds before it, then a World Series (best of 7) the archive holds as 3-0 and nothing more, with no game left to come.
  const rounds = [[1, 5, "WW"], [2, 6, "WW"], [1, 7, "WWW"], [2, 8, "WWW"], [1, 9, "WWWW"], [2, 10, "WWWW"]] as const;
  const before = rounds.flatMap(([a, b, l], i) => series(l, day("2026-09-01", i * 6), a, b));
  const final = series("WWW", "2026-10-23");
  const only = big([...before, ...final]).get(final[2].game_id)!;
  assert.equal(only.n, null);
  assert.equal(only.series, null);
  assert.equal(only.wins, null);
  assert.equal(only.round, "World Series");
});

test("college football names its games from their labels", () => {
  assert.deepEqual(labelBigGame("playoffs", "College Football Playoff National Championship", "Bowl game"), { round: "College Football Playoff National Championship", final: true, n: null, tag: null, series: null, wins: null });
  assert.deepEqual(labelBigGame("playoffs", "Peach Bowl (CFP Semifinal)", "Bowl game"), { round: "Peach Bowl", final: false, n: null, tag: "Semifinal", series: null, wins: null });
  assert.equal(labelBigGame("playoffs", "Arizona Bowl", "Bowl game")?.round, "Arizona Bowl");
  assert.equal(labelBigGame("playoffs", null, "Bowl game")?.round, "Bowl game");
  assert.equal(labelBigGame("regular", "SEC Championship Game", "Bowl game")?.final, false);
  assert.equal(labelBigGame("regular", null, "Bowl game"), null);
  assert.equal(labelBigGame("regular", "Week 4", "Bowl game"), null);
});

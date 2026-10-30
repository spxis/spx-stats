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
  assert.deepEqual(labelBigGame("playoffs", "College Football Playoff National Championship", "Bowl game"), { round: "College Football Playoff National Championship", final: true, decides: true, n: null, tag: null, series: null, wins: null });
  assert.deepEqual(labelBigGame("playoffs", "Peach Bowl (CFP Semifinal)", "Bowl game"), { round: "Peach Bowl", final: false, decides: false, n: null, tag: "Semifinal", series: null, wins: null });
  assert.equal(labelBigGame("playoffs", "Arizona Bowl", "Bowl game")?.round, "Arizona Bowl");
  assert.equal(labelBigGame("playoffs", null, "Bowl game")?.round, "Bowl game");
  assert.equal(labelBigGame("regular", "SEC Championship Game", "Bowl game")?.final, false);
  assert.equal(labelBigGame("regular", null, "Bowl game"), null);
  assert.equal(labelBigGame("regular", "Week 4", "Bowl game"), null);
});

/** A World Series after the three rounds before it (the archive reads a lone series as a first round), and the flags of its games. */
function finalFlags(letters: string): (boolean | undefined)[] {
  const rounds = [[1, 5, "WW"], [2, 6, "WW"], [1, 7, "WWW"], [2, 8, "WWW"], [1, 9, "WWWW"], [2, 10, "WWWW"]] as const;
  const before = rounds.flatMap(([a, b, l], i) => series(l, day("2026-09-01", i * 6), a, b));
  const final = series(letters, "2026-10-23");
  const m = big([...before, ...final]);
  return final.map((g) => m.get(g.game_id)?.decides);
}

test("the game that decides the title is the clinching game or game 7 of the last round, and never an earlier round", () => {
  // Game 7 is the winner-take-all game; no game before it clinches.
  assert.deepEqual(finalFlags("WLWLWLW"), [false, false, false, false, false, false, true]);
  assert.deepEqual(finalFlags("WWWW"), [false, false, false, true]);
  assert.deepEqual(finalFlags("WLWWW"), [false, false, false, false, true]);
});

test("a game of an earlier round never decides the title", () => {
  const rounds = [[1, 5, "WW"], [2, 6, "WW"], [1, 7, "WWW"], [2, 8, "WWW"], [1, 9, "WWWW"], [2, 10, "WWWW"]] as const;
  const before = rounds.flatMap(([a, b, l], i) => series(l, day("2026-09-01", i * 6), a, b));
  const m = big([...before, ...series("WWWW", "2026-10-23")]);
  assert.ok(before.every((g) => m.get(g.game_id)!.decides === false));
});

test("a series with too few games on record never claims a decider", () => {
  assert.ok(finalFlags("WLWLWL").every((d) => d !== true));
});

/** A 16-club NBA bracket (clubs 1 to 16, the lower number always wins) after the games of every round, with the games of the conference finals and the Finals marked. */
function nbaBracket(year: number, lg = "nba", letters = "WWWW") {
  const games: GameRow[] = [];
  const round = (pairs: [number, number][], start: string) => pairs.map(([a, b]) => {
    const g = series(letters, start, a, b).map((x) => ({ ...x, league: lg, year }) as GameRow);
    games.push(...g);
    return g;
  });
  round([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16]], "2023-04-16");
  round([[1, 3], [5, 7], [9, 11], [13, 15]], "2023-05-01");
  const conf = round([[1, 5], [9, 13]], "2023-05-16");
  const finals = round([[1, 9]], "2023-06-01");
  return { games, conf, finals };
}

test("a conference final is told apart from the Finals and carries its conference, and the Finals never do", () => {
  const { games, conf, finals } = nbaBracket(2023);
  const west = (f: number | null) => (f != null && f <= 8 ? "west" : "east" as const);
  const m = seriesBigGames("nba", 2023, games, say as never, "Round robin", "Postseason", west);
  assert.equal(m.get(conf[0][1].game_id)!.conf?.side, "west");
  assert.equal(m.get(conf[1][1].game_id)!.conf?.side, "east");
  assert.equal(m.get(conf[0][3].game_id)!.final, false);
  assert.equal(m.get(conf[0][3].game_id)!.decides, false, "a conference final has no deciding game of its own");
  assert.equal(m.get(finals[0][3].game_id)!.final, true);
  assert.equal(m.get(finals[0][3].game_id)!.conf, undefined);
  // The semifinals and the first round are not conference finals.
  assert.equal(m.get(games[0].game_id)!.conf, undefined);
  // Without a conference lookup the round is still a conference final, side unknown.
  assert.deepEqual(seriesBigGames("nba", 2023, games, say as never, "Round robin", "Postseason").get(conf[0][0].game_id)!.conf, { side: null });
});

test("only the NBA, the NFL and the NHL have a conference trophy to draw", () => {
  const { games, conf } = nbaBracket(2023, "wnba");
  assert.equal(seriesBigGames("wnba", 2023, games, say as never, "Round robin", "Postseason", () => "west").get(conf[0][0].game_id)!.conf, undefined);
});

test("the NHL's Conference Final carries its conference, and the Stanley Cup Final never does", () => {
  const { games, conf, finals } = nbaBracket(2023, "nhl");
  const m = seriesBigGames("nhl", 2023, games, say as never, "Round robin", "Postseason", (f) => (f != null && f <= 8 ? "west" : "east"));
  assert.equal(m.get(conf[0][0].game_id)!.conf?.side, "west");
  assert.equal(m.get(conf[1][0].game_id)!.conf?.side, "east");
  assert.equal(m.get(finals[0][0].game_id)!.final, true);
  assert.equal(m.get(finals[0][0].game_id)!.conf, undefined);
  assert.equal(m.get(games[0].game_id)!.conf, undefined, "the first round is no conference final");
});

test("the NFL's Conference Championship is a conference final too, a single game with its own conference", () => {
  const { games, conf, finals } = nbaBracket(2023, "nfl", "W");
  const m = seriesBigGames("nfl", 2023, games, say as never, "Round robin", "Postseason", (f) => (f != null && f <= 8 ? "afc" : "nfc"));
  assert.equal(m.get(conf[0][0].game_id)!.conf?.side, "afc");
  assert.equal(m.get(conf[1][0].game_id)!.conf?.side, "nfc");
  assert.equal(m.get(conf[0][0].game_id)!.final, false);
  assert.equal(m.get(finals[0][0].game_id)!.final, true);
  assert.equal(m.get(finals[0][0].game_id)!.conf, undefined);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { gamePath, gameSegment, parseGameSegment } from "../src/lib/gamePath.ts";
import { around, countsOtl, formBefore, goingInto, headOf, meetingsAround, resultFor, tallyOf, timelineOf, type Lite, type PairGame } from "../src/lib/gameView.ts";

/** Run in web/: pnpm test:game */

let nextId = 100;
/** A game on `date` between team seasons `away` and `home` (the scores are away-home; null for a game to come). */
function game(date: string, away: number, home: number, score: [number, number] | null, extra: Partial<Lite> = {}): Lite {
  return {
    game_id: nextId++, game_date: date, phase: "regular", status: score ? "final" : "scheduled", away_id: away, away: `Team ${away}`, away_score: score ? score[0] : null,
    home_id: home, home: `Team ${home}`, home_score: score ? score[1] : null, overtime: false, ...extra,
  };
}

test("a game's address is the season, the id and the two clubs by name", () => {
  assert.equal(gameSegment(1234567, "Boston Bruins", "Montréal Canadiens"), "1234567-boston-bruins-at-montreal-canadiens");
  assert.equal(gamePath("nhl", 2007, 1234567, "Boston Bruins", "Montréal Canadiens"), "/nhl/2007-08/game/1234567-boston-bruins-at-montreal-canadiens");
  assert.equal(gamePath("mlb", 2026, 9, "Cleveland Guardians", "Chicago White Sox"), "/mlb/2026/game/9-cleveland-guardians-at-chicago-white-sox");
});

test("a club with no name leaves the id alone, which is still an address", () => {
  assert.equal(gameSegment(55, null, "Ottawa Senators"), "55");
  assert.equal(gamePath("nfl", 1999, 55, "Dallas Cowboys", null), "/nfl/1999/game/55");
});

test("the id is what an address names: the words after it may be wrong or missing", () => {
  assert.equal(parseGameSegment("1234567-boston-bruins-at-montreal-canadiens"), 1234567);
  assert.equal(parseGameSegment("1234567"), 1234567);
  assert.equal(parseGameSegment("42-wrong-words"), 42);
});

test("an address that names no game is none", () => {
  for (const seg of ["", "abc", "-5", "0", "007", "12abc", "12-", "12--x", "12-A", "1234567890123", "1.5", "12-bruins/x"]) assert.equal(parseGameSegment(seg), null, seg);
});

test("an overtime loss is its own result only where the league counted it", () => {
  assert.equal(countsOtl("nhl", 2007), true);
  assert.equal(countsOtl("nhl", 1998), false);
  assert.equal(countsOtl("nba", 2007), false);
  const ot = game("2007-10-01", 1, 2, [3, 2], { overtime: true });
  assert.equal(resultFor(ot, 1, true), "W");
  assert.equal(resultFor(ot, 2, true), "OTL");
  assert.equal(resultFor(ot, 2, false), "L");
  assert.equal(resultFor(ot, 9, true), null, "a club that did not play has no result");
  assert.equal(resultFor(game("2007-10-02", 1, 2, null), 1, true), null, "a game to come has no result");
  assert.equal(resultFor(game("2007-10-03", 1, 2, [2, 2]), 2, true), "T");
});

// Club 1's season: three wins and a loss in the regular season, a scheduled game, then two playoff games. Club 2 is the opponent of most of them.
const season: Lite[] = [
  game("2007-10-01", 1, 2, [3, 1]),
  game("2007-10-03", 2, 3, [1, 4], { phase: "preseason" }),
  game("2007-10-04", 2, 1, [2, 5]),
  game("2007-10-06", 1, 3, [0, 2]),
  game("2007-10-08", 3, 1, [1, 2], { overtime: true }),
  game("2007-10-10", 1, 2, null),
  game("2007-11-01", 1, 2, [4, 3], { phase: "playoffs" }),
  game("2007-11-03", 2, 1, [2, 1], { phase: "playoffs" }),
];
const [g1, , g3, g4, g5, g6, p1, p2] = season;

test("a club's timeline is its regular-season and playoff games in the order played", () => {
  const t = timelineOf(season, 1);
  assert.deepEqual(t.map((g) => g.game_id), [g1, g3, g4, g5, g6, p1, p2].map((g) => g.game_id));
  assert.equal(timelineOf(season, 2).length, 5, "the preseason game is left out...");
  assert.equal(timelineOf(season, 2, "preseason").length, 6, "...unless it is the game's own part of the season");
});

test("the games either side of a game, and none past the ends", () => {
  const t = timelineOf(season, 1);
  assert.equal(around(t, g3).prev?.game_id, g1.game_id);
  assert.equal(around(t, g3).next?.game_id, g4.game_id);
  assert.equal(around(t, g1).prev, null);
  assert.equal(around(t, p2).next, null);
  assert.equal(around(t, { game_id: 1 }).index, -1);
});

test("the record going into a game is counted from the club's earlier games of the same part of the season", () => {
  const t = timelineOf(season, 1);
  const into = goingInto(t, g5, 1, true);
  assert.deepEqual(into.before, { gp: 3, w: 2, l: 1, t: 0, otl: 0 });
  assert.deepEqual(into.after, { gp: 4, w: 3, l: 1, t: 0, otl: 0 });
  assert.equal(into.number, 4);
  assert.equal(into.season, null);
  const first = goingInto(t, g1, 1, true);
  assert.equal(first.before.gp, 0);
  assert.equal(first.number, 1);
});

test("a playoff game follows the whole regular season, and counts the playoffs by themselves", () => {
  const t = timelineOf(season, 1);
  const into = goingInto(t, p2, 1, true);
  assert.deepEqual(into.season, { gp: 4, w: 3, l: 1, t: 0, otl: 0 });
  assert.deepEqual(into.before, { gp: 1, w: 1, l: 0, t: 0, otl: 0 });
  assert.equal(into.number, 2);
});

test("the other club's overtime loss is counted as one", () => {
  assert.deepEqual(tallyOf(season, 3, true), { gp: 3, w: 2, l: 0, t: 0, otl: 1 });
  assert.deepEqual(tallyOf(season, 3, false), { gp: 3, w: 2, l: 1, t: 0, otl: 0 });
});

test("a club's form is its last results before the game, oldest first", () => {
  const t = timelineOf(season, 1);
  assert.deepEqual(formBefore(t, g5, 1, true).map((f) => f.result), ["W", "W", "L"]);
  assert.deepEqual(formBefore(t, g5, 1, true, 2).map((f) => f.game.game_id), [g3.game_id, g4.game_id]);
  assert.deepEqual(formBefore(t, g1, 1, true), []);
});

const pair = (g: Lite, year: number, a: number, b: number): PairGame => ({ ...g, year, away_f: g.away_id === 1 ? a : b, home_f: g.home_id === 1 ? a : b });
const history: PairGame[] = [
  pair(game("1990-01-01", 1, 2, [1, 2]), 1989, 10, 20),
  pair(game("2007-10-01", 1, 2, [3, 1]), 2007, 10, 20),
  pair(game("2007-10-04", 2, 1, [2, 5]), 2007, 10, 20),
  pair(game("2007-11-01", 1, 2, [4, 3]), 2007, 10, 20),
  pair(game("2007-12-25", 1, 2, null), 2007, 10, 20),
  pair(game("2010-01-02", 2, 1, [3, 3]), 2009, 10, 20),
];

test("the meetings either side of a game", () => {
  const now = history[2];
  assert.equal(meetingsAround(history, now).prev?.game_id, history[1].game_id);
  assert.equal(meetingsAround(history, now).next?.game_id, history[3].game_id);
  assert.equal(meetingsAround(history, history[0]).prev, null);
  assert.equal(meetingsAround(history, history[5]).next, null);
  assert.equal(meetingsAround(history, history[3]).next?.status, "scheduled", "the next meeting may be one still to come");
});

test("the all-time record counts the finished games between exactly the two franchises, whoever was at home", () => {
  const h = headOf(history, 10, 20);
  assert.deepEqual(h, { gp: 5, a: 3, b: 1, t: 1, af: 16, bf: 11 });
  const flip = headOf(history, 20, 10);
  assert.deepEqual([flip.a, flip.b, flip.af, flip.bf], [1, 3, 11, 16]);
  assert.equal(headOf(history, 10, 99).gp, 0);
});

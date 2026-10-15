import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSeries, seriesTies, type PlayoffGame } from "../src/lib/series.ts";
import { gameOrder, inOrder, isHomeFirst, leftRight, placeOf, SIDE_RULE, seriesOrder } from "../src/lib/sides.ts";

/** Run in web/: pnpm test:sides (the one rule for which team is on the left; AGENTS.md section 9). */

const g = (id: number, day: string, away: number, home: number, as: number, hs: number): PlayoffGame => ({
  game_id: id, game_date: day, status: "final", away_id: away, away: `Team ${away}`, away_score: as, home_id: home, home: `Team ${home}`, home_score: hs,
  overtime: false, source: "test", away_f: away, home_f: home, checked: null,
} as PlayoffGame);

// Team 2 has home advantage (it hosts games 1 and 2); team 1 wins the series, 5 games to 2.
const sevenGames = [
  g(1, "2026-04-20", 1, 2, 3, 2), g(2, "2026-04-22", 1, 2, 1, 4), g(3, "2026-04-24", 2, 1, 1, 2), g(4, "2026-04-26", 2, 1, 3, 1),
  g(5, "2026-04-28", 1, 2, 4, 2), g(6, "2026-04-30", 2, 1, 2, 5), g(7, "2026-05-02", 1, 2, 3, 1),
];

test("the rule is one constant, home advantage and the visitor on the left", () => {
  assert.equal(SIDE_RULE, "home");
});

test("a single game: the visitor on the left, the home team on the right, whoever won", () => {
  assert.deepEqual(gameOrder(1), [0, 1], "sides listed [visitor, home]");
  assert.deepEqual(gameOrder(0), [1, 0], "sides listed [home, visitor]");
  assert.deepEqual(gameOrder(1, 0), [0, 1], "the winner does not move a team");
  assert.deepEqual(gameOrder(0, 0), [1, 0]);
  assert.deepEqual(inOrder(gameOrder(0), ["Home", "Visitor"]), ["Visitor", "Home"]);
  assert.deepEqual(leftRight("Visitor", "Home"), { left: "Visitor", right: "Home", swapped: false });
});

test("soccer lists the home side first: the home team (FIFA's Team A) on the left, the five leagues keep the visitor on the left", () => {
  for (const sport of ["nhl", "nba", "mlb", "nfl", "cfl", undefined, null]) assert.equal(isHomeFirst(sport), false, String(sport));
  assert.equal(isHomeFirst("soccer"), true);
  assert.deepEqual(gameOrder(0, null, SIDE_RULE, "soccer"), [0, 1], "sides listed [home, visitor]: as they stand");
  assert.deepEqual(gameOrder(1, null, SIDE_RULE, "soccer"), [1, 0], "sides listed [visitor, home]: swapped");
  assert.deepEqual(gameOrder(0, 1, SIDE_RULE, "soccer"), [0, 1], "the winner does not move a team");
  assert.deepEqual(gameOrder(0, null, SIDE_RULE, "nhl"), [1, 0], "a North American league: [home, visitor] swaps");
  assert.deepEqual(inOrder(gameOrder(0, null, SIDE_RULE, "soccer"), ["Argentina", "France"]), ["Argentina", "France"], "Argentina v France, as FIFA lists the final");
  assert.deepEqual(leftRight("Chelsea", "Arsenal", { sport: "soccer" }), { left: "Arsenal", right: "Chelsea", swapped: true });
  assert.deepEqual(leftRight("Canadiens", "Bruins", { sport: "nhl" }), { left: "Canadiens", right: "Bruins", swapped: false });
  assert.deepEqual(gameOrder(1, 0, "winner", "soccer"), [0, 1], "the winner rule is the same in every sport");
});

test("a series: the team that had home advantage in game one on the left, whoever won it", () => {
  const s = buildSeries("nhl", 2026, sevenGames, 1, { bestOf: 7 })!;
  assert.equal(s.sides[0].f, 1, "the series lists its winner first");
  assert.equal(s.games[0].home, 1, "team 2, the second side, was at home in game one");
  const order = seriesOrder(s);
  assert.deepEqual(order, [1, 0]);
  assert.equal(inOrder(order, s.sides)[0].f, 2, "team 2 is on the left");
  assert.equal(placeOf(order, 1), 0);
  assert.equal(placeOf(order, 0), 1);
  // The bracket takes the teams, the scores and the games in that order, and the winner as a team.
  const tie = seriesTies([s])[0];
  assert.deepEqual(tie.teams, [2, 1]);
  assert.equal(tie.winner, 1);
  assert.deepEqual(tie.play?.score, [2, 5], "the left side's wins first");
  assert.deepEqual(tie.play?.games?.[0].score, [2, 3], "game one, from the left side's point of view");
});

test("a series its home-advantage team won keeps the order it is listed in", () => {
  const s = buildSeries("nhl", 2026, sevenGames.map((x) => ({ ...x, away_score: x.home_score, home_score: x.away_score })), 1, { bestOf: 7 })!;
  assert.equal(s.sides[0].f, 2);
  assert.deepEqual(seriesOrder(s), [0, 1]);
});

test("a series of one game is a game: the visitor on the left", () => {
  const one = buildSeries("nfl", 2025, [g(9, "2026-01-10", 2, 1, 17, 20)], 1)!;
  assert.equal(one.sides[0].f, 1, "the home team won");
  assert.deepEqual(seriesOrder(one), [1, 0], "the visitor, team 2, on the left");
  const tie = seriesTies([one])[0];
  assert.deepEqual(tie.teams, [2, 1]);
  assert.deepEqual(tie.play?.score, [17, 20]);
  assert.equal(tie.play?.home, 1, "the home side is the second, as the columns layout's AT wants it");
});

test("a deciding game follows the series' order on the page of a series, the game's own order elsewhere", () => {
  const s = buildSeries("nhl", 2026, sevenGames, 1, { bestOf: 7 })!;
  const left = s.sides[seriesOrder(s)[0]].f;
  const decider = s.games.at(-1)!;
  const [away, home] = [s.sides[decider.home === 0 ? 1 : 0].f, s.sides[decider.home].f];
  assert.deepEqual([away, home], [1, 2], "game seven is at home for team 2, the series' left team");
  const alone = leftRight(away, home);
  assert.deepEqual([alone.left, alone.right, alone.swapped], [1, 2, false], "on its own page: the visitor on the left");
  const onSeriesPage = leftRight(away, home, { leftOf: (f) => f === left });
  assert.deepEqual([onSeriesPage.left, onSeriesPage.right, onSeriesPage.swapped], [2, 1, true], "on the series' page: team 2 on the left, as in the banner");
  assert.equal(leftRight(away, home, { leftOf: () => true }).swapped, false, "a rule that picks neither or both leaves the game's own order");
});

test("under the winner rule the winner would be on the left", () => {
  assert.deepEqual(gameOrder(1, 1, "winner"), [1, 0]);
  assert.deepEqual(gameOrder(1, null, "winner"), [0, 1], "a draw keeps the scoreboard's order");
  const s = buildSeries("nhl", 2026, sevenGames, 1, { bestOf: 7 })!;
  assert.deepEqual(seriesOrder(s, "winner"), [0, 1], "Series.sides lists the winner first");
  assert.deepEqual(leftRight("V", "H", { winner: "home", rule: "winner" }), { left: "H", right: "V", swapped: true });
});

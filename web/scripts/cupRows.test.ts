import assert from "node:assert/strict";
import { test } from "node:test";
import { championFinal, cupAppearances, type CupFinalGameRow, type CupFinalRow, type CupSeriesRow } from "../src/lib/cupRows.ts";

/** Run in web/: pnpm test:cuprows. The Vancouver Millionaires (franchise 1647) as api.cup_series, api.cup_final and api.cup_final_game hold them. */
const VAN = 1647, OTT = 1637, TOR = 1428;
const series = (o: Partial<CupSeriesRow> & Pick<CupSeriesRow, "year" | "winner_name">): CupSeriesRow => ({
  seq: 1, kind: "final", winner_league: null, winner_franchise: null, loser_name: null, loser_league: null, loser_franchise: null, format: null, score: null, ...o,
});
const finals: CupFinalRow[] = [
  { year: 1915, first_day: "1915-03-22", last_day: "1915-03-26", format: "best-of-five", team1_name: "Vancouver Millionaires", team1_league: "PCHA", team1_franchise: VAN, team2_name: "Ottawa Senators", team2_league: "NHA", team2_franchise: OTT, team1_games: 3, team2_games: 0, winner_side: 1 },
  { year: 1918, first_day: "1918-03-20", last_day: "1918-03-30", format: "best-of-five", team1_name: "Toronto Hockey Club", team1_league: "NHL", team1_franchise: TOR, team2_name: "Vancouver Millionaires", team2_league: "PCHA", team2_franchise: VAN, team1_games: 3, team2_games: 2, winner_side: 1 },
  { year: 1919, first_day: "1919-03-22", last_day: "1919-04-01", format: "best-of-five", team1_name: "Montreal Canadiens", team1_league: "NHL", team1_franchise: 1416, team2_name: "Seattle Metropolitans", team2_league: "PCHA", team2_franchise: 1644, team1_games: 2, team2_games: 2, winner_side: null },
];
const games: CupFinalGameRow[] = [
  { year: 1915, game_no: 1, played_on: "1915-03-22", team1_score: 6, team2_score: 2, overtime_periods: 0, home_side: 1, venue_name: "Denman Arena", venue_city: "Vancouver" },
  { year: 1915, game_no: 2, played_on: "1915-03-24", team1_score: 8, team2_score: 3, overtime_periods: 0, home_side: 1, venue_name: "Denman Arena", venue_city: "Vancouver" },
  { year: 1918, game_no: 1, played_on: "1918-03-20", team1_score: 5, team2_score: 3, overtime_periods: 0, home_side: 1, venue_name: "Arena Gardens", venue_city: "Toronto" },
  { year: 1918, game_no: 2, played_on: "1918-03-23", team1_score: 4, team2_score: 6, overtime_periods: 1, home_side: 2, venue_name: "Arena Gardens", venue_city: "Toronto" },
];
const rows: CupSeriesRow[] = [
  series({ year: 1915, winner_name: "Vancouver Millionaires", winner_franchise: VAN, loser_name: "Ottawa Senators", loser_franchise: OTT, score: "3–0" }),
  series({ year: 1918, winner_name: "Toronto Hockey Club", winner_franchise: TOR, loser_name: "Vancouver Millionaires", loser_franchise: VAN, score: "3–2" }),
  series({ year: 1912, winner_name: "Quebec Hockey Club", loser_name: "Moncton Victorias", score: "2–0" }),
  series({ year: 1908, winner_name: "Vancouver Millionaires", winner_league: "PCHA", winner_franchise: VAN, loser_name: "Some Challenger", loser_franchise: null, score: "2–1" }),
  series({ year: 1907, winner_name: "Vancouver Millionaires", winner_franchise: VAN, kind: "league", loser_name: null }),
  series({ year: 1906, winner_name: "Another Club", loser_name: "Vancouver Millionaires", loser_franchise: VAN, score: "2–1" }),
];

test("a final is told from the final's own row, games included and turned to the club's side", () => {
  const a = cupAppearances(VAN, rows, finals, games);
  const y1915 = a.find((x) => x.year === 1915)!;
  assert.equal(y1915.result, "won");
  assert.equal(y1915.opponent, "Ottawa Senators");
  assert.equal(y1915.opponentLeague, "NHA");
  assert.equal(y1915.score, "3–0");
  assert.deepEqual(y1915.games.map((g) => [g.no, g.mine, g.theirs, g.home]), [[1, 6, 2, true], [2, 8, 3, true]]);
  const y1918 = a.find((x) => x.year === 1918)!;
  assert.equal(y1918.result, "lost");
  assert.equal(y1918.opponent, "Toronto Hockey Club");
  assert.equal(y1918.score, "2–3", "the club's games first");
  assert.deepEqual(y1918.games.map((g) => [g.mine, g.theirs, g.home, g.overtimes]), [[3, 5, false, 0], [6, 4, true, 1]]);
  assert.equal(a.filter((x) => x.year === 1915).length, 1, "the series row of a year with a final is not told twice");
});

test("a year with no final is told from the series rows: wins, losses and a title with no challenger, oldest first, score the club's first", () => {
  const a = cupAppearances(VAN, rows, finals, games);
  assert.deepEqual(a.map((x) => x.year), [1906, 1907, 1908, 1915, 1918]);
  assert.deepEqual([a[0].result, a[0].score, a[0].opponent], ["lost", "1–2", "Another Club"]);
  assert.deepEqual([a[1].result, a[1].opponent], ["none", null]);
  assert.deepEqual([a[2].result, a[2].score], ["won", "2–1"]);
  assert.equal(cupAppearances(1, rows, finals, games).length, 0, "a club with no series has none");
});

test("a final with no winner (1919) is a result of none", () => {
  const a = cupAppearances(1644, [], finals, games);
  assert.deepEqual(a.map((x) => [x.year, x.result, x.score]), [[1919, "none", "2–2"]]);
});

test("the champion's final is the one in the spring after its season began", () => {
  assert.equal(championFinal(VAN, 1914, finals, rows, games)?.opponent, "Ottawa Senators");
  assert.equal(championFinal(VAN, 1917, finals, rows, games)?.result, "lost");
  assert.equal(championFinal(VAN, 1915, finals, rows, games), null);
  assert.equal(championFinal(null, 1914, finals, rows, games), null);
});

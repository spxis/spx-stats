import assert from "node:assert/strict";
import { test } from "node:test";
import { bestSide, longestOfSeason, parseRecord } from "../src/lib/seasonBoxes.ts";
import { resultsByTeam, type PlayedGame, type Result } from "../src/lib/streaks.ts";

/** Run in web/: pnpm test:seasonboxes */
const row = (team_id: number, home: string | null, road: string | null = null) => ({ team_id, home, road });
const seq = (s: string, start = 1): Result[] => s.split(" ").map((r, i) => ({ date: `2026-10-${String(start + i).padStart(2, "0")}`, res: r as Result["res"] }));

test("a record is read with either dash, and a blank one is nothing", () => {
  assert.equal(parseRecord("30–11", false)?.share, 30 / 41);
  assert.equal(parseRecord("30-11", false)?.text, "30–11");
  assert.equal(parseRecord("", false), null);
  assert.equal(parseRecord(null, false), null);
  assert.equal(parseRecord("0-0", false), null);
});

test("the third number is overtime losses in a league that counts them, ties (half a win) in one that does not", () => {
  assert.equal(parseRecord("29-8-4", true)?.share, 29 / 41);
  assert.equal(parseRecord("5-3-2", false)?.share, 6 / 10);
  // four numbers: wins, losses, ties, overtime losses
  assert.equal(parseRecord("20-10-4-2", true)?.share, 22 / 36);
});

test("the best home team has the highest share of games won", () => {
  const best = bestSide([row(1, "29-8-4"), row(2, "28-13-0"), row(3, "20-20-1")], "home", true);
  assert.equal(best?.teams[0], 1);
  assert.equal(best?.text, "29–8–4");
});

test("a tie in share is broken by wins, and teams level on both are all kept", () => {
  // 3-1 and 6-2 are both .750; 6-2 has more wins
  assert.deepEqual(bestSide([row(1, "3-1"), row(2, "6-2")], "home", false)?.teams, [2]);
  assert.deepEqual(bestSide([row(1, "6-2"), row(2, "6-2"), row(3, "3-1")], "home", false)?.teams, [1, 2]);
});

test("home and road are told apart, and a side nobody has a record for is null", () => {
  const rows = [row(1, "20-5", "10-15"), row(2, "15-10", "18-7")];
  assert.equal(bestSide(rows, "home", false)?.teams[0], 1);
  assert.equal(bestSide(rows, "road", false)?.teams[0], 2);
  assert.equal(bestSide([row(1, null, null)], "home", false), null);
  assert.equal(bestSide([], "road", false), null);
});

const game = (date: string, home: number, away: number, homeScore: number, awayScore: number): PlayedGame => ({ date, home, away, homeScore, awayScore, overtime: false });

test("the longest winning streak of the season is the longest any team had, with its dates", () => {
  const results = new Map<number, Result[]>([[1, seq("W W L W W W L")], [2, seq("L W W W W W", 3)], [3, seq("W L W L")]]);
  const win = longestOfSeason(results, "W");
  assert.equal(win?.length, 5);
  assert.deepEqual(win?.runs.map((r) => r.team), [2]);
  assert.deepEqual(win?.runs[0].run, { kind: "W", length: 5, from: "2026-10-04", to: "2026-10-08" });
});

test("teams level on the longest losing streak follow in the order the runs began", () => {
  const results = new Map<number, Result[]>([[1, seq("L L L W", 5)], [2, seq("L L L L", 1)], [3, seq("L L L L W", 2)]]);
  const loss = longestOfSeason(results, "L");
  assert.equal(loss?.length, 4);
  assert.deepEqual(loss?.runs.map((r) => r.team), [2, 3]);
});

test("a streak shorter than two games is not a streak", () => {
  assert.equal(longestOfSeason(new Map([[1, seq("W L W L")]]), "W"), null);
  assert.equal(longestOfSeason(new Map(), "L"), null);
});

test("streaks are worked out from the games' results", () => {
  const games = [game("2026-10-01", 1, 2, 3, 1), game("2026-10-02", 1, 2, 4, 2), game("2026-10-03", 2, 1, 5, 0)];
  const results = resultsByTeam(games, false);
  const win = longestOfSeason(results, "W");
  assert.equal(win?.length, 2);
  assert.equal(win?.runs[0].team, 1);
  const loss = longestOfSeason(results, "L");
  assert.equal(loss?.length, 2);
  assert.equal(loss?.runs[0].team, 2);
});

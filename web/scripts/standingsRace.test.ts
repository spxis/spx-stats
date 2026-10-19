import assert from "node:assert/strict";
import { test } from "node:test";
import { standingsRace, weekStartOf } from "../src/lib/standingsRace.ts";
import type { GameTuple } from "../src/lib/season.ts";

/** Run in web/: pnpm test:race */
const game = (date: string, away: number, awayScore: number | null, homeScore: number | null, home: number, o: { phase?: "r" | "p"; status?: string; ot?: 0 | 1 } = {}): GameTuple =>
  [date, away, awayScore, homeScore, home, o.phase ?? "r", o.status ?? "f", "x", o.ot ?? 0, null, 0];

test("a week starts on the chosen weekday", () => {
  // 2026-10-14 is a Wednesday.
  assert.equal(weekStartOf("2026-10-14"), "2026-10-12");
  assert.equal(weekStartOf("2026-10-12"), "2026-10-12");
  assert.equal(weekStartOf("2026-10-18"), "2026-10-12");
  assert.equal(weekStartOf("2026-10-18", 0), "2026-10-18");
  // Tuesday weeks: Thursday to Monday night is one week.
  assert.equal(weekStartOf("2026-10-08", 2), "2026-10-06");
  assert.equal(weekStartOf("2026-10-12", 2), "2026-10-06");
  assert.equal(weekStartOf("2026-10-13", 2), "2026-10-13");
});

test("ranks follow winning share after each week, and a club ranks once it has played", () => {
  const race = standingsRace([
    game("2026-10-05", 1, 1, 3, 2), // week 1: club 2 beats club 1
    game("2026-10-12", 3, 4, 2, 1), // week 2: club 3 beats club 1; club 3 now plays
    game("2026-10-13", 2, 5, 0, 3), // week 2: club 2 beats club 3
  ], false)!;
  assert.deepEqual(race.weeks, ["2026-10-05", "2026-10-12"]);
  const by = new Map(race.teams.map((t) => [t.id, t]));
  assert.deepEqual(by.get(2)!.ranks, [1, 1]);
  assert.deepEqual(by.get(1)!.ranks, [2, 3]);
  assert.deepEqual(by.get(3)!.ranks, [null, 2]);
  assert.deepEqual(by.get(3)!.recs, [null, [1, 1, 0, 0]]);
  assert.deepEqual(race.teams.map((t) => t.id), [2, 3, 1]);
});

test("only final regular-season games with a score count", () => {
  const race = standingsRace([
    game("2026-10-05", 1, 1, 3, 2),
    game("2026-10-06", 1, 9, 0, 2, { phase: "p" }),
    game("2026-10-07", 1, null, null, 2, { status: "s" }),
    game("2026-10-12", 2, 2, 1, 1),
  ], false)!;
  assert.deepEqual(race.teams.find((t) => t.id === 1)!.recs, [[0, 1, 0, 0], [0, 2, 0, 0]]);
});

test("a week with no game is not a step", () => {
  const race = standingsRace([game("2026-10-05", 1, 1, 3, 2), game("2026-11-09", 2, 1, 2, 1)], false)!;
  assert.deepEqual(race.weeks, ["2026-10-05", "2026-11-09"]);
});

test("clubs level on share and wins keep last week's order", () => {
  // Week 1: 2 beats 1, 4 beats 3, so 2 and 4 lead on 1.000 and 1 and 3 follow (ties by id).
  // Week 2: 3 beats 2 and 1 beats 4, so every club is 1-1 and the order stays as it was.
  const race = standingsRace([
    game("2026-10-05", 1, 0, 1, 2), game("2026-10-05", 3, 0, 1, 4),
    game("2026-10-12", 2, 0, 1, 3), game("2026-10-12", 4, 0, 1, 1),
  ], false)!;
  const by = new Map(race.teams.map((t) => [t.id, t.ranks]));
  // Level at 1-1 (share .500, one win): the week-1 order 2, 4, 1, 3 holds, though clubs 1 and 3 are not the ones lowest by id.
  assert.deepEqual(by.get(2), [1, 1]);
  assert.deepEqual(by.get(4), [2, 2]);
  assert.deepEqual(by.get(1), [3, 3]);
  assert.deepEqual(by.get(3), [4, 4]);
});

test("an overtime loss is a loss in the share unless the league counts it apart", () => {
  const games = [game("2026-10-05", 1, 1, 2, 2, { ot: 1 }), game("2026-10-12", 1, 3, 2, 2)];
  const apart = standingsRace(games, true)!;
  assert.deepEqual(apart.teams.find((t) => t.id === 1)!.recs, [[0, 0, 0, 1], [1, 0, 0, 1]]);
  const plain = standingsRace(games, false)!;
  assert.deepEqual(plain.teams.find((t) => t.id === 1)!.recs, [[0, 1, 0, 0], [1, 1, 0, 0]]);
});

test("nothing to draw with one week, one club or no games", () => {
  assert.equal(standingsRace([], false), null);
  assert.equal(standingsRace([game("2026-10-05", 1, 1, 2, 2), game("2026-10-06", 2, 1, 2, 1)], false), null);
});

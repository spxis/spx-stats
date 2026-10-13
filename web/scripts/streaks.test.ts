import assert from "node:assert/strict";
import { test } from "node:test";
import { longestCurrent, outcomeOf, regularSeasonOpen, resultsByTeam, teamStreaks, type PlayedGame, type Result } from "../src/lib/streaks.ts";

/** Run in web/: pnpm test:streaks */
const seq = (s: string): Result[] => s.split(" ").map((r, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, res: r as Result["res"] }));
const game = (date: string, home: number, away: number, homeScore: number, awayScore: number, overtime = false): PlayedGame => ({ date, home, away, homeScore, awayScore, overtime });

test("a win, a loss and a tie are told from the scores", () => {
  assert.equal(outcomeOf(3, 2, false, false), "W");
  assert.equal(outcomeOf(2, 3, false, false), "L");
  assert.equal(outcomeOf(2, 2, false, false), "T");
});

test("an overtime loss is a loss unless the league counts them apart", () => {
  assert.equal(outcomeOf(2, 3, true, false), "L");
  assert.equal(outcomeOf(2, 3, true, true), "OTL");
  assert.equal(outcomeOf(3, 2, true, true), "W");
});

test("no games, no streaks", () => {
  assert.deepEqual(teamStreaks([]), { current: null, win: null, loss: null });
});

test("the current streak is the run ending at the latest game", () => {
  const s = teamStreaks(seq("L W W W W"));
  assert.deepEqual(s.current, { kind: "W", length: 4, from: "2026-10-02", to: "2026-10-05" });
  assert.equal(s.win?.length, 4);
  assert.equal(s.loss?.length, 1);
});

test("the longest runs carry their dates; the earliest of equal runs wins", () => {
  const s = teamStreaks(seq("W W L L L W W L L L W"));
  assert.deepEqual(s.win, { kind: "W", length: 2, from: "2026-10-01", to: "2026-10-02" });
  assert.deepEqual(s.loss, { kind: "L", length: 3, from: "2026-10-03", to: "2026-10-05" });
  assert.deepEqual(s.current, { kind: "W", length: 1, from: "2026-10-11", to: "2026-10-11" });
});

test("a tie or an overtime loss ends winning and losing streaks alike", () => {
  const s = teamStreaks(seq("W W OTL W W T L L"));
  assert.equal(s.win?.length, 2);
  assert.equal(s.loss?.length, 2);
  assert.deepEqual(s.current, { kind: "L", length: 2, from: "2026-10-07", to: "2026-10-08" });
  assert.equal(teamStreaks(seq("W W OTL")).current?.kind, "OTL");
});

test("results are kept in date order whatever order the games arrive in", () => {
  const r = resultsByTeam([game("2026-10-03", 1, 2, 3, 1), game("2026-10-01", 2, 1, 4, 0), game("2026-10-02", 1, 3, 5, 2)], false);
  assert.deepEqual(r.get(1)?.map((x) => x.res), ["L", "W", "W"]);
  assert.deepEqual(r.get(2)?.map((x) => x.res), ["W", "L"]);
  assert.deepEqual(r.get(3)?.map((x) => x.res), ["L"]);
});

test("two games on one day keep the order given", () => {
  const r = resultsByTeam([game("2026-10-01", 1, 2, 1, 0), game("2026-10-01", 2, 1, 3, 0)], false);
  assert.deepEqual(r.get(1)?.map((x) => x.res), ["W", "L"]);
});

test("the longest current streaks, with ties and a minimum length", () => {
  const r = new Map<number, Result[]>([
    [1, seq("L W W W")], [2, seq("W W W")], [3, seq("W W L")], [4, seq("W L L L")], [5, seq("L L L")], [6, seq("W")],
  ]);
  assert.deepEqual(longestCurrent(r, "W"), { length: 3, teams: [1, 2] });
  assert.deepEqual(longestCurrent(r, "L"), { length: 3, teams: [4, 5] });
  assert.equal(longestCurrent(new Map([[1, seq("W L W")]]), "W"), null);
  assert.deepEqual(longestCurrent(new Map([[1, seq("W L W")]]), "W", 1), { length: 1, teams: [1] });
});

test("a streak that was broken by an overtime loss is not current", () => {
  const r = new Map<number, Result[]>([[1, seq("W W W OTL")]]);
  assert.equal(longestCurrent(r, "W"), null);
});

test("a season is in progress while regular games remain and no champion is crowned", () => {
  const open = [{ regular: true, scheduled: false }, { regular: true, scheduled: true }];
  assert.equal(regularSeasonOpen(open, false), true);
  assert.equal(regularSeasonOpen(open, true), false);
  assert.equal(regularSeasonOpen([{ regular: true, scheduled: false }, { regular: false, scheduled: true }], false), false);
  assert.equal(regularSeasonOpen([], false), false);
});

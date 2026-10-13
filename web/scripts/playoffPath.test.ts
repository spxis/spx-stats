import assert from "node:assert/strict";
import { test } from "node:test";
import { CHAMPION, IN, OUT, pathGraph, seriesId, teamId } from "../src/lib/playoffPath.ts";
import type { Series } from "../src/lib/series.ts";

/** Run in web/: pnpm test:path */
// A series with the winner first, as deriveSeries gives them.
const ser = (w: number, l: number, decided = true): Series => ({
  league: "nhl", year: 2020, sides: [{ f: w, id: w, name: `T${w}`, wins: 4, scored: 0 }, { f: l, id: l, name: `T${l}`, wins: 1, scored: 0 }],
  games: [], ties: 0, winner: decided ? 0 : null, basis: "wins", start: "2021-04-01", end: "2021-04-10", meeting: 1,
});
const club = (f: number) => ({ f, place: f });
const clubs = [1, 2, 3, 4, 5, 6].map(club);

// Round 1: 1 beat 4, 2 beat 3. Round 2 (the final): 1 beat 2. Clubs 5 and 6 missed the playoffs.
const series = [ser(1, 4), ser(2, 3), ser(1, 2)];
const round = [1, 1, 2];

test("every club has a block, and clubs that missed the playoffs go to the 'missed' block", () => {
  const g = pathGraph(series, round, clubs, 2);
  assert.equal(g.nodes.filter((n) => n.kind === "team").length, 6);
  assert.deepEqual(g.links.filter((l) => l.kind === "miss").map((l) => l.f).sort(), [5, 6]);
  assert.ok(g.nodes.some((n) => n.id === OUT) && g.nodes.some((n) => n.id === IN));
});

test("the champion is the winner of the one final, with a column of its own", () => {
  const g = pathGraph(series, round, clubs, 2);
  assert.equal(g.champion, 1);
  assert.equal(g.columns, 5);
  assert.equal(g.nodes.find((n) => n.id === CHAMPION)?.column, 4);
  assert.deepEqual(g.routes.find((r) => r.f === 1)?.nodes, [teamId(1), IN, seriesId(0), seriesId(2), CHAMPION]);
});

test("a loser's band ends in the series it lost; the winner's carries on", () => {
  const g = pathGraph(series, round, clubs, 2);
  assert.deepEqual(g.routes.find((r) => r.f === 4)?.nodes, [teamId(4), IN, seriesId(0)]);
  assert.deepEqual(g.routes.find((r) => r.f === 2)?.nodes, [teamId(2), IN, seriesId(1), seriesId(2)]);
  assert.equal(g.links.filter((l) => l.source === seriesId(0)).length, 1);
});

test("bands keep the id of their club, and no two bands share an id", () => {
  const g = pathGraph(series, round, clubs, 2);
  assert.equal(new Set(g.links.map((l) => l.id)).size, g.links.length);
  for (const r of g.routes) for (const id of r.links) assert.equal(g.links.find((l) => l.id === id)?.f, r.f);
});

test("a club with a bye enters at a later round", () => {
  const g = pathGraph([ser(2, 3), ser(1, 2)], [1, 2], [1, 2, 3].map(club), 2);
  assert.deepEqual(g.routes.find((r) => r.f === 1)?.nodes, [teamId(1), IN, seriesId(1), CHAMPION]);
});

test("no champion when the final is not decided, or the last round holds several series", () => {
  assert.equal(pathGraph([ser(1, 2, false)], [1], [1, 2].map(club), 1).champion, null);
  const g = pathGraph([ser(1, 2), ser(3, 4)], [1, 1], [1, 2, 3, 4].map(club), 0);
  assert.equal(g.champion, null);
  assert.equal(g.columns, 3);
  assert.ok(!g.nodes.some((n) => n.id === CHAMPION));
});

test("round-robin games (round 0) are not part of the bracket", () => {
  const g = pathGraph([ser(1, 2), ser(1, 2)], [0, 1], [1, 2].map(club), 1);
  assert.equal(g.nodes.filter((n) => n.kind === "series").length, 1);
});

test("a club that played but has no standings row still gets a block", () => {
  const g = pathGraph([ser(1, 9)], [1], [club(1)], 1);
  assert.ok(g.nodes.some((n) => n.id === teamId(9)));
});

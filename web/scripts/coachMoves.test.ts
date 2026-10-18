import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCareers, chainsFor, coachGraph, decadesOf, defaultDecade, type Rec, type StaffRow } from "../src/lib/coachMoves.ts";

/** Run in web/: pnpm test:coaches */
const row = (person_id: number, franchise_id: number, year: number, first_on: string | null = null): StaffRow => ({ person_id, name: `Coach ${person_id}`, franchise_id, year, first_on });
const rec: Rec = { w: 40, l: 30, t: 0, otl: 12 };
const results = new Map<string, Rec>([["1:1990", rec], ["1:1991", rec], ["2:1992", rec], ["3:2003", rec]]);
const build = (rows: StaffRow[]) => buildCareers(rows, results, () => 0, (id) => `/p/${id}`);

// Coach 1: franchise 1 in 1990-91, franchise 2 in 1992, back to 1 in 1995, then 3 in 2003. Coach 2 stays put. Coach 3 shares 1990 with coach 1.
const rows = [
  row(1, 1, 1990), row(1, 1, 1991), row(1, 2, 1992), row(1, 1, 1995), row(1, 3, 2003),
  row(2, 1, 1992), row(2, 1, 1993),
  row(3, 1, 1990),
];

test("only coaches who held the job with two franchises have a career", () => {
  const c = build(rows);
  assert.deepEqual(c.map((x) => x.id), [1]);
  assert.equal(c[0].href, "/p/1");
});

test("a run of seasons with one franchise is one stint; a return starts another", () => {
  const [c] = build(rows);
  assert.deepEqual(c.stints.map((s) => [s.f, s.a, s.b, s.n]), [[1, 1990, 1991, 2], [2, 1992, 1992, 1], [1, 1995, 1995, 1], [3, 2003, 2003, 1]]);
});

test("a season two coaches shared adds no record", () => {
  const [c] = build(rows);
  assert.equal(c.stints[0].sole, 1);
  assert.deepEqual(c.stints[0].rec, { w: 40, l: 30, t: 0, otl: 12 });
  assert.equal(c.stints[1].sole, 1);
});

test("decades are those in which a move began", () => {
  const c = build(rows);
  assert.deepEqual(decadesOf(c), [1990, 2000]);
  assert.equal(defaultDecade(c, 1), 2000);
  assert.equal(defaultDecade([]), null);
});

test("with no decade the whole career is drawn; with one, only the moves made in it and the job left", () => {
  const c = build(rows);
  assert.deepEqual(chainsFor(c, null).map((x) => x.stints.length), [4]);
  const nineties = chainsFor(c, 1990);
  assert.deepEqual(nineties.map((x) => x.stints.map((s) => s.f)), [[1, 2, 1]]);
  const noughts = chainsFor(c, 2000);
  assert.deepEqual(noughts.map((x) => x.stints.map((s) => s.f)), [[1, 3]]);
  assert.deepEqual(chainsFor(c, 1980), []);
});

test("the graph has a block for each franchise at each job and a band for each move", () => {
  const g = coachGraph(chainsFor(build(rows), null));
  assert.equal(g.nodes.length, 4);
  assert.equal(g.links.length, 3);
  assert.equal(g.columns, 4);
  assert.deepEqual(g.routes[0].nodes, ["c0-1", "c1-2", "c2-1", "c3-3"]);
  assert.equal(new Set(g.links.map((l) => l.id)).size, 3);
});

test("coaches who make the same move share the blocks and keep their own bands", () => {
  const two = [...rows, row(5, 1, 1996), row(5, 2, 1997)];
  const g = coachGraph(chainsFor(build(two), 1990));
  const a = g.nodes.find((n) => n.id === "c0-1")!;
  assert.equal(a.held.length, 2);
  assert.equal(g.links.filter((l) => l.source === "c0-1" && l.target === "c1-2").length, 2);
});

test("with minClubs 1 a coach who stayed with one franchise has a career too", () => {
  const c = buildCareers(rows, results, () => 0, (id) => `/p/${id}`, 1);
  assert.deepEqual(c.map((x) => x.id).sort(), [1, 2, 3]);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFranchises, decadesOf, foldName, lineageGraph, pickFranchises, type IndexRow, type SeasonRow } from "../src/lib/lineage.ts";
import { readParam } from "../src/lib/addressQuery.ts";

/** Run in web/: pnpm test:lineage */
const row = (league: string, year: number, franchise_id: number, team: string | null, w = 10, l = 5, champion = false): SeasonRow =>
  ({ league, year, franchise_id, team, w, l, t: 0, otl: 0, champion });
const ix = (league: string, franchise_id: number, first_season: number, last_season: number, seasons: number, active = false): IndexRow =>
  ({ league, franchise_id, first_season, last_season, seasons, titles: 0, active });
const href = (lg: string, f: number) => `/${lg}/team/${f}`;

test("foldName ignores accents, case, dots and apostrophes", () => {
  assert.equal(foldName("B.C. Lions"), foldName("BC Lions"));
  assert.equal(foldName("Montréal Canadiens"), "montreal canadiens");
  assert.equal(foldName("St. Louis Rams"), foldName("St Louis Rams"));
});

const seasons: SeasonRow[] = [
  // franchise 1: Kansas City Scouts, Colorado Rockies, New Jersey Devils (a move and a move)
  row("nhl", 1974, 1, "Kansas City Scouts"), row("nhl", 1975, 1, "Kansas City Scouts"),
  row("nhl", 1976, 1, "Colorado Rockies", 20, 10, true), row("nhl", 1977, 1, "Colorado Rockies"),
  row("nhl", 1982, 1, "New Jersey Devils"), row("nhl", 1983, 1, "New Jersey Devils"),
  // franchise 2: one name spelled two ways, never renamed
  row("nhl", 1979, 2, "St. Louis Blues"), row("nhl", 1980, 2, "St Louis Blues"),
  // franchise 3: a season outside the index range (an empty placeholder) and a season with no name
  row("nhl", 1950, 3, "Ghosts"), row("nhl", 1979, 3, "Hartford Whalers"), row("nhl", 1980, 3, null), row("nhl", 1981, 3, "Hartford Whalers"),
  // another league, same franchise number
  row("nba", 1979, 1, "Somebody Else"),
];
const index: IndexRow[] = [
  ix("nhl", 1, 1974, 1983, 6, true), ix("nhl", 2, 1979, 1980, 2), ix("nhl", 3, 1979, 1981, 3), ix("nhl", 4, 0, 0, 0), ix("nba", 1, 1979, 1979, 1),
];
index[3] = { league: "nhl", franchise_id: 4, first_season: null, last_season: null, seasons: 0, titles: 0, active: false };

const all = buildFranchises(seasons, index, href);
const nhl = all.filter((f) => f.league === "nhl");

test("a franchise is a chain of stretches, one per name", () => {
  const f = nhl.find((x) => x.f === 1)!;
  assert.deepEqual(f.stretches.map((s) => [s.name, s.from, s.to, s.seasons, s.titles]), [
    ["Kansas City Scouts", 1974, 1975, 2, 0],
    ["Colorado Rockies", 1976, 1977, 2, 1],
    ["New Jersey Devils", 1982, 1983, 2, 0],
  ]);
  assert.equal(f.href, "/nhl/team/1");
  assert.equal(f.active, true);
});

test("a spelling variant is not a new name", () => {
  const f = nhl.find((x) => x.f === 2)!;
  assert.equal(f.stretches.length, 1);
  assert.equal(f.stretches[0]!.seasons, 2);
});

test("seasons outside the franchise's real range and seasons with no name are left out; franchises with no season are not built", () => {
  const f = nhl.find((x) => x.f === 3)!;
  assert.deepEqual(f.stretches.map((s) => [s.name, s.seasons]), [["Hartford Whalers", 2]]);
  assert.equal(nhl.some((x) => x.f === 4), false);
  assert.equal(all.length, 4);
});

test("the leagues do not mix", () => {
  assert.equal(all.find((f) => f.league === "nba")!.stretches[0]!.name, "Somebody Else");
});

test("decades and filters", () => {
  assert.deepEqual(decadesOf(nhl), [1970, 1980]);
  assert.deepEqual(pickFranchises(nhl, { decade: 1980, changed: false }).map((f) => f.f).sort(), [1, 2, 3]);
  assert.deepEqual(pickFranchises(nhl, { decade: 1970, changed: true }).map((f) => f.f), [1]);
  assert.deepEqual(pickFranchises(nhl, { decade: null, changed: false }).length, 3);
});

test("the graph joins franchises that began in the same season and chains the stretches", () => {
  const g = lineageGraph(nhl);
  const entries = g.nodes.filter((n) => n.kind === "entry");
  assert.deepEqual(entries.map((e) => [e.year, e.members.length]), [[1974, 1], [1979, 2]]);
  assert.equal(g.nodes.filter((n) => n.kind === "stretch").length, 5);
  assert.equal(g.links.length, 5);
  assert.equal(g.columns, 4);
  // every link joins existing nodes, and every franchise has one entry link
  const ids = new Set(g.nodes.map((n) => n.id));
  assert.ok(g.links.every((l) => ids.has(l.source) && ids.has(l.target)));
  assert.equal(g.links.filter((l) => l.source.startsWith("e")).length, 3);
});

test("a query string is read by name", () => {
  assert.equal(readParam("?lg=nba&dec=1980", "dec"), "1980");
  assert.equal(readParam("?lg=nba", "dec"), "");
  assert.equal(readParam("", "lg"), "");
});

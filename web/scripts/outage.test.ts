import assert from "node:assert/strict";
import { test } from "node:test";
import { carryOver, coachMoves, crossing, figuresOf, franchiseChanges, lineUp, movers, rankClubs, strengthOf } from "../src/lib/outage.ts";

/** Run in web/: pnpm test:outage */
const st = (f: number, team: string, w: number, l: number, pts: number | null, gp = 82, pf = 200) => ({
  league: "nhl", year: 2003, team_id: 1000 + f, franchise_id: f, team, gp, w, l, t: null, otl: null, pts, pf, pa: 190, home: null, road: null,
  pct: w / (w + l), basis: "published", source: null,
});
const ident = (f: number, location: string, nickname: string) => ({
  league: "nhl", year: 2003, franchise_id: f, team_season_id: f, location, nickname, team: `${location} ${nickname}`, region: null, country_code: null,
});
const ros = (f: number, person_id: number, gp: number, first = 2000, last = 2010, seasons = 5) => ({
  league: "nhl", year: 2003, franchise_id: f, team_season_id: f, person_id, name: `P${person_id}`, position: null, games_played: gp,
  first_season: first, last_season: last, seasons_played: seasons,
});

test("strength is the share of the points on offer where there are points, else the winning share", () => {
  assert.equal(strengthOf({ gp: 82, pts: 82, pct: 0.4 }), 0.5);
  assert.equal(strengthOf({ gp: 10, pts: null, pct: 0.6 }), 0.6);
  assert.equal(strengthOf({ gp: null, pts: null, pct: null }), null);
});

test("clubs are ranked by strength then wins, and a club with no games is left out", () => {
  const ranked = rankClubs([st(1, "A", 30, 40, 70), st(2, "B", 50, 20, 110), st(3, "C", 0, 0, null, 0)]);
  assert.deepEqual(ranked.map((c) => [c.name, c.rank]), [["B", 1], ["A", 2]]);
});

test("lines join clubs by franchise, with the places and strength gained", () => {
  const before = rankClubs([st(1, "A", 30, 40, 70), st(2, "B", 50, 20, 110), st(3, "C", 20, 50, 50)]);
  const after = rankClubs([st(1, "A", 52, 20, 112), st(2, "B", 40, 30, 90), st(4, "D", 30, 40, 70)]);
  const lines = lineUp(before, after);
  const a = lines.find((l) => l.f === 1)!;
  assert.equal(a.places, 1);
  assert.ok(a.change! > 0.2);
  assert.equal(lines.find((l) => l.f === 3)!.change, null);
  assert.equal(lines.find((l) => l.f === 4)!.places, null);
  const { risers, fallers } = movers(lines, 3);
  assert.deepEqual(risers.map((l) => l.f), [1]);
  assert.deepEqual(fallers.map((l) => l.f), [2]);
});

test("league figures: scoring per game counts each game once, spread is best minus worst", () => {
  const f = figuresOf(rankClubs([st(1, "A", 50, 30, 100, 80, 240), st(2, "B", 30, 50, 60, 80, 160)]));
  assert.equal(f.scoring, 5);
  assert.equal(f.best?.name, "A");
  assert.ok(Math.abs(f.spread! - 0.25) < 1e-9);
});

test("a club that joined, left, moved or took a new nickname is reported once, and an unchanged one not at all", () => {
  const before = rankClubs([st(1, "Atlanta Thrashers", 40, 30, 90), st(2, "Edmonton Eskimos", 40, 30, 90), st(3, "Gone Team", 40, 30, 90), st(4, "Same", 40, 30, 90)]);
  const after = rankClubs([st(1, "Winnipeg Jets", 40, 30, 90), st(2, "Edmonton Elks", 40, 30, 90), st(4, "Same", 40, 30, 90), st(5, "New Team", 40, 30, 90)]);
  const idB = [ident(1, "Atlanta", "Thrashers"), ident(2, "Edmonton", "Eskimos"), ident(4, "Same", "Team")];
  const idA = [ident(1, "Winnipeg", "Jets"), ident(2, "Edmonton", "Elks"), ident(4, "Same", "Team")];
  const out = franchiseChanges(before, after, idB, idA);
  assert.deepEqual(out.map((c) => [c.kind, c.f]), [["moved", 1], ["renamed", 2], ["joined", 5], ["left", 3]]);
  assert.deepEqual(franchiseChanges(before, before, idB, idB), []);
});

test("without city and nickname on file, a changed team name is a rename", () => {
  const before = rankClubs([st(1, "Old Name", 40, 30, 90)]);
  const after = rankClubs([st(1, "New Name", 40, 30, 90)]);
  assert.deepEqual(franchiseChanges(before, after, [], []).map((c) => c.kind), ["renamed"]);
});

test("head coaches: the last one of each season counts, and a club with none on file is neither changed nor kept", () => {
  const c = (f: number, id: number, ord: number) => ({ franchise_id: f, person_id: id, name: `C${id}`, first_on: null, last_on: null, ord });
  const out = coachMoves([1, 2, 3], [c(1, 10, 1), c(1, 11, 2), c(2, 20, 1)], [c(1, 11, 1), c(2, 21, 1)]);
  assert.deepEqual(out.map((m) => m.changed), [false, true, null]);
});

test("roster carry-over sorts players into stayed, traded, gone, from elsewhere and new", () => {
  const before = [ros(1, 1, 60), ros(1, 2, 50), ros(1, 3, 40), ros(2, 4, 70)];
  const after = [ros(1, 1, 80), ros(1, 4, 30), ros(1, 5, 20), ros(2, 2, 60)];
  const c = carryOver(before, after).find((x) => x.f === 1)!;
  assert.deepEqual(c.stayed.map((p) => p.id), [1]);
  assert.deepEqual(c.traded.map((p) => p.id), [2]);
  assert.deepEqual(c.gone.map((p) => p.id), [3]);
  assert.deepEqual(c.fromElsewhere.map((p) => p.id), [4]);
  assert.deepEqual(c.fresh.map((p) => p.id), [5]);
  assert.equal(c.continuity, 80 / 130);
});

test("league-wide: careers that ended, debuts, and players who changed clubs", () => {
  const before = [ros(1, 1, 60, 1990, 2003, 14), ros(1, 2, 50, 1999, 2010), ros(2, 3, 40, 2000, 2010)];
  const after = [ros(1, 2, 70, 1999, 2010), ros(1, 3, 30, 2000, 2010), ros(2, 4, 20, 2005, 2015, 10)];
  const x = crossing(before, after, 2003, 2005);
  assert.equal(x.both, 2);
  assert.deepEqual(x.ended.map((p) => [p.id, p.club]), [[1, 1]]);
  assert.deepEqual(x.debuts.map((p) => [p.id, p.club]), [[4, 2]]);
  assert.deepEqual(x.moved.map((p) => [p.id, p.from, p.to]), [[3, 2, 1]]);
});

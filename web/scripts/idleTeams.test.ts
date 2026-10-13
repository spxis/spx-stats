import assert from "node:assert/strict";
import { test } from "node:test";
import { isIdleTeam, seasonStartDay, withIdleTeams } from "../src/lib/idleTeams.ts";

/** Run in web/: pnpm test:idle */
const club = (franchise_id: number, team: string) => ({ league: "nba", year: 2026, franchise_id, team });
const played = (franchise_id: number, pts: number | null = null) => ({
  league: "nba", year: 2026, team_id: 100 + franchise_id, franchise_id, team: `T${franchise_id}`, gp: 2, w: 1, l: 1, t: null, otl: null, pts,
  pf: 200, pa: 190, home: "1-0", road: "0-1", pct: 0.5, basis: "scores", source: null,
});

test("a season with no standings lists every club at 0-0", () => {
  const out = withIdleTeams([], [club(1, "A"), club(2, "B")]);
  assert.equal(out.length, 2);
  for (const r of out) {
    assert.equal(r.gp, 0); assert.equal(r.w, 0); assert.equal(r.l, 0);
    assert.equal(r.pct, null); assert.equal(r.pts, null); assert.ok(isIdleTeam(r.team_id));
  }
  assert.notEqual(out[0].team_id, out[1].team_id);
});

test("only the clubs without a standings row are added, and keep the points column the others use", () => {
  const out = withIdleTeams([played(1, 4)], [club(1, "A"), club(2, "B")]);
  assert.deepEqual(out.map((r) => r.franchise_id), [1, 2]);
  assert.equal(out[0].team_id, 101);
  assert.equal(out[1].pts, 0);
  assert.equal(out[1].team, "B");
});

test("nothing to add returns the same rows", () => {
  const rows = [played(1)];
  assert.equal(withIdleTeams(rows, [club(1, "A")]), rows);
});

test("the season starts on the first scheduled regular-season day when nothing has a result", () => {
  const g = (date: string, status: string, phase = "r") => ({ date, phase, status });
  assert.equal(seasonStartDay([g("2026-10-22", "s"), g("2026-10-21", "s"), g("2026-10-01", "s", "s")]), "2026-10-21");
  assert.equal(seasonStartDay([g("2026-10-21", "f"), g("2026-10-22", "s")]), null);
  assert.equal(seasonStartDay([]), null);
  assert.equal(seasonStartDay([g("2026-10-21", "c")]), null);
});

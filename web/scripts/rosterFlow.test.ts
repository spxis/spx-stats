import assert from "node:assert/strict";
import { test } from "node:test";
import { clubKey, isComplete, rosterFlow, type RosterRow } from "../src/lib/rosterFlow.ts";

/** Run in web/: pnpm test:flow */
const r = (franchise_id: number, person_id: number, first_season: number, last_season: number): RosterRow =>
  ({ franchise_id, person_id, name: `P${person_id}`, position: null, games_played: 10, first_season, last_season });

// Club 1 in 2010: players 1 to 5. Player 1 stayed, 2 came from club 2 and left for club 3, 3 is a rookie whose last season is this one,
// 4 is on no roster the year before (first season 2005) or after (last season 2015), 5 split 2009 between clubs 1 and 2.
const cur = [r(1, 1, 2000, 2020), r(1, 2, 2001, 2020), r(1, 3, 2010, 2010), r(1, 4, 2005, 2015), r(1, 5, 2004, 2020), r(2, 9, 2000, 2020)];
const before = { complete: true, rows: [r(1, 1, 2000, 2020), r(2, 2, 2001, 2020), r(1, 5, 2004, 2020), r(2, 5, 2004, 2020)] };
const after = { complete: true, rows: [r(1, 1, 2000, 2020), r(3, 2, 2001, 2020), r(1, 5, 2004, 2020)] };

test("players are grouped by the club they were with the season before and the season after", () => {
  const flow = rosterFlow(1, 2010, cur, before, after);
  assert.equal(flow.me.length, 5);
  const keys = (g: typeof flow.before) => (g ?? []).map((x) => `${x.key}:${x.players.map((p) => p.id).sort().join(",")}`).sort();
  assert.deepEqual(keys(flow.before), [clubKey(1) + ":1,5", clubKey(2) + ":2,5", "absent:4", "first:3"].sort());
  assert.deepEqual(keys(flow.after), [clubKey(1) + ":1,5", clubKey(3) + ":2", "absent:4", "last:3"].sort());
});

test("a player with no roster is told apart: first season, last season, or on none we hold", () => {
  const flow = rosterFlow(1, 2010, cur, before, after);
  assert.equal(flow.before!.find((g) => g.kind === "first")?.players[0].id, 3);
  assert.equal(flow.after!.find((g) => g.kind === "last")?.players[0].id, 3);
  assert.equal(flow.before!.find((g) => g.kind === "absent")?.players[0].id, 4);
});

test("where the rosters held are not nearly every club's, a player found on none is 'unknown', never 'absent'", () => {
  const flow = rosterFlow(1, 2010, cur, { ...before, complete: false }, after);
  assert.ok(flow.before!.some((g) => g.kind === "unknown"));
  assert.ok(!flow.before!.some((g) => g.kind === "absent"));
});

test("a player with two clubs is counted for each, and gets a route for each pairing", () => {
  const flow = rosterFlow(1, 2010, cur, before, after);
  assert.deepEqual(flow.routes.filter((x) => x.id === 5).map((x) => x.before).sort(), [clubKey(1), clubKey(2)]);
});

test("a side with no roster is not drawn", () => {
  const flow = rosterFlow(1, 2010, cur, null, after);
  assert.equal(flow.before, null);
  assert.ok(flow.routes.every((x) => x.before === null));
  assert.ok(flow.after);
});

test("completeness is nearly every club", () => {
  assert.equal(isComplete(30, 32), true);
  assert.equal(isComplete(12, 30), false);
  assert.equal(isComplete(0, 0), false);
});

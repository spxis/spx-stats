import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBracket, type Tie } from "../src/lib/bracket.ts";
import type { Match } from "../src/lib/soccer.ts";
import { knockoutOf } from "../src/lib/soccerBracket.ts";

/** Run in web/: pnpm test:bracket (the layout is sport-agnostic: ties of any two sides, here string teams as in a World Cup). */

const m = (id: number, stage: string, order: number, home: string, away: string, hg: number, ag: number, extra: Partial<Match> = {}): Match => ({
  match_id: id, source_key: "", league: "wc", year: 2000, tournament_id: "wc2000", stage_key: stage, stage_order: order, group_name: null, match_number: null,
  match_date: `2000-06-${String(id).padStart(2, "0")}`, kickoff_local: null, utc_offset: null, home_team_id: home, home, home_slug: home, home_flag: null, home_goals: hg,
  away_team_id: away, away, away_slug: away, away_flag: null, away_goals: ag, home_goals_90: null, away_goals_90: null, extra_time: false, shootout: false,
  home_penalties: null, away_penalties: null, winner_team_id: hg > ag ? home : ag > hg ? away : null, is_replay: false, venue_name: null, venue_city: null,
  venue_country: null, venue_wikidata_id: null, venue_id: null, lineup_players: 0, goal_rows: 0, source: null, checked: null, ...extra,
});

// Eight teams: A beats B, C beats D, E beats F, G beats H; A beats C, E beats G; E beats A in the final (E plays on the right, A on the left).
const eight = [
  m(1, "quarter", 6, "A", "B", 2, 0), m(2, "quarter", 6, "C", "D", 1, 0), m(3, "quarter", 6, "E", "F", 3, 1), m(4, "quarter", 6, "G", "H", 2, 1),
  m(5, "semi", 7, "A", "C", 1, 0), m(6, "semi", 7, "E", "G", 2, 0),
  m(7, "third_place", 8, "C", "G", 2, 1),
  m(8, "final", 9, "A", "E", 0, 1),
];

test("a knockout is one tie per pairing and stage, the third-place match apart, with the rounds numbered from the first", () => {
  const ko = knockoutOf(eight);
  assert.equal(ko.ties.length, 7);
  assert.equal(ko.third?.match_id, 7);
  assert.deepEqual(ko.stages, ["quarter", "semi", "final"]);
  assert.deepEqual(ko.round, [1, 1, 1, 1, 2, 2, 3]);
  assert.deepEqual(ko.ties[6].teams, ["A", "E"]);
  assert.equal(ko.ties[6].winner, "E");
});

test("the bracket puts one half down each side and the final in the middle, each tie feeding the one its winner plays next", () => {
  const ko = knockoutOf(eight);
  const b = buildBracket(ko.ties, ko.round, () => null);
  assert.equal(b.final?.i, 6);
  assert.equal(b.sides.length, 2);
  assert.deepEqual(b.columns, [1, 2]);
  assert.deepEqual(b.sides[0].boxes.map((x) => x.i).sort(), [0, 1, 4]);
  assert.deepEqual(b.sides[1].boxes.map((x) => x.i).sort(), [2, 3, 5]);
  const semiA = b.sides[0].boxes.find((x) => x.i === 4)!;
  assert.equal(semiA.fed, true);
  assert.equal(semiA.to, b.final!.y, "a semi-final's line runs to the final");
  const q1 = b.sides[0].boxes.find((x) => x.i === 0)!, q2 = b.sides[0].boxes.find((x) => x.i === 1)!;
  assert.equal(semiA.y, (q1.y + q2.y) / 2, "a tie sits halfway between the two that feed it");
  assert.equal(b.other.length, 0);
});

test("a drawn match that was replayed is one tie, decided by the replay", () => {
  const ko = knockoutOf([
    m(1, "quarter", 6, "A", "B", 1, 1), m(2, "quarter", 6, "B", "A", 0, 1, { is_replay: true }),
    m(3, "quarter", 6, "C", "D", 2, 0), m(4, "semi", 7, "A", "C", 1, 0),
  ]);
  assert.equal(ko.ties.length, 3);
  const tie = ko.ties.find((t) => t.matches.length === 2)!;
  assert.equal(tie.winner, "A");
  assert.deepEqual(tie.matches.map((x) => x.match_id), [1, 2]);
  const b = buildBracket(ko.ties, ko.round, () => null);
  assert.equal(b.final?.i, ko.ties.findIndex((t) => t.stage_key === "semi"));
});

test("a tournament whose only knockout match is the final draws the final alone; a tie nobody won leads nowhere", () => {
  const only = knockoutOf([m(1, "third_place", 8, "A", "B", 1, 0), m(2, "final", 9, "C", "D", 1, 0)]);
  const b = buildBracket(only.ties, only.round, () => null);
  assert.equal(b.final?.i, 0);
  assert.equal(b.sides.length, 0);
  const ties: Tie[] = [{ teams: [1, 2], winner: null, start: "1" }, { teams: [1, 3], winner: 1, start: "2" }];
  assert.equal(buildBracket(ties, [1, 2], () => null).final?.i, 1);
});

test("two halves take the conferences' names when the conferences split them cleanly", () => {
  const ko = knockoutOf(eight);
  const conf = (t: string) => (["A", "B", "C", "D"].includes(t) ? { name: "West", short: null } : { name: "East", short: null });
  const b = buildBracket(ko.ties, ko.round, conf);
  assert.deepEqual(b.sides.map((s) => s.label), ["West", "East"]);
});

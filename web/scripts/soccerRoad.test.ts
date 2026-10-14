import assert from "node:assert/strict";
import { test } from "node:test";
import { roadToFinal } from "@johnmorrisdotca/taisen-brackets/road";
import type { Match } from "../src/lib/soccer.ts";
import { deciderOf, roadOf, roundKey, type RoadTeam } from "../src/lib/soccerRoad.ts";
import { PHRASES } from "../src/lib/i18n/phrases.constants.ts";

/** Run in web/: pnpm test:road */

let id = 0;
const ORDER: Record<string, number> = { group: 1, second_group: 2, final_round: 3, round_of_32: 4, round_of_16: 5, quarter: 6, semi: 7, third_place: 8, final: 9 };
const m = (stage: string, day: number, home: string, hg: number, ag: number, away: string, over: Partial<Match> = {}): Match => ({
  match_id: ++id, source_key: "x", league: "wc", year: 2000, tournament_id: "WC-2000", stage_key: stage, stage_order: ORDER[stage] ?? 1, group_name: null, match_number: null,
  match_date: `2000-06-${String(day).padStart(2, "0")}`, kickoff_local: null, utc_offset: null,
  home_team_id: home, home: home, home_slug: home.toLowerCase(), home_flag: null, home_goals: hg,
  away_team_id: away, away: away, away_slug: away.toLowerCase(), away_flag: null, away_goals: ag,
  home_goals_90: null, away_goals_90: null, extra_time: false, shootout: false, home_penalties: null, away_penalties: null,
  winner_team_id: hg === ag ? null : hg > ag ? home : away, is_replay: false, venue_name: null, venue_city: null, venue_country: null, venue_wikidata_id: null, venue_id: null,
  lineup_players: 0, goal_rows: 0, source: null, checked: null, ...over,
});
const team = (_m: Match, t: string): RoadTeam => ({ name: t, abbr: t.slice(0, 3).toUpperCase() });
const note = (k: "aet" | "pens" | "replay", p?: readonly [number, number]) => (k === "pens" ? `${p![0]}-${p![1]} pens` : k);

test("a final's road: each finalist's group matches are its group row, its knockout matches its path, from its own side, with the shoot-out", () => {
  const ms = [
    m("group", 1, "ARG", 1, 2, "KSA"), m("group", 5, "MEX", 0, 2, "ARG"), m("group", 9, "ARG", 2, 0, "POL"),
    m("group", 2, "FRA", 4, 1, "AUS"), m("group", 6, "DEN", 1, 2, "FRA"),
    m("round_of_16", 12, "ARG", 2, 1, "AUS"), m("round_of_16", 13, "FRA", 3, 1, "POL"),
    m("quarter", 16, "NED", 2, 2, "ARG", { shootout: true, extra_time: true, home_penalties: 3, away_penalties: 4, winner_team_id: "ARG" }),
    m("quarter", 17, "FRA", 2, 1, "ENG"),
    m("semi", 20, "ARG", 3, 0, "CRO"), m("semi", 21, "FRA", 2, 0, "MAR"),
    m("third_place", 24, "CRO", 2, 1, "MAR"),
    m("final", 25, "ARG", 3, 3, "FRA", { shootout: true, extra_time: true, home_penalties: 4, away_penalties: 2, winner_team_id: "ARG" }),
  ];
  const r = roadOf(ms, team, note)!;
  assert.ok(r && !r.finalRound);
  const [arg, fra] = r.finalists;
  assert.deepEqual([arg.name, fra.name], ["ARG", "FRA"], "the home side of the final is the first finalist");
  assert.deepEqual(arg.path.map((p) => p.round), ["round-of-16", "quarter-final", "semi-final"]);
  assert.deepEqual(arg.group?.map((g) => g.score), [[1, 2], [2, 0], [2, 0]], "scores are from the finalist's side, whichever side it played");
  assert.equal(arg.group?.length, 3);
  assert.equal(fra.group?.length, 2, "only the matches before the final count");
  const qf = arg.path[1];
  assert.deepEqual(qf.score, [2, 2]);
  assert.equal(qf.decidedBy, "pens");
  assert.deepEqual(qf.pens, [4, 3], "the shoot-out is the finalist's first, though it was the away side");
  assert.equal(qf.note, "4-3 pens");
  assert.deepEqual(r.final.score, [3, 3]);
  assert.deepEqual(r.final.pens, [4, 2]);
  assert.equal(r.entries.at(-1)?.stage, "final");
  assert.ok(!r.entries.some((e) => e.opponent === "MAR" && e.team === "ARG"), "the third-place match is nobody's road");
  assert.ok(!r.secondGroups);
  // And Taisen draws it, with a table that lists every match.
  const chart = roadToFinal(r.finalists, { final: r.final, size: "phone" });
  assert.ok(chart.draw().startsWith("<svg"));
  assert.ok(chart.table().includes("CRO"));
});

test("a drawn match that was replayed gives the replay a round of its own", () => {
  const ms = [
    m("round_of_16", 3, "ITA", 7, 1, "USA"), m("quarter", 5, "ITA", 1, 1, "ESP", { extra_time: true, winner_team_id: null }), m("quarter", 6, "ESP", 0, 1, "ITA", { is_replay: true }),
    m("semi", 9, "ITA", 1, 0, "AUT"), m("round_of_16", 4, "TCH", 3, 2, "ROU"), m("semi", 10, "TCH", 3, 1, "GER"),
    m("final", 12, "ITA", 2, 1, "TCH", { extra_time: true }),
  ];
  const r = roadOf(ms, team, note)!;
  assert.deepEqual(r.finalists[0].path.map((p) => p.round), ["round-of-16", "quarter-final", "quarter-final-replay", "semi-final"]);
  assert.equal(r.finalists[0].path[2].note, "replay");
  assert.ok(r.rounds.some((x) => x.key === "quarter-final-replay" && x.replay && x.stage === "quarter"));
  assert.equal(r.final.decidedBy, "aet");
  assert.ok(roadToFinal(r.finalists, { final: r.final, size: "phone" }).draw());
});

test("1950 had no final: the last match of the final round stands as the final, and the other final-round matches are the group row", () => {
  const ms = [
    m("group", 1, "BRA", 4, 0, "MEX"), m("group", 2, "URU", 8, 0, "BOL"),
    m("final_round", 9, "BRA", 7, 1, "SWE"), m("final_round", 9, "URU", 2, 2, "ESP"), m("final_round", 13, "BRA", 6, 1, "ESP"), m("final_round", 13, "URU", 3, 2, "SWE"),
    m("final_round", 16, "URU", 2, 1, "BRA"),
  ];
  const found = deciderOf(ms)!;
  assert.ok(found.finalRound);
  const r = roadOf(ms, team, note)!;
  assert.ok(r.finalRound && r.secondGroups);
  assert.deepEqual(r.finalists.map((f) => f.name), ["URU", "BRA"]);
  assert.equal(r.finalists[0].path.length, 0);
  assert.equal(r.finalists[0].group?.length, 3, "a group match and the two final-round matches before the deciding one");
  assert.deepEqual(r.final.score, [2, 1]);
  assert.ok(roadToFinal(r.finalists, { final: r.final, size: "phone" }).draw());
});

test("a tournament with neither a final nor a final round has no road", () => {
  assert.equal(deciderOf([m("group", 1, "A", 1, 0, "B"), m("semi", 3, "A", 1, 0, "C")]), null);
  assert.equal(roadOf([m("group", 1, "A", 1, 0, "B")], team, note), null);
});

test("Taisen's round keys are used where it has words; any other stage is its key with dashes", () => {
  assert.deepEqual(["round_of_32", "round_of_16", "quarter", "semi"].map(roundKey), ["round-of-32", "round-of-16", "quarter-final", "semi-final"]);
  assert.equal(roundKey("third_place"), "third-place");
});

test("every road phrase is written", () => {
  for (const k of ["wc.t.road", "wc.road.decider", "wc.road.groups", "wc.road.groupsMulti", "wc.road.pens", "wc.road.aria", "wc.road.noFinal", "wc.road.table", "wc.road.opponent"] as const) assert.ok(PHRASES[k], k);
});

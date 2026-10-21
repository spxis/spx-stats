import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allStarEventSchema, allStarGameSchema, allStarMvpSchema, allStarSelectionSchema, allStarPath, eventsOfSeason, isTie, partsOf, personRows, reasonOf, rosterSides, roleRank, scoreLine,
  type AllStarEvent, type AllStarLeague, type AllStarSelection,
} from "../src/lib/allStarView.ts";

/** Run in web/: pnpm test:allstar (the All-Star Game pages' pure helpers; docs/all-star-games.md). */
const ev = (o: Partial<AllStarEvent>): AllStarEvent => ({
  league: "nhl", year: 2024, event_no: 1, season_year: 2023, status: "played", status_reason: null, format: null, first_day: "2024-02-03", last_day: null,
  venue_name: "Scotiabank Arena", city_text: "Toronto, Ontario", venue_wikidata_id: "Q1", host_name: null, host_franchise: null, attendance: null, source: "wikipedia", ...o,
});
const sel = (seq: number, side: string | null, role: string | null, name: string, o: Partial<AllStarSelection> = {}): AllStarSelection =>
  ({ league: "nba", year: 2024, event_no: 1, seq, side, role, grp: null, position: null, name, team_name: null, person_id: null, ...o });

test("the addresses of the list and of a year", () => {
  assert.equal(allStarPath("nhl"), "/nhl/all-star");
  assert.equal(allStarPath("nfl", 1951), "/nfl/all-star/1951");
});

test("the views' rows are read as they are served, and a row of the wrong shape is refused", () => {
  assert.ok(allStarEventSchema.safeParse({ league: "nhl", year: 2024, event_no: 1, season_year: 2023, status: "played", status_reason: null, format: "tournament", first_day: "2024-02-03", last_day: null,
    venue_name: "x", city_text: null, venue_wikidata_id: null, host_name: null, host_franchise: null, attendance: 18000, source: "wikipedia" }).success);
  assert.ok(!allStarEventSchema.safeParse({ league: "nhl", year: "2024" }).success);
  assert.ok(allStarGameSchema.safeParse({ league: "nhl", year: 2024, event_no: 1, game_no: 1, stage: "final", side1_name: "A", side1_score: 7, side1_franchise: null, side2_name: "B", side2_score: 4, side2_franchise: null, decided_by: null }).success);
  assert.ok(allStarMvpSchema.safeParse({ league: "nhl", year: 2024, event_no: 1, seq: 1, kind: null, name: "Auston Matthews", team_name: "Toronto Maple Leafs", person_id: 7 }).success);
  assert.ok(allStarSelectionSchema.safeParse({ league: "nba", year: 2024, event_no: 1, seq: 1, side: "East", role: "starter", grp: null, position: "G", name: "x", team_name: null, person_id: null }).success);
});

test("a season holds the game played in the next calendar year (the NHL's 2023-24 season holds the game of February 2024)", () => {
  const events = [ev({ year: 2024, season_year: 2023 }), ev({ year: 2023, season_year: 2022 }), ev({ year: 1959, event_no: 2, season_year: 1959 }), ev({ year: 1959, event_no: 1, season_year: 1959 })];
  assert.deepEqual(eventsOfSeason(events, 2023).map((e) => e.year), [2024]);
  assert.deepEqual(eventsOfSeason(events, 1959).map((e) => e.event_no), [1, 2], "two games in one season, in order");
  assert.deepEqual(eventsOfSeason(events, 1800), []);
});

test("a result reads as the list prints it, and a tie is one", () => {
  const g = { side1_name: "East", side1_score: 211, side2_name: "West", side2_score: 186 };
  assert.equal(scoreLine(g), "East 211–186 West");
  assert.equal(isTie(g), false);
  assert.equal(isTie({ side1_score: 7, side2_score: 7 }), true);
});

test("the games and Most Valuable Players of an event are found by the year and the event number", () => {
  const data: AllStarLeague = {
    events: [ev({}), ev({ year: 1959, event_no: 2 })],
    games: [
      { league: "nhl", year: 2024, event_no: 1, game_no: 2, stage: "semifinal", side1_name: "C", side1_score: 6, side1_franchise: null, side2_name: "D", side2_score: 5, side2_franchise: null, decided_by: null },
      { league: "nhl", year: 2024, event_no: 1, game_no: 1, stage: "semifinal", side1_name: "A", side1_score: 4, side1_franchise: null, side2_name: "B", side2_score: 3, side2_franchise: null, decided_by: null },
      { league: "nhl", year: 1959, event_no: 2, game_no: 1, stage: null, side1_name: "E", side1_score: 1, side1_franchise: null, side2_name: "F", side2_score: 0, side2_franchise: null, decided_by: null },
    ],
    mvps: [{ league: "nhl", year: 2024, event_no: 1, seq: 1, kind: null, name: "Auston Matthews", team_name: null, person_id: 1 }],
  };
  const p = partsOf(data, { year: 2024, event_no: 1 });
  assert.deepEqual(p.games.map((x) => x.game_no), [1, 2]);
  assert.equal(p.mvps.length, 1);
  assert.deepEqual(partsOf(data, { year: 1959, event_no: 2 }).games.map((x) => x.side1_name), ["E"]);
  assert.deepEqual(partsOf(data, { year: 1959, event_no: 1 }), { games: [], mvps: [] });
});

test("why a game was not held: a code the site has no word for reads as other", () => {
  assert.equal(reasonOf("lockout"), "lockout");
  assert.equal(reasonOf("olympics"), "olympics");
  assert.equal(reasonOf("aliens"), "other");
  assert.equal(reasonOf(null), "other");
});

test("a roster is a block per side in the article's order, starters first within a side", () => {
  const sides = rosterSides([
    sel(4, "West", "starter", "W1"), sel(1, "East", "reserve", "E2"), sel(2, "East", "starter", "E1"), sel(3, "East", "replacement", "E3"), sel(5, "West", "reserve", "W2"), sel(6, "East", "starter", "E1b"),
  ]);
  assert.deepEqual(sides.map((s) => s.side), ["East", "West"], "first line seen first");
  assert.deepEqual(sides[0].groups.map((g) => [g.role, g.players.map((p) => p.name)]), [["starter", ["E1", "E1b"]], ["reserve", ["E2"]], ["replacement", ["E3"]]]);
  assert.equal(sides[0].count, 4);
  assert.deepEqual(rosterSides([]), []);
  assert.deepEqual(rosterSides([sel(1, null, null, "A")]).map((s) => [s.side, s.groups.length]), [[null, 1]], "an article with no sides keeps its lines together");
  assert.ok(roleRank("starter") < roleRank("reserve") && roleRank("reserve") < roleRank("replacement") && roleRank("replacement") < roleRank("goaltenders") && roleRank("goaltenders") < roleRank(null));
});

test("a person's games: one row per game, an MVP who was also picked is one row marked MVP, newest first", () => {
  const rows = personRows(
    [sel(1, "East", "starter", "A", { year: 1999, position: "C", team_name: "Rangers" }), sel(2, "East", "reserve", "A", { year: 1998 })],
    [{ league: "nba", year: 1999, event_no: 1, seq: 1, kind: null, name: "A", team_name: "Rangers", person_id: 5 }, { league: "nba", year: 1983, event_no: 1, seq: 1, kind: null, name: "A", team_name: "Oilers", person_id: 5 }],
  );
  assert.deepEqual(rows.map((r) => [r.year, r.mvp, r.role]), [[1999, true, "starter"], [1998, false, "reserve"], [1983, true, null]]);
  assert.deepEqual(personRows([], []), []);
});

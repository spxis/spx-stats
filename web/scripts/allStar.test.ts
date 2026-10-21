import assert from "node:assert/strict";
import { test } from "node:test";
import { clubMatcher } from "../src/lib/allStarClubs.ts";
import { resultOf } from "../src/lib/allStarResult.ts";
import {
  decidingGame, gameSides, knockoutDrawing, monogram, realGames, seriesResult, shapeOf, sideColours, type AllStarGame,
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

const game = (no: number, stage: string | null, a: string, as: number, b: string, bs: number, o: Partial<AllStarGame> = {}): AllStarGame =>
  ({ league: "nhl", year: 2024, event_no: 1, game_no: no, stage, side1_name: a, side1_score: as, side1_franchise: null, side2_name: b, side2_score: bs, side2_franchise: null, decided_by: null, ...o });
const tournament = [
  game(1, "semifinal", "Team McDavid", 4, "Team MacKinnon", 3), game(2, "semifinal", "Team Matthews", 6, "Team Hughes", 5), game(3, "final", "Team Matthews", 7, "Team McDavid", 4),
];

test("how an event is drawn: a bracket, a series, a single game, a few games, nothing", () => {
  assert.equal(shapeOf(ev({ format: "tournament" }), tournament), "bracket");
  assert.equal(shapeOf(ev({}), [game(1, null, "East", 7, "West", 4)]), "single");
  assert.equal(shapeOf(ev({ format: "series" }), [game(1, "game 1", "A", 4, "B", 2), game(2, "game 2", "B", 5, "A", 4)]), "series");
  assert.equal(shapeOf(ev({}), [game(1, "round-robin 1", "A", 4, "B", 2), game(2, "round-robin 2", "B", 5, "C", 4), game(3, "championship", "A", 4, "C", 2)]), "games", "a lone final after a round robin is no bracket");
  assert.equal(shapeOf(ev({ status: "cancelled" }), []), "none");
  assert.equal(shapeOf(ev({}), []), "none");
});

test("the aggregate line a series' list ends with is not a game", () => {
  const rows = [game(1, "game 1", "NHL All-Stars", 4, "Soviet Union", 3), game(2, "game 2", "Soviet Union", 5, "NHL All-Stars", 3), game(3, "game 3", "Soviet Union wins", 8, "on aggregate", 7)];
  assert.equal(realGames(rows).length, 2);
  const r = seriesResult(rows)!;
  assert.equal(r.by, "aggregate", "one game each: the goals decide");
  assert.deepEqual(r.goals, [7, 8]);
  assert.equal(r.a.name, "NHL All-Stars");
  const two = [game(1, "game 1", "A", 4, "B", 2), game(2, "game 2", "B", 1, "A", 3), game(3, "game 3", "B", 2, "A", 1)];
  const w = seriesResult(two)!;
  assert.equal(w.by, "games");
  assert.deepEqual([w.a.score, w.b.score], [2, 1]);
});

test("a tournament is a bracket only when the final's sides are the semifinals' winners", () => {
  const d = knockoutDrawing(tournament)!;
  assert.deepEqual(d.round, [1, 1, 2]);
  assert.deepEqual(d.ties.map((t) => t.winner), ["Team McDavid", "Team Matthews", "Team Matthews"]);
  assert.equal(d.sides.length, 4);
  assert.equal(knockoutDrawing([tournament[0], tournament[1], game(3, "final", "Team Hughes", 7, "Team McDavid", 4)]), null, "Hughes lost its semifinal");
  assert.equal(knockoutDrawing([tournament[2]]), null);
  assert.equal(decidingGame(tournament)!.game_no, 3);
});

test("the sides of a game: the host club on the right, else West before East and any other pair by name, never by who won", () => {
  const eastWest = game(1, null, "East", 7, "West", 4);
  assert.deepEqual(gameSides(eastWest, null).order, [1, 0], "West on the left though East is printed first");
  assert.equal(gameSides(game(1, null, "National League", 3, "American League", 1), null).left.name, "American League");
  assert.equal(gameSides(game(1, null, "Team Matthews", 7, "Team McDavid", 4), null).left.name, "Team Matthews");
  const host = game(1, null, "All–Stars", 4, "Maple Leafs", 3, { side2_franchise: 1428 });
  assert.equal(gameSides(host, 1428).right.name, "Maple Leafs");
  const host1 = game(1, null, "Red Wings", 7, "All–Stars", 1, { side1_franchise: 1412 });
  assert.equal(gameSides(host1, 1412).right.name, "Red Wings", "the host is on the right whichever way the list prints it");
});

test("a side that is no club gets letters and a colour, the same every time", () => {
  assert.equal(monogram("Team McDavid"), "MCD");
  assert.equal(monogram("American League"), "AL");
  assert.equal(monogram("East"), "E");
  assert.equal(monogram("Eastern Conference").length <= 3, true);
  assert.equal(monogram("AFC"), "AFC");
  assert.equal(monogram("All–Stars"), "AS");
  assert.deepEqual(sideColours(["East", "West"]), sideColours(["East", "West"]));
  const c = sideColours(["Team A", "Team B", "Team C"]);
  assert.equal(new Set(c).size, 3, "made-up sides are told apart");
  assert.notEqual(sideColours(["East", "West"])[0], sideColours(["East", "West"])[1]);
});

test("the banner and the card say who won, and how a series was settled", () => {
  const look = { logo: () => null, brand: () => null };
  const r = resultOf("nhl", look, ev({ format: "tournament" }), tournament)!;
  assert.equal(r.shape, "bracket");
  assert.equal(r.stage, "final");
  assert.deepEqual([r.left.name, r.right.name, r.left.score, r.right.score], ["Team Matthews", "Team McDavid", 7, 4]);
  assert.equal(r.winner, 0);
  const series = [game(1, "game 1", "NHL All-Stars", 4, "Soviet Union", 3), game(2, "game 2", "Soviet Union", 5, "NHL All-Stars", 3), game(3, "game 3", "Soviet Union wins", 8, "on aggregate", 7)];
  const s = resultOf("nhl", look, ev({ format: "series" }), series)!;
  assert.equal(s.by, "aggregate");
  assert.equal(s.winner, s.left.name === "Soviet Union" ? 0 : 1);
  assert.equal(resultOf("nhl", look, ev({ status: "cancelled" }), []), null);
});

test("a roster line names a club only when exactly one club of the season fits", () => {
  const m = clubMatcher([
    { franchise_id: 1, team: "Philadelphia Eagles", abbr: "PHI" }, { franchise_id: 2, team: "New York Giants", abbr: "NYG" }, { franchise_id: 3, team: "New York Jets", abbr: "NYJ" },
    { franchise_id: 4, team: "San Diego Chargers", abbr: "SD" }, { franchise_id: 5, team: "Chicago Cubs", abbr: "CHC" }, { franchise_id: 6, team: "Chicago White Sox", abbr: "CHW" },
  ]);
  assert.equal(m("Philadelphia Eagles"), 1);
  assert.equal(m("Philadelphia"), 1, "the city, when one club has it");
  assert.equal(m("Eagles"), 1, "the nickname");
  assert.equal(m("N.Y. Giants"), 2);
  assert.equal(m("New York"), null, "two New York clubs");
  assert.equal(m("Chicago"), null);
  assert.equal(m("Cubs"), 5);
  assert.equal(m("CHW"), 6, "the abbreviation");
  assert.equal(m("San Diego (AL)"), 4, "the league in brackets is dropped");
  assert.equal(m("Nowhere Knights"), null);
  assert.equal(m(null), null);
});

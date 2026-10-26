import assert from "node:assert/strict";
import { test } from "node:test";
import { europeClubPath, europeLeaguePath, europeSeasonPath, leagueOfSlug, leagueSlug, seasonLabel, yearOfSeasonLabel } from "../src/lib/europePath.ts";
import { clubCode, crossTable, tableFromMatches, winPoints, type EuropeMatch } from "../src/lib/europeView.ts";

/** Run in web/: pnpm test:europe */

test("addresses: a division is its code with hyphens, a season the start year and the last two digits of the end year", () => {
  assert.equal(europeLeaguePath("premier_league"), "/soccer/premier-league");
  assert.equal(europeSeasonPath("la_liga", 2012), "/soccer/la-liga/2012-13");
  assert.equal(europeSeasonPath("premier_league", 1999), "/soccer/premier-league/1999-00");
  assert.equal(europeClubPath("fc-barcelona"), "/soccer/club/fc-barcelona");
  assert.equal(leagueSlug("efl_league_one"), "efl-league-one");
  assert.equal(leagueOfSlug("efl-league-one"), "efl_league_one");
  assert.equal(leagueOfSlug("club"), null);
  assert.equal(leagueOfSlug("../x"), null);
  assert.equal(leagueOfSlug("Premier-League"), null);
});

test("season labels read back to the year, and only when the end is the year after", () => {
  assert.equal(seasonLabel(2005), "2005-06");
  assert.equal(yearOfSeasonLabel("2005-06"), 2005);
  assert.equal(yearOfSeasonLabel("1999-00"), 1999);
  assert.equal(yearOfSeasonLabel("2005-07"), null);
  assert.equal(yearOfSeasonLabel("2005"), null);
  assert.equal(yearOfSeasonLabel("2005-6"), null);
});

const m = (home_team_id: string, away_team_id: string, home_goals: number, away_goals: number, stage_key = "regular"): EuropeMatch => ({ home_team_id, away_team_id, home_goals, away_goals, stage_key });

test("points per win: three from the season the country changed, two before", () => {
  assert.equal(winPoints("england", 1980), 2);
  assert.equal(winPoints("england", 1981), 3);
  assert.equal(winPoints("italy", 1993), 2);
  assert.equal(winPoints("italy", 1994), 3);
  assert.equal(winPoints("spain", 1994), 2);
  assert.equal(winPoints("spain", 1995), 3);
  assert.equal(winPoints("germany", 1994), 2);
  assert.equal(winPoints("france", 1994), 3);
});

test("table from matches: points, goal difference, play-offs left out", () => {
  const ms = [m("a", "b", 2, 0), m("b", "a", 1, 1), m("a", "c", 0, 3), m("c", "b", 0, 0), m("b", "c", 5, 0, "playoff")];
  const t = tableFromMatches(ms, "england", 2005);
  assert.deepEqual(t.map((r) => r.team_id), ["c", "a", "b"].sort((x, y) => t.findIndex((r) => r.team_id === x) - t.findIndex((r) => r.team_id === y)));
  const by = Object.fromEntries(t.map((r) => [r.team_id, r]));
  assert.equal(by.a.points, 4); assert.equal(by.a.played, 3); assert.equal(by.a.goal_difference, -1);
  assert.equal(by.b.points, 2); assert.equal(by.b.played, 3);
  assert.equal(by.c.points, 4); assert.equal(by.c.goal_difference, 3);
  assert.equal(t[0].team_id, "c");
  // two points a win before 1981
  assert.equal(Object.fromEntries(tableFromMatches([m("a", "b", 1, 0)], "england", 1970).map((r) => [r.team_id, r.points])).a, 2);
});

test("cross table: the home club's score against each away club, regular season only", () => {
  const cell = crossTable([m("a", "b", 2, 0), m("b", "a", 1, 1), m("a", "b", 9, 9, "playoff")]);
  assert.deepEqual(cell("a", "b"), { hg: 2, ag: 0 });
  assert.deepEqual(cell("b", "a"), { hg: 1, ag: 1 });
  assert.equal(cell("a", "c"), null);
});

test("club code: three letters of the name without accents", () => {
  assert.equal(clubCode("Bayern München"), "BAY");
  assert.equal(clubCode("1. FC Köln"), "FCK");
  assert.equal(clubCode("Évian"), "EVI");
});

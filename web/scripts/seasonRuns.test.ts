import assert from "node:assert/strict";
import { test } from "node:test";
import { expandRuns, runsOf } from "../src/lib/seasonRuns.ts";
import { buildSlugs, type SeasonNameRow } from "../src/lib/slug.ts";

/** Run in web/: pnpm test:seasonruns. The address table reads a club's name as runs (api.team_season_name_run); they must give back every season. */

const seasons: SeasonNameRow[] = [
  { league: "nhl", year: 1990, franchise_id: 1, team: "Hartford Whalers" },
  { league: "nhl", year: 1991, franchise_id: 1, team: "Hartford Whalers" },
  { league: "nhl", year: 1992, franchise_id: 1, team: "Carolina Hurricanes" },
  { league: "nhl", year: 1994, franchise_id: 1, team: "Carolina Hurricanes" },
  { league: "nhl", year: 1995, franchise_id: 1, team: null },
  { league: "nhl", year: 1996, franchise_id: 1, team: "Carolina Hurricanes" },
  { league: "nhl", year: 1991, franchise_id: 2, team: "Boston Bruins" },
  { league: "nba", year: 1991, franchise_id: 1, team: "Boston Celtics" },
];

test("a run ends where the name changes, where a season is missing and where the name is missing", () => {
  const runs = runsOf(seasons);
  assert.deepEqual(runs.filter((r) => r.league === "nhl" && r.franchise_id === 1).map((r) => [r.team, r.from_year, r.to_year]), [
    ["Hartford Whalers", 1990, 1991], ["Carolina Hurricanes", 1992, 1992], ["Carolina Hurricanes", 1994, 1994], [null, 1995, 1995], ["Carolina Hurricanes", 1996, 1996],
  ]);
  assert.equal(runs.length, 7);
});

test("the runs give back every season in the order the index gives them, and the same addresses", () => {
  const order = [...seasons].sort((a, b) => (a.league < b.league ? -1 : a.league > b.league ? 1 : a.year - b.year || a.franchise_id - b.franchise_id));
  assert.deepEqual(expandRuns(runsOf(seasons)), order);
  assert.deepEqual(buildSlugs([], expandRuns(runsOf(seasons))), buildSlugs([], order));
});

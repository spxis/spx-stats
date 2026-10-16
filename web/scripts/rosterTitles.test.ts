import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { countedRoster, cupWinnerCount } from "../src/lib/titles.ts";

/** Run in web/: pnpm test:titles. Career championships on a roster, the same count as the player page (api.people.championship_count). */

test("a cup winner is a player with at least one career championship", () => {
  assert.equal(cupWinnerCount([0, 4, 0, 1]), 2);
  assert.equal(cupWinnerCount([0, 0]), 0);
  assert.equal(cupWinnerCount([]), 0);
  assert.equal(cupWinnerCount([null, undefined, 0, 3]), 1, "a missing count is not a winner");
});

test("released players and the practice squad are not on the roster that is counted", () => {
  const rows = [
    { id: 1, status: "ACT" },
    { id: 2, status: "CUT" },
    { id: 3, status: "DEV" },
    { id: 4, status: null },
    { id: 5, status: "RES" },
  ];
  assert.deepEqual(countedRoster(rows).map((p) => p.id), [1, 4, 5]);
  assert.deepEqual(countedRoster([{ id: 9 }]).map((p) => p.id), [9], "a statistics roster has no status and stays");
});

test("the roster and the players list read championship_count, and do not invent another total", () => {
  const roster = readFileSync(new URL("../src/lib/roster.ts", import.meta.url), "utf8");
  const titles = readFileSync(new URL("../src/lib/playerTitles.ts", import.meta.url), "utf8");
  const players = readFileSync(new URL("../src/app/[locale]/q/players/page.tsx", import.meta.url), "utf8");
  const season = readFileSync(new URL("../src/app/[locale]/q/[league]/[year]/team/[franchise]/page.tsx", import.meta.url), "utf8");
  assert.match(roster, /championship_count/);
  assert.match(titles, /select=person_id,championship_count/);
  assert.match(players, /championshipCounts/);
  assert.match(season, /cupWinnerCount/);
  assert.doesNotMatch(roster + titles, /create table|create materialized view/i);
});

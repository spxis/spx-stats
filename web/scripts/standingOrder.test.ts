import assert from "node:assert/strict";
import { test } from "node:test";
import { compareSeasonTable, type SeasonTableRow } from "../src/lib/standingOrder.ts";

/** Run in web/: pnpm test:standingorder */
const club = (team: string, team_id: number, w: number, pct: number | null): SeasonTableRow => ({ team, team_id, w, pct });

/** Every order of the rows, so the result cannot depend on the order the database gave them. */
function permutations<T>(list: readonly T[]): T[][] {
  if (list.length <= 1) return [[...list]];
  return list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((p) => [x, ...p]));
}

const tied = [
  club("Montreal Alouettes", 161801, 13, 0.722),
  club("Edmonton Elks", 161796, 13, 0.722),
  club("Calgary Stampeders", 161798, 9, 0.5),
  club("BC Lions", 161799, 10, 0.556),
  club("Saskatchewan Roughriders", 161802, 10, 0.556),
  club("Toronto Argonauts", 161806, 9, 0.5),
  club("Winnipeg Blue Bombers", 161807, 9, 0.5),
];

test("tied clubs come out in the same order whatever order the rows came in", () => {
  const want = [...tied].sort(compareSeasonTable).map((r) => r.team_id);
  for (const p of permutations(tied)) {
    assert.deepEqual([...p].sort(compareSeasonTable).map((r) => r.team_id), want);
  }
});

test("the page's ranking is kept: percentage, then wins; ties by name, then id", () => {
  const got = [...tied].sort(compareSeasonTable).map((r) => r.team);
  assert.deepEqual(got, [
    "Edmonton Elks", "Montreal Alouettes",
    "BC Lions", "Saskatchewan Roughriders",
    "Calgary Stampeders", "Toronto Argonauts", "Winnipeg Blue Bombers",
  ]);
});

test("a null percentage ranks last; equal percentages and wins go by name", () => {
  const rows = [club("Zeta", 2, 5, null), club("Alpha", 1, 5, 0.5), club("Beta", 3, 1, 0.1)];
  assert.deepEqual([...rows].sort(compareSeasonTable).map((r) => r.team), ["Alpha", "Beta", "Zeta"]);
});

test("two rows with the same name fall back to their id", () => {
  const rows = [club("Same", 9, 4, 0.4), club("Same", 7, 4, 0.4)];
  assert.deepEqual([...rows].sort(compareSeasonTable).map((r) => r.team_id), [7, 9]);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { footballGroups, FOOTBALL_GROUPS } from "../src/lib/football.ts";
import { FOOTBALL_LEAGUES, FOOTBALL_PATH, menuEntries, menuFamilyOf } from "../src/lib/leagueFamilies.ts";
import { isLeague, LEAGUE_CODES } from "../src/lib/leagues.ts";
import { ALWAYS_STATIC, resolvePageDestination } from "../src/lib/routing.ts";

test("/football is a page of its own, not a league slug, and is a kept page that reads no query", () => {
  assert.equal(FOOTBALL_PATH, "/football");
  assert.ok(!(LEAGUE_CODES as readonly string[]).includes("football") && !isLeague("football"));
  assert.ok((ALWAYS_STATIC as readonly string[]).includes("football"));
  assert.equal(resolvePageDestination("/football/anything"), "/en/q/football/anything", "no page below it");
  assert.ok(resolvePageDestination("/football") === "/en/s/football");
});

test("the menu has one Football entry, no plus, where the NFL was, and every football league and the page itself light it", () => {
  const menu = menuEntries();
  assert.equal(menu.filter((m) => m.id === "football").length, 1);
  assert.equal(menu.find((m) => m.id === "football")!.label, "Football");
  for (const code of ["nfl", "afl", "aafc", "ncaaf", "cfl", "football"]) assert.equal(menuFamilyOf(code), "football");
  assert.deepEqual([...FOOTBALL_LEAGUES], ["nfl", "ncaaf", "cfl"]);
  assert.deepEqual(FOOTBALL_GROUPS.map((g) => g.code), [...FOOTBALL_LEAGUES]);
});

test("the football page lists each league on its own, the AFL and the AAFC under the NFL, and leaves out a league with no season", () => {
  const seasons = [
    { league: "nfl", year: 1920, label: "1920", champion: null },
    { league: "nfl", year: 1921, label: "1921", champion: "Chicago Staleys" },
    { league: "afl", year: 1960, label: "1960", champion: "Houston Oilers" },
    { league: "cfl", year: 2024, label: "2024", champion: "Toronto Argonauts" },
  ];
  const groups = footballGroups(seasons);
  assert.deepEqual(groups.map((g) => g.code), ["nfl", "cfl"], "college football has no season here, so it is left out");
  const nfl = groups[0];
  assert.deepEqual([nfl.first, nfl.last, nfl.seasons, nfl.champions], ["1920", "1921", 2, 1], "the AFL's season is not counted in the NFL's");
  assert.deepEqual(nfl.rivals.map((r) => [r.code, r.seasons, r.champions]), [["afl", 1, 1]]);
});

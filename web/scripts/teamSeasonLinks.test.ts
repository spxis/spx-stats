import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSlugs, makePaths, parseSeasonSeg, resolveTeamSeason, tableOf, type NameRow, type SeasonNameRow } from "../src/lib/slug.ts";
import { isLeague } from "../src/lib/leagues.ts";

/**
 * The link of every standings row is a team-season address (/<league>/<season>/team/<slug>). It must read back as that team in that season for every
 * league, the women's leagues (NWSL, WNBA, PWHL) included: a 404 on those links was reported on 2026-10-18 (it could not be reproduced afterwards, on the current code against production data;
 * a stale cached copy of the slug data is the likely cause). The live check over every season of every league is `node scripts/check-slugs.ts`. Run in web/: pnpm test:teamlinks
 */

const name = (league: string, franchise_id: number, n: string, from: string | null = null, to: string | null = null): NameRow => ({ league, franchise_id, name: n, name_from: from, name_to: to });
const season = (league: string, year: number, franchise_id: number, team: string): SeasonNameRow => ({ league, year, franchise_id, team });

const names: NameRow[] = [
  name("nwsl", 1810, "Kansas City Current", "2021-01-01"), name("nwsl", 1811, "Gotham FC", "2021-01-01"), name("nwsl", 1812, "NJ/NY Gotham FC", "2013-01-01", "2020-12-31"),
  name("wnba", 1788, "Portland Fire", "2000-01-01", "2002-12-31"), name("wnba", 1790, "Portland Fire", "2026-01-01"), name("wnba", 380, "New York Liberty", "1997-01-01"),
  name("pwhl", 5, "Boston Fleet", "2023-01-01"), name("pwhl", 6, "Toronto Sceptres", "2023-01-01"),
  name("nba", 1, "Boston Celtics", "1946-01-01"),
];
const seasons: SeasonNameRow[] = [
  season("nwsl", 2025, 1810, "Kansas City Current"), season("nwsl", 2025, 1811, "Gotham FC"), season("nwsl", 2019, 1812, "NJ/NY Gotham FC"), season("nwsl", 2021, 1811, "NJ/NY Gotham FC"),
  season("wnba", 2002, 1788, "Portland Fire"), season("wnba", 2026, 1790, "Portland Fire"), season("wnba", 2024, 380, "New York Liberty"),
  season("pwhl", 2024, 5, "Boston Fleet"), season("pwhl", 2025, 6, "Toronto Sceptres"),
  season("nba", 2023, 1, "Boston Celtics"),
];

const slugs = buildSlugs(names, seasons);
const paths = makePaths(tableOf(slugs));

test("the women's leagues are leagues of the site, and a calendar-year season reads as itself", () => {
  for (const lg of ["nwsl", "wnba", "pwhl", "nba"]) assert.ok(isLeague(lg), lg);
  assert.deepEqual(parseSeasonSeg("nwsl", "2025"), { y: 2025, canonical: true });
  assert.deepEqual(parseSeasonSeg("wnba", "2024"), { y: 2024, canonical: true });
  assert.deepEqual(parseSeasonSeg("pwhl", "2024-25"), { y: 2024, canonical: true });
});

test("every team-season address built for a season resolves back to that team, by slug and by the old numeric id", () => {
  for (const s of seasons) {
    const path = paths.teamSeason(s.league, s.franchise_id, s.year);
    const [, , seg, , slug] = path.split("/");
    const L = slugs.leagues[s.league];
    assert.ok(L, `${s.league} has slugs`);
    assert.equal(parseSeasonSeg(s.league, seg)?.y, s.year, path);
    assert.equal(resolveTeamSeason(L, s.year, slug), s.franchise_id, path);
    assert.equal(resolveTeamSeason(L, s.year, String(s.franchise_id)), s.franchise_id, `${path} by id`);
  }
});

test("the Kansas City Current's links, as the standings table writes them", () => {
  assert.equal(paths.teamSeason("nwsl", 1810, 2025), "/nwsl/2025/team/kansas-city-current");
  assert.equal(resolveTeamSeason(slugs.leagues.nwsl, 2025, "kansas-city-current"), 1810);
  assert.equal(resolveTeamSeason(slugs.leagues.nwsl, 2025, "gotham-fc"), 1811);
  assert.equal(resolveTeamSeason(slugs.leagues.wnba, 2024, "new-york-liberty"), 380);
});

test("a league that is missing from the slug data resolves nothing (the address is a 404), so the data must never lose a league", () => {
  const without = buildSlugs(names.filter((n) => n.league === "nba"), seasons.filter((s) => s.league === "nba"));
  assert.equal(resolveTeamSeason(without.leagues.nwsl, 2025, "kansas-city-current"), null);
  assert.equal(resolveTeamSeason(without.leagues.nba, 2023, "boston-celtics"), 1);
});

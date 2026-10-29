import assert from "node:assert/strict";
import { test } from "node:test";
import { independentRuns, parentsOfSeason, parentStays, farmStays, type Affiliation } from "../src/lib/affiliationView.ts";
import { familyOf, menuEntries, menuFamilyOf, MORE_HOCKEY_PATH } from "../src/lib/leagueFamilies.ts";
import { ALL_LEAGUES, CHILDREN, isMoreHockey, LEAGUE_CODES, LEAGUES, MORE_HOCKEY_LEVEL, PARENT, RELATED_LEAGUES, seasonLabel, seasonSeg, topLeague } from "../src/lib/leagues.ts";
import { moreHockeyGroups } from "../src/lib/moreHockey.ts";
import { PAGE_ROOTS, resolvePageDestination } from "../src/lib/routing.ts";
import { finalName } from "../src/lib/series.ts";
import { leagueTrail } from "../src/lib/otherLeagues.ts";

test("the AHL is a league of its own on the More hockey page: no parent, no menu entry, never counted with the NHL", () => {
  assert.ok(LEAGUE_CODES.includes("ahl"));
  assert.ok(isMoreHockey("ahl") && !isMoreHockey("nhl") && !isMoreHockey("wha") && !isMoreHockey("toString"));
  assert.ok(!("ahl" in PARENT) && !CHILDREN.nhl?.includes("ahl") && !RELATED_LEAGUES.nhl?.includes("ahl"));
  assert.equal(topLeague("ahl"), "ahl");
  assert.ok(!LEAGUES.some((l) => l.code === "ahl"), "the pickers and the menu list the leagues of the menu only");
  assert.ok(ALL_LEAGUES.some((l) => l.code === "ahl" && l.short === "AHL"));
  assert.equal(leagueTrail(["ahl", "1985"]), null, "the NHA-style trail is for a league with a parent");
  assert.deepEqual(MORE_HOCKEY_LEVEL, { ahl: "minor", echl: "minor" });
});

test("the ECHL is another league of the minor level: a league of its own, no parent, no menu entry, listed after the AHL", () => {
  assert.ok(LEAGUE_CODES.includes("echl") && isMoreHockey("echl"));
  assert.ok(!("echl" in PARENT) && !CHILDREN.nhl?.includes("echl") && !CHILDREN.ahl?.includes("echl") && !RELATED_LEAGUES.nhl?.includes("echl"));
  assert.equal(topLeague("echl"), "echl");
  assert.ok(!LEAGUES.some((l) => l.code === "echl"));
  assert.ok(ALL_LEAGUES.some((l) => l.code === "echl" && l.short === "ECHL"));
  assert.equal(familyOf("echl"), undefined);
  assert.equal(menuFamilyOf("echl"), "nhl");
  assert.equal(leagueTrail(["echl", "1996"]), null);
  assert.deepEqual(Object.keys(MORE_HOCKEY_LEVEL), ["ahl", "echl"]);
});

test("the rival hockey leagues stay under the NHL's Other leagues and the NHL family does not hold the AHL", () => {
  assert.deepEqual(familyOf("nhl")?.members, ["nhl", "pwhl", "nha", "pcha", "wchl", "wha"]);
  assert.equal(familyOf("ahl"), undefined);
  assert.deepEqual(CHILDREN.nhl, ["nha", "pcha", "wchl", "wha"]);
});

test("the menu gets no per-league item: the AHL and the page lights the NHL tab and the one More hockey link", () => {
  assert.equal(menuFamilyOf("ahl"), "nhl");
  assert.equal(menuFamilyOf("more-hockey"), "nhl");
  assert.equal(MORE_HOCKEY_PATH, "/more-hockey");
  const hrefs = menuEntries().map((m) => m.href);
  assert.ok(!hrefs.includes("/ahl") && !hrefs.includes("/more-hockey"));
  assert.equal(hrefs.length, 7);
});

test("a season of the AHL is 1985-86 in the address and for the reader, and a final is the Calder Cup Final", () => {
  assert.equal(seasonSeg("ahl", 1985), "1985-86");
  assert.equal(seasonLabel("ahl", 1998), "1998-99");
  assert.equal(seasonLabel("ahl", 1999), "1999-2000");
  const say = ((k: string) => ({ "final.ahl": "Calder Cup Final", "final.other": "Final" })[k] ?? k) as never;
  assert.equal(finalName("ahl", 1985, say), "Calder Cup Final");
});

test("/more-hockey is a kept page that reads no query; the AHL's addresses are league pages", () => {
  const route = (path: string, query: Record<string, string> = {}) => resolvePageDestination(path, query, null, null);
  assert.equal(route("/more-hockey"), "/en/s/more-hockey");
  assert.equal(route("/more-hockey", { sort: "x" }), "/en/s/more-hockey");
  assert.equal(route("/ahl"), "/en/s/ahl");
  assert.equal(route("/ahl/1985-86"), "/en/s/ahl/1985-86");
  assert.equal(route("/ahl/1985-86", { phase: "p" }), "/en/q/ahl/1985-86");
  assert.ok((PAGE_ROOTS as readonly string[]).includes("ahl"));
});

test("a season of the ECHL is 1996-97 in the address, a final is the Kelly Cup Final, and its addresses are league pages", () => {
  assert.equal(seasonSeg("echl", 1996), "1996-97");
  assert.equal(seasonLabel("echl", 1999), "1999-2000");
  const say = ((k: string) => ({ "final.echl": "Kelly Cup Final", "final.echlOld": "Riley Cup Final", "final.other": "Final" })[k] ?? k) as never;
  assert.equal(finalName("echl", 2001, say), "Kelly Cup Final");
  assert.equal(finalName("echl", 1996, say), "Kelly Cup Final", "the 1996-97 champion was the first to lift the Kelly Cup");
  assert.equal(finalName("echl", 1995, say), "Riley Cup Final");
  const route = (path: string, query: Record<string, string> = {}) => resolvePageDestination(path, query, null, null);
  assert.equal(route("/echl"), "/en/s/echl");
  assert.equal(route("/echl/1996-97"), "/en/s/echl/1996-97");
  assert.equal(route("/echl/1996-97", { phase: "p" }), "/en/q/echl/1996-97");
  assert.ok((PAGE_ROOTS as readonly string[]).includes("echl"));
});

const season = (league: string, year: number, champion: string | null, franchise: number | null = null) => ({ league, year, label: seasonLabel(league, year), champion, champion_franchise: franchise });

test("More hockey lists only the leagues the archive holds, by level, with years, seasons, champions and the latest champion", () => {
  assert.deepEqual(moreHockeyGroups([season("nhl", 2000, "Devils")]), [], "no AHL season: nothing to list, not even a level");
  const g = moreHockeyGroups([season("ahl", 1936, "Syracuse Stars", 1), season("ahl", 1937, "Syracuse Stars", 1), season("ahl", 2019, null), season("ahl", 2018, "Charlotte Checkers", 7), season("nhl", 2018, "Capitals", 9)]);
  assert.equal(g.length, 1);
  assert.equal(g[0].level, "minor");
  const [ahl] = g[0].leagues;
  assert.deepEqual([ahl.code, ahl.short, ahl.first, ahl.last, ahl.seasons, ahl.champions], ["ahl", "AHL", "1936-37", "2019-20", 4, 3]);
  assert.deepEqual(ahl.latest, { year: 2018, label: "2018-19", champion: "Charlotte Checkers", franchise: 7 });
  const two = moreHockeyGroups([season("echl", 2024, "Trois-Rivieres Lions", 5), season("echl", 1988, "Carolina Thunderbirds", 4), season("ahl", 2018, "Charlotte Checkers", 7)]);
  assert.deepEqual(two[0].leagues.map((l) => [l.code, l.first, l.last, l.seasons]), [["ahl", "2018-19", "2018-19", 1], ["echl", "1988-89", "2024-25", 2]], "the AHL, then the ECHL, in one level");
});

const row = (year: number, f: number, position: number, label: string, parent: number | null, team = "Club", parentTeam: string | null = null): Affiliation => ({
  league: "ahl", year, franchise_id: f, position, label, parent_league: parent == null ? null : "nhl", parent_franchise_id: parent, team, parent_team: parentTeam,
});

test("a club's affiliations are stays: seasons that follow one another under one NHL club; two parents in a season are two stays", () => {
  const rows = [
    row(2003, 1, 1, "COL", 11, "Hershey", "Colorado Avalanche"), row(2004, 1, 1, "COL", 11, "Hershey", "Colorado Avalanche"), row(2005, 1, 1, "WSH", 12, "Hershey", "Washington Capitals"),
    row(2006, 1, 1, "WSH", 12, "Hershey", "Washington Capitals"), row(2006, 1, 2, "BOS", 13, "Hershey", "Boston Bruins"),
    row(2009, 1, 1, "WSH", 12, "Hershey", "Washington Capitals"), row(2010, 1, 1, "independent", null), row(2011, 1, 1, "XXX", null),
  ];
  const stays = parentStays(rows);
  assert.deepEqual(stays.map((s) => [s.name, s.first, s.last]), [["Colorado Avalanche", 2003, 2004], ["Washington Capitals", 2005, 2006], ["Boston Bruins", 2006, 2006], ["Washington Capitals", 2009, 2009]]);
  assert.deepEqual(independentRuns(rows), [{ first: 2010, last: 2010 }]);
  assert.deepEqual(parentsOfSeason(rows, 2006).map((p) => p.name), ["Washington Capitals", "Boston Bruins"], "position order");
  assert.deepEqual(parentsOfSeason(rows, 2011), [], "a code that could not be placed names no club");
});

test("an NHL club's farm teams are the minor-league clubs that had it as a parent, the most recent stay first", () => {
  const rows = [row(2000, 5, 1, "BOS", 13, "Providence", "Boston Bruins"), row(2001, 5, 1, "BOS", 13, "Providence", "Boston Bruins"), row(2010, 5, 1, "BOS", 13, "Providence", "Boston Bruins"), row(2005, 6, 1, "BOS", 13, "Hamilton", "Boston Bruins")];
  assert.deepEqual(farmStays(rows).map((s) => [s.name, s.first, s.last]), [["Providence", 2010, 2010], ["Hamilton", 2005, 2005], ["Providence", 2000, 2001]]);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { championRow, satYears, titleHolders } from "../src/lib/champions.ts";
import { isGapYear, withGaps } from "../src/lib/coverage.ts";
import { neutralSite } from "../src/lib/gameSurface.ts";
import { ALL_LEAGUES, CHILDREN, isLeague, LEAGUE_CODES, LEAGUES, LG, PARENT, RELATED_LEAGUES, seasonLabel, topLeague } from "../src/lib/leagues.ts";
import { finalName, roundName } from "../src/lib/series.ts";
import { championshipName, trophyPhrase } from "../src/lib/trophies.ts";
import { leagueTrail, otherLeagues, trailLabels } from "../src/lib/otherLeagues.ts";
import type { Say } from "../src/lib/seriesCopy.ts";
import { readFileSync } from "node:fs";

/**
 * The rival and predecessor leagues the site holds as leagues of their own (each closed, its clubs that played on linked by franchise to the league
 * they joined): the AAFC (1946-1949) so far. Run in web/: pnpm test:rivals
 * What these pin down: the league is one the site knows, a closed one, its season list follows its rows (first and last season), no year inside its
 * span is a gap, its last game is its own championship game, and a club's page may point to the same club's seasons in the NFL.
 */
const copy = Object.fromEntries([...readFileSync(new URL("../src/lib/seriesCopy.ts", import.meta.url), "utf8").matchAll(/^\s+"([\w.]+)": "(.*)",$/gm)].map((m) => [m[1], m[2]]));
const say = ((key: string, vars: Record<string, string | number> = {}) => (copy[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k]))) as unknown as Say;

const row = (league: string, year: number, champion: string | null, o: Partial<{ games: number; teams: number; franchise: number | null }> = {}) => ({
  league, year, label: String(year), games: o.games ?? 56, finals: o.games ?? 56, playoff_finals: 1, teams: o.teams ?? 8,
  champion, champion_note: null, champion_source: null, champion_franchise: o.franchise ?? null,
});
/** What api.season_summary holds once the AAFC is loaded: four seasons, every one won by the Browns (franchise 1497 here), 8, 8, 8 and 7 clubs. */
const aafc = [1946, 1947, 1948, 1949].map((y) => row("aafc", y, "Cleveland Browns", { teams: y === 1949 ? 7 : 8, games: y === 1949 ? 42 : 56, franchise: 1497 }));
const nfl = Array.from({ length: 2025 - 1920 + 1 }, (_, i) => row("nfl", 1920 + i, "Chicago Bears", { franchise: 150 }));

test("the AAFC is a league the site knows, a closed one, with single-year seasons", () => {
  assert.ok(isLeague("aafc"));
  assert.ok(LEAGUE_CODES.includes("aafc"));
  assert.deepEqual(ALL_LEAGUES.find((l) => l.code === "aafc"), { code: "aafc", name: "All-America Football Conference", short: "AAFC", closed: true });
  assert.equal(LG.aafc, "AAFC");
  assert.equal(seasonLabel("aafc", 1947), "1947");
  assert.ok(ALL_LEAGUES.filter((l) => l.closed).map((l) => l.code).every((c) => c in PARENT));
});

test("a rival league is no league of the menu: it hangs off its parent, in one place", () => {
  assert.deepEqual(LEAGUES.map((l) => l.code), ["nhl", "nba", "mlb", "nfl", "cfl"]);
  assert.deepEqual(PARENT, { afl: "nfl", aafc: "nfl" });
  assert.deepEqual(CHILDREN, { nfl: ["afl", "aafc"] });
  assert.equal(topLeague("afl"), "nfl");
  assert.equal(topLeague("aafc"), "nfl");
  assert.equal(topLeague("nhl"), "nhl");
  // every league the archive holds is either a menu league or has a parent that is one; the codes the routes accept are all of them
  assert.deepEqual(ALL_LEAGUES.map((l) => l.code), [...LEAGUE_CODES]);
  for (const l of ALL_LEAGUES) assert.ok(LEAGUES.some((m) => m.code === topLeague(l.code)), l.code);
  assert.ok(LEAGUES.every((l) => !(l.code in PARENT)));
});

test("the AAFC's first and last season come from its rows: 1946 and 1949, four seasons, no gap inside", () => {
  const years = aafc.map((s) => s.year);
  assert.deepEqual([Math.min(...years), Math.max(...years), years.length], [1946, 1949, 4]);
  const all = [...nfl, ...aafc];
  assert.equal(withGaps(all).length, all.length);
  assert.ok(!isGapYear(all, "aafc", 1947) && !isGapYear(all, "aafc", 1949));
  assert.deepEqual([...satYears(all, "aafc")], []);
  // the NFL played those years too: the two leagues' rows never merge
  assert.equal(all.filter((s) => s.year === 1947).length, 2);
});

test("the AAFC's champions: the Browns won all four", () => {
  const boxes = championRow(aafc, "aafc");
  assert.deepEqual(boxes.filter((b) => b.kind === "recent").map((b) => b.year), [1949, 1948, 1947, 1946]);
  const most = boxes.find((b) => b.kind === "most");
  assert.deepEqual([most?.f, most?.n], [1497, 4]);
  assert.equal(titleHolders(aafc, "aafc").before(1946), null);
  assert.equal(titleHolders(aafc, "aafc").before(1947)?.champion, "Cleveland Browns");
});

test("the AAFC's last game of a season is the AAFC Championship; it was played at a club's ground", () => {
  for (const y of [1946, 1947, 1948, 1949]) assert.equal(finalName("aafc", y, say), "AAFC Championship");
  assert.equal(roundName("aafc", 1947, 2, 2, say), "AAFC Championship");
  assert.equal(finalName("nfl", 1947, say), "NFL Championship");
  for (const y of [1946, 1949]) assert.ok(!neutralSite("aafc", y, "playoffs", true));
  assert.equal(championshipName("aafc", 1948, "AAFC Championship"), "AAFC Championship");
  assert.equal(trophyPhrase("aafc", 1948), null);
});

test("a club's page points to its seasons in the related leagues: the NFL club to the AFL and the AAFC, theirs back to the NFL", () => {
  assert.deepEqual(RELATED_LEAGUES.nfl, ["afl", "aafc"]);
  assert.deepEqual(RELATED_LEAGUES.aafc, ["nfl"]);
  assert.deepEqual(RELATED_LEAGUES.afl, ["nfl"]);
  assert.equal(RELATED_LEAGUES.nhl, undefined);
});

test("the parent league's page lists each rival league with its years, seasons and champions; a league without one lists nothing", () => {
  const rows = [...nfl, ...aafc, row("afl", 1960, "Houston Oilers"), row("afl", 1961, null)].map((r) => ({ league: r.league, year: r.year, label: r.label, champion: r.champion }));
  const list = otherLeagues("nfl", rows);
  assert.deepEqual(list.map((o) => [o.code, o.first, o.last, o.seasons, o.champions]), [["afl", "1960", "1961", 2, 1], ["aafc", "1946", "1949", 4, 4]]);
  assert.equal(list[1]!.name, "All-America Football Conference");
  assert.deepEqual(otherLeagues("nhl", rows), []);
  assert.deepEqual(otherLeagues("afl", rows), []);
  assert.deepEqual(otherLeagues("nfl", rows.filter((r) => r.league === "aafc")).map((o) => o.code), ["aafc"]);
});

test("the trail of a rival league's pages reads NFL > AFL > 1964, and no other page has one", () => {
  assert.deepEqual(trailLabels(leagueTrail(["afl", "1964"])!), ["NFL", "AFL", "1964"]);
  assert.deepEqual(trailLabels(leagueTrail(["afl"])!), ["NFL", "AFL"]);
  assert.equal(leagueTrail(["afl"])!.deeper, false);
  assert.deepEqual(trailLabels(leagueTrail(["aafc", "1948", "team", "cleveland-browns"])!), ["NFL", "AAFC", "1948"]);
  assert.equal(leagueTrail(["aafc", "team", "cleveland-browns"])!.year, null);
  assert.equal(leagueTrail(["aafc", "team", "cleveland-browns"])!.deeper, true);
  for (const p of [["nfl", "1964"], ["nhl"], ["players"], ["teams"], []]) assert.equal(leagueTrail(p), null, p.join("/"));
});

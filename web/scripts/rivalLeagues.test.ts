import assert from "node:assert/strict";
import { test } from "node:test";
import { championRow, satYears, titleHolders } from "../src/lib/champions.ts";
import { isGapYear, withGaps } from "../src/lib/coverage.ts";
import { neutralSite } from "../src/lib/gameSurface.ts";
import { ALL_LEAGUES, CHILDREN, isLeague, isMoreHockey, LEAGUE_CODES, LEAGUES, LG, PARENT, RELATED_LEAGUES, seasonLabel, topLeague } from "../src/lib/leagues.ts";
import { finalName, roundName } from "../src/lib/series.ts";
import { championshipName, trophyPhrase } from "../src/lib/trophies.ts";
import { leagueTrail, otherLeagues, trailHidden, trailLabels } from "../src/lib/otherLeagues.ts";
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
  assert.deepEqual(LEAGUES.map((l) => l.code), ["nhl", "pwhl", "nba", "wnba", "mlb", "nfl", "ncaaf", "cfl", "nwsl"]);
  assert.deepEqual(PARENT, { afl: "nfl", aafc: "nfl", nha: "nhl", pcha: "nhl", wchl: "nhl", wha: "nhl", na: "mlb", aa: "mlb", ua: "mlb", pl: "mlb", fl: "mlb" });
  assert.deepEqual(CHILDREN, { nhl: ["nha", "pcha", "wchl", "wha"], mlb: ["na", "aa", "ua", "pl", "fl"], nfl: ["afl", "aafc"] });
  assert.equal(topLeague("afl"), "nfl");
  assert.equal(topLeague("aafc"), "nfl");
  assert.equal(topLeague("nhl"), "nhl");
  // every league the archive holds is a menu league, has a parent that is one, or is on the More hockey page (the AHL: no parent, no menu entry); the codes the routes accept are all of them
  assert.deepEqual(ALL_LEAGUES.map((l) => l.code), [...LEAGUE_CODES]);
  for (const l of ALL_LEAGUES) assert.ok(isMoreHockey(l.code) || LEAGUES.some((m) => m.code === topLeague(l.code)), l.code);
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
  assert.deepEqual(RELATED_LEAGUES.aafc, ["nfl", "afl"]);
  assert.deepEqual(RELATED_LEAGUES.afl, ["nfl", "aafc"]);
  assert.deepEqual(RELATED_LEAGUES.nhl, ["nha", "pcha", "wchl", "wha"]);
  assert.deepEqual(RELATED_LEAGUES.wha, ["nhl", "nha", "pcha", "wchl"]);
  assert.deepEqual(RELATED_LEAGUES.mlb, ["na", "aa", "ua", "pl", "fl"]);
  assert.deepEqual(RELATED_LEAGUES.aa, ["mlb", "na", "ua", "pl", "fl"]);
  assert.equal(RELATED_LEAGUES.cfl, undefined);
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
  assert.equal(trailHidden(["wha", "team", "edmonton-oilers"]), true, "a club page has the parent in its heading");
  for (const p of [["wha"], ["wha", "1975"], ["wha", "team", "edmonton-oilers", "seasons"], ["wha", "1975", "team", "1408"]]) assert.equal(trailHidden(p), false, p.join("/"));
});

/** What api.season_summary holds once the hockey leagues are loaded: NHA 1909-1916, PCHA 1911-1923, WCHL 1921-1925, WHA 1972-1978 (a season is named by the year it starts). */
const span = (league: string, a: number, b: number, champs: string[]) => Array.from({ length: b - a + 1 }, (_, i) =>
  row(league, a + i, champs[i] ?? null, { games: league === "wha" || league === "wchl" ? 0 : 60, teams: league === "wha" ? 12 : 4, franchise: champs[i] ? 1000 + [...new Set(champs)].indexOf(champs[i]) : null }));
const nha = span("nha", 1909, 1916, ["Montreal Wanderers", "Ottawa Hockey Club", "Quebec Bulldogs", "Quebec Bulldogs", "Toronto Hockey Club", "Ottawa Senators", "Montreal Canadiens", "Montreal Canadiens"]);
const pcha = span("pcha", 1911, 1923, ["New Westminster Royals", "Victoria Senators", "Victoria Aristocrats", "Vancouver Millionaires", "Portland Rosebuds", "Seattle Metropolitans", "Vancouver Millionaires", "Seattle Metropolitans", "Seattle Metropolitans", "Vancouver Millionaires", "Vancouver Millionaires", "Vancouver Maroons", "Vancouver Maroons"]);
const wchl = span("wchl", 1921, 1925, ["Regina Capitals", "Edmonton Eskimos", "Calgary Tigers", "Victoria Cougars", "Victoria Cougars"]);
const wha = span("wha", 1972, 1978, ["New England Whalers", "Houston Aeros", "Houston Aeros", "Winnipeg Jets", "Quebec Nordiques", "Winnipeg Jets", "Winnipeg Jets"]);

test("the hockey leagues beside the NHL are leagues of their own under the NHL, with two-year seasons", () => {
  for (const code of ["nha", "pcha", "wchl", "wha"] as const) {
    assert.ok(isLeague(code), code);
    assert.equal(PARENT[code], "nhl");
    assert.equal(topLeague(code), "nhl");
    assert.ok(ALL_LEAGUES.find((l) => l.code === code)!.closed);
    assert.ok(!LEAGUES.some((l) => l.code === code));
  }
  assert.deepEqual([LG.nha, LG.pcha, LG.wchl, LG.wha], ["NHA", "PCHA", "WCHL", "WHA"]);
  assert.equal(seasonLabel("nha", 1909), "1909-10");
  assert.equal(seasonLabel("pcha", 1923), "1923-24");
  assert.equal(seasonLabel("wchl", 1925), "1925-26");
  assert.equal(seasonLabel("wha", 1978), "1978-79");
  assert.equal(seasonLabel("nfl", 1925), "1925");
});

test("each hockey league's first and last season come from its rows, with no gap inside", () => {
  const all = [...nha, ...pcha, ...wchl, ...wha];
  const years = (lg: string) => all.filter((s) => s.league === lg).map((s) => s.year);
  assert.deepEqual([Math.min(...years("nha")), Math.max(...years("nha")), years("nha").length], [1909, 1916, 8]);
  assert.deepEqual([Math.min(...years("pcha")), Math.max(...years("pcha")), years("pcha").length], [1911, 1923, 13]);
  assert.deepEqual([Math.min(...years("wchl")), Math.max(...years("wchl")), years("wchl").length], [1921, 1925, 5]);
  assert.deepEqual([Math.min(...years("wha")), Math.max(...years("wha")), years("wha").length], [1972, 1978, 7]);
  assert.equal(withGaps(all).length, all.length);
  for (const lg of ["nha", "pcha", "wchl", "wha"]) assert.deepEqual([...satYears(all, lg)], [], lg);
  // the leagues' seasons never merge with the NHL's: 1920 holds an NHL row and a PCHA row side by side
  assert.equal([...pcha, ...nha].filter((s) => s.year === 1912).length, 2);
});

test("a hockey league's champions: the PCHA's Millionaires and Maroons, the WHA's Jets", () => {
  const boxes = championRow(pcha, "pcha");
  assert.deepEqual(boxes.filter((b) => b.kind === "recent").map((b) => b.year), [1923, 1922, 1921, 1920]);
  assert.equal(titleHolders(pcha, "pcha").before(1911), null);
  const jets = championRow(wha, "wha");
  assert.deepEqual([jets.find((b) => b.kind === "most")?.f, jets.find((b) => b.kind === "most")?.n], [1002, 3]);
  assert.equal(titleHolders(wha, "wha").before(1972), null);
});

test("the PWHL is a menu league of its own, not a child of the NHL, with two-year seasons", () => {
  assert.ok(isLeague("pwhl"));
  assert.ok(LEAGUE_CODES.includes("pwhl"));
  assert.deepEqual(ALL_LEAGUES.find((l) => l.code === "pwhl"), { code: "pwhl", name: "Professional Women's Hockey League", short: "PWHL" });
  assert.equal(LG.pwhl, "PWHL");
  assert.equal(seasonLabel("pwhl", 2023), "2023-24");
  assert.equal(seasonLabel("pwhl", 2024), "2024-25");
  assert.equal(PARENT.pwhl, undefined);
  assert.equal(topLeague("pwhl"), "pwhl");
  assert.ok(LEAGUES.some((l) => l.code === "pwhl"));
  assert.equal(finalName("pwhl", 2024, say), "Walter Cup Final");
  assert.equal(trophyPhrase("pwhl", 2024), "trophy.name.pwhl");
});

test("the NWSL is a menu league of its own, not a child of MLS, with calendar-year seasons", () => {
  assert.ok(isLeague("nwsl"));
  assert.ok(LEAGUE_CODES.includes("nwsl"));
  assert.deepEqual(ALL_LEAGUES.find((l) => l.code === "nwsl"), { code: "nwsl", name: "National Women's Soccer League", short: "NWSL" });
  assert.equal(LG.nwsl, "NWSL");
  assert.equal(seasonLabel("nwsl", 2013), "2013");
  assert.equal(seasonLabel("nwsl", 2025), "2025");
  assert.equal(PARENT.nwsl, undefined);
  assert.equal(topLeague("nwsl"), "nwsl");
  assert.ok(LEAGUES.some((l) => l.code === "nwsl"));
  assert.equal(finalName("nwsl", 2025, say), "NWSL Championship");
  assert.equal(trophyPhrase("nwsl", 2025), "trophy.name.nwsl");
});

test("the WNBA is a menu league of its own, not a child of the NBA, with calendar-year seasons", () => {
  assert.ok(isLeague("wnba"));
  assert.ok(LEAGUE_CODES.includes("wnba"));
  assert.deepEqual(ALL_LEAGUES.find((l) => l.code === "wnba"), { code: "wnba", name: "Women's National Basketball Association", short: "WNBA" });
  assert.equal(LG.wnba, "WNBA");
  assert.equal(seasonLabel("wnba", 2024), "2024");
  assert.equal(PARENT.wnba, undefined);
  assert.equal(topLeague("wnba"), "wnba");
  assert.ok(LEAGUES.some((l) => l.code === "wnba"));
  assert.equal(finalName("wnba", 2024, say), "WNBA Finals");
  assert.equal(trophyPhrase("wnba", 2024), "trophy.name.wnba");
});

test("the last game of a hockey league's season is its own championship, and none was played at a neutral site by rule", () => {
  assert.equal(finalName("nha", 1913, say), "NHA Championship");
  assert.equal(finalName("pcha", 1919, say), "PCHA Championship");
  assert.equal(finalName("wchl", 1924, say), "WCHL Championship");
  assert.equal(finalName("wha", 1975, say), "Avco Cup Final");
  assert.equal(finalName("nhl", 1925, say), "Stanley Cup Final");
  assert.equal(roundName("pcha", 1919, 2, 2, say), "PCHA Championship");
  for (const lg of ["nha", "pcha", "wchl", "wha"]) assert.ok(!neutralSite(lg, 1920, "playoffs", true), lg);
  assert.equal(championshipName("wha", 1975, "Avco World Trophy"), "Avco World Trophy");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  codeLabel,
  expandedLeagues,
  FAMILIES,
  familyHref,
  familyOf,
  familySiblings,
  familyTitle,
  familyYearCell,
  familyYears,
  familiesWithData,
  GROW_KEY,
  heatCellColor,
  indexSeasons,
  memberHref,
  menuEntries,
  menuFamilyOf,
  seasonHref,
  type HeatSeasonLike,
} from "../src/lib/leagueFamilies.ts";
import { SOCCER_PATH } from "../src/lib/soccerPath.ts";
import { PARENT } from "../src/lib/leagues.ts";
import { familyOtherLeagues } from "../src/lib/otherLeagues.ts";

/** Run in web/: pnpm test:families */

const s = (league: string, year: number, extra: Partial<HeatSeasonLike> = {}): HeatSeasonLike => ({
  league, year, label: String(year), games: 80, finals: 80, share: 1, champion: null, ...extra,
});

test("families fold hockey, basketball and soccer; NFL and CFL stay apart", () => {
  assert.deepEqual(FAMILIES.map((f) => f.id), ["nhl", "nba", "mlb", "nfl", "ncaaf", "cfl", "soccer"]);
  assert.deepEqual(familyOf("nhl")?.members, ["nhl", "pwhl", "nha", "pcha", "wchl", "wha"]);
  assert.deepEqual(familyOf("mlb")?.members, ["mlb", "na", "aa", "ua", "pl", "fl"]);
  assert.equal(familyOf("aa")?.id, "mlb");
  assert.deepEqual(familyOf("pwhl")?.id, "nhl");
  assert.deepEqual(familyOf("wnba")?.id, "nba");
  assert.deepEqual(familyOf("nwsl")?.id, "soccer");
  assert.equal(familyOf("nfl")?.id, "nfl");
  assert.equal(familyOf("cfl")?.id, "cfl");
  assert.ok(!familyOf("nfl")!.members.includes("cfl"));
  assert.ok(!familyOf("cfl")!.members.includes("nfl"));
  assert.deepEqual(familyOf("afl")?.id, "nfl");
  assert.deepEqual(familyOf("aafc")?.id, "nfl");
  assert.ok(!FAMILIES.some((f) => f.members.includes("pwhl") && f.id !== "nhl"));
  assert.ok(!familyOf("nhl")!.members.includes("nwsl"));
  assert.ok(!familyOf("nba")!.members.includes("nwsl"));
});

test("PARENT is unchanged: PWHL and WNBA stay menu leagues, NHA still hangs off the NHL", () => {
  assert.equal(PARENT.nha, "nhl");
  assert.equal(PARENT.pwhl, undefined);
  assert.equal(PARENT.wnba, undefined);
  assert.equal(PARENT.nwsl, undefined);
  assert.equal(PARENT.cfl, undefined);
});

test("family chips: one fixed order, a sport name for the label, International for the FIFA competitions", () => {
  assert.deepEqual(FAMILIES.map((f) => f.sport), ["hockey", "basketball", "baseball", "football", "football", "football", "soccer"]);
  assert.equal(codeLabel("soccer", "International"), "International");
  assert.equal(codeLabel("soccer"), "International");
  assert.equal(memberHref("soccer"), "/worldcup");
  const nav = readFileSync(new URL("../src/components/FamilyNav.tsx", import.meta.url), "utf8");
  assert.ok(nav.includes("family.members.map"), "FamilyNav draws every member in the family's own order");
  assert.ok(!nav.includes("familySiblings"), "FamilyNav never puts the current league first");
});

test("labels: NHL+, Soccer+, CFL with no plus", () => {
  assert.equal(familyTitle(familyOf("nhl")!, "Soccer"), "NHL+");
  assert.equal(familyTitle(familyOf("nba")!), "NBA+");
  assert.equal(familyTitle(familyOf("mlb")!), "MLB+");
  assert.equal(familyTitle(familyOf("nfl")!), "NFL+");
  assert.equal(familyTitle(familyOf("cfl")!), "CFL");
  assert.equal(familyTitle(familyOf("soccer")!, "Soccer"), "Soccer+");
  assert.equal(familyTitle(familyOf("soccer")!, "サッカー"), "サッカー+");
  assert.equal(codeLabel("mls"), "MLS");
  assert.equal(GROW_KEY, "spxn-archive-grow");
});

test("the NHL+ row covers NHA and PCHA years before 1917", () => {
  const nhl = familyOf("nhl")!;
  const seasons = [
    s("nha", 1909), s("nha", 1910), s("nha", 1915), s("nha", 1916),
    s("pcha", 1911), s("pcha", 1915), s("pcha", 1916), s("pcha", 1917),
    s("nhl", 1917), s("nhl", 1918),
  ];
  const years = familyYears(nhl, seasons);
  assert.ok(years[0] === 1909, `first year is ${years[0]}, want 1909`);
  assert.ok(years.includes(1911) && years.includes(1915) && years.includes(1916));
  assert.ok(years.includes(1917));
  const idx = indexSeasons(seasons);
  const onlyNha = familyYearCell(1910, nhl, idx);
  assert.equal(onlyNha?.main.league, "nha");
  assert.deepEqual(onlyNha?.chips, []);
  const both = familyYearCell(1915, nhl, idx);
  assert.equal(both?.main.league, "nha");
  assert.deepEqual(both?.chips.map((c) => c.league), ["pcha"]);
  const nhlStarts = familyYearCell(1917, nhl, idx);
  assert.equal(nhlStarts?.main.league, "nhl");
  assert.deepEqual(nhlStarts?.chips.map((c) => c.league), ["pcha"]);
  assert.ok(heatCellColor("nha") !== heatCellColor("nhl"));
  assert.ok(heatCellColor("pcha") !== heatCellColor("nhl"));
});

test("a year with NHL and PWHL keeps NHL as the square and PWHL as a chip", () => {
  const nhl = familyOf("nhl")!;
  const cell = familyYearCell(2023, nhl, indexSeasons([s("nhl", 2023), s("pwhl", 2023), s("pwhl", 2024)]));
  assert.equal(cell?.main.league, "nhl");
  assert.deepEqual(cell?.chips.map((c) => c.league), ["pwhl"]);
  assert.equal(familiesWithData([s("pwhl", 2023)]).map((f) => f.id).join(), "nhl");
  assert.ok(!expandedLeagues(nhl, [s("pwhl", 2023), s("nhl", 2023)]).includes("nha"));
  assert.deepEqual(expandedLeagues(nhl, [s("pwhl", 2023), s("nhl", 2023), s("nha", 1910)]), ["nhl", "pwhl", "nha"]);
});

test("WNBA is a chip on NBA+; AFL and AAFC sit on NFL+, not CFL", () => {
  const nba = familyYearCell(2024, familyOf("nba")!, indexSeasons([s("nba", 2024), s("wnba", 2024)]));
  assert.equal(nba?.main.league, "nba");
  assert.deepEqual(nba?.chips.map((c) => c.league), ["wnba"]);
  const nfl = familyYearCell(1966, familyOf("nfl")!, indexSeasons([s("nfl", 1966), s("afl", 1966), s("cfl", 1966)]));
  assert.equal(nfl?.main.league, "nfl");
  assert.deepEqual(nfl?.chips.map((c) => c.league), ["afl"]);
  const aafcOnly = familyYearCell(1948, familyOf("nfl")!, indexSeasons([s("aafc", 1948), s("nfl", 1948)]));
  assert.equal(aafcOnly?.main.league, "nfl");
  assert.deepEqual(aafcOnly?.chips.map((c) => c.league), ["aafc"]);
});

test("NWSL and MLS are soccer-family chips; a World Cup year is the soccer square", () => {
  const soccer = familyOf("soccer")!;
  const cell = familyYearCell(2023, soccer, indexSeasons([s("soccer", 2023), s("nwsl", 2023), s("mls", 2023)]));
  assert.equal(cell?.main.league, "soccer");
  assert.deepEqual(cell?.chips.map((c) => c.league), ["nwsl", "mls"]);
  const nwslOnly = familyYearCell(2019, soccer, indexSeasons([s("nwsl", 2019), s("mls", 2019)]));
  assert.equal(nwslOnly?.main.league, "nwsl");
  assert.deepEqual(nwslOnly?.chips.map((c) => c.league), ["mls"]);
});

test("addresses stay on /pcha and /nwsl; World Cup and MLS have their own paths", () => {
  assert.equal(familyHref(familyOf("nhl")!), "/nhl");
  assert.equal(familyHref(familyOf("soccer")!), "/soccer");
  assert.equal(memberHref("pcha"), "/pcha");
  assert.equal(memberHref("nwsl"), "/nwsl");
  assert.equal(memberHref("mls"), "/mls");
  assert.equal(seasonHref("pcha", 1915), "/pcha/1915-16");
  assert.equal(seasonHref("nhl", 1917), "/nhl/1917-18");
  assert.equal(seasonHref("soccer", 2022), "/worldcup/2022");
  assert.equal(seasonHref("mls", 2019), "/mls/2019");
  assert.deepEqual(familySiblings("nhl"), ["pwhl", "nha", "pcha", "wchl", "wha"]);
  assert.deepEqual(familySiblings("pwhl"), ["nhl", "nha", "pcha", "wchl", "wha"]);
  assert.deepEqual(familySiblings("nwsl"), ["soccer", "mls"]);
});

test("the NHL page lists PWHL with the older hockey leagues; NWSL is not there", () => {
  const rows = [
    { league: "pwhl", year: 2023, label: "2023-24", champion: "Ottawa Charge" },
    { league: "nha", year: 1909, label: "1909-10", champion: "Montreal Wanderers" },
    { league: "nwsl", year: 2023, label: "2023", champion: "Gotham FC" },
  ];
  const list = familyOtherLeagues("nhl", rows);
  assert.deepEqual(list.map((o) => o.code), ["pwhl", "nha"]);
  assert.equal(list[0]!.name, "Professional Women's Hockey League");
  assert.deepEqual(familyOtherLeagues("nba", [{ league: "wnba", year: 2024, label: "2024", champion: "New York Liberty" }]).map((o) => o.code), ["wnba"]);
});

test("Grow is a per-session choice: a stored localStorage Grow never expands a new visit", () => {
  const src = readFileSync(new URL("../src/components/archiveGrow.tsx", import.meta.url), "utf8");
  assert.ok(!/localStorage\.(getItem|setItem)/.test(src), "localStorage must not be read or written for Grow");
  assert.match(src, /sessionStorage\.setItem\(GROW_KEY/);
  assert.match(src, /useState\(false\)/);
});

test("the top menu is the families: NHL+, NBA+, MLB+, NFL+, CFL, Soccer", () => {
  const menu = menuEntries("Soccer");
  assert.deepEqual(menu.map((m) => m.label), ["NHL+", "NBA+", "MLB+", "NFL+", "College football", "CFL", "Soccer"]);
  assert.deepEqual(menu.map((m) => m.href), ["/nhl", "/nba", "/mlb", "/nfl", "/ncaaf", "/cfl", SOCCER_PATH]);
  assert.equal(menuEntries("サッカー").at(-1)!.label, "サッカー");
  // no woman's, rival or predecessor league is an entry of its own
  const hrefs = new Set(menu.map((m) => m.href));
  for (const lg of ["pwhl", "wnba", "nwsl", "nha", "pcha", "wchl", "wha", "afl", "aafc"]) assert.ok(!hrefs.has(`/${lg}`), `${lg} is not a menu entry`);
  assert.deepEqual(menu.map((m) => m.allTime), ["nhl", "nba", "mlb", "nfl", "ncaaf", "cfl", null]);
});

test("every league and virtual member lights its family's menu entry and is linked from the family page", () => {
  for (const f of FAMILIES) {
    for (const m of f.members) {
      assert.equal(menuFamilyOf(m), f.id, `${m} lights ${f.id}`);
      if (m !== f.primary) assert.ok(familySiblings(f.primary).includes(m), `${m} is linked from the ${f.id} page (FamilyNav)`);
    }
  }
  assert.equal(menuFamilyOf("wnba"), "nba");
  assert.equal(menuFamilyOf("pwhl"), "nhl");
  assert.equal(menuFamilyOf("nwsl"), "soccer");
  assert.equal(menuFamilyOf("worldcup"), "soccer");
  assert.equal(menuFamilyOf("afl"), "nfl");
  assert.equal(menuFamilyOf("teams"), undefined);
});

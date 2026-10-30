import assert from "node:assert/strict";
import { test } from "node:test";
import { TROPHY_STANLEY_CUP } from "@johnmorrisdotca/dougu-sports/trophy/stanley-cup";
import { bindTurn, type TurnContainer, type TurnEvent } from "@johnmorrisdotca/dougu-sports/turn";
import { bannerCupSvg, bigCupSvg, cupSvg, cupsFor, gameCupSvg, medalSvg, trophyArt, trophyBigSvg } from "../src/lib/cups.ts";
import { bigGameTrophy, championshipName, conferenceTrophyPhrase, trophyPhrase } from "../src/lib/trophies.ts";
import { conferenceSide, conferenceTrophyKey, hasConferenceTrophy, sideLookup, titleTrophyKey } from "../src/lib/trophyEra.ts";
import { TROPHY_TILT } from "../src/lib/trophyTurn.ts";

/** Run in web/: pnpm test:trophies (it needs the react-server condition, as lib/cups.ts is server-only). */
test("every league has a titled cup drawn by the package, in line style, and an unknown league gets the NHL's", () => {
  for (const [lg, name] of [["nhl", "Stanley Cup"], ["pwhl", "Walter Cup"], ["nba", "Larry O'Brien Trophy"], ["wnba", "WNBA Championship"], ["nwsl", "NWSL Championship"], ["cfl", "Grey Cup"], ["worldcup", "World Cup"], ["mls", "MLS Cup"], ["pcha", "Paterson Cup"], ["nha", "O'Brien Cup"], ["wha", "Avco World Trophy"]]) {
    assert.match(cupSvg(lg), new RegExp(`<title>${name}</title>`));
  }
  assert.equal(cupSvg("unknown"), cupSvg("nhl"));
  assert.match(cupSvg("nhl"), /currentColor/);
  assert.doesNotMatch(cupSvg("nhl"), / width="64"/, "the page's CSS sizes it");
});

test("a big cup is the full metal drawing for the leagues that have one, and the line cup for the rest", () => {
  for (const [lg, name] of [["nhl", "Stanley Cup"], ["nba", "Larry O'Brien Trophy"], ["mlb", "Commissioner's Trophy"], ["nfl", "Vince Lombardi Trophy"], ["cfl", "Grey Cup"], ["pcha", "Paterson Cup"], ["nha", "O'Brien Cup"], ["wha", "Avco World Trophy"], ["pwhl", "Walter Cup"], ["wnba", "WNBA Championship"]]) {
    assert.match(bigCupSvg(lg), new RegExp(`<title>${name}</title>`));
    assert.doesNotMatch(bigCupSvg(lg), /currentColor/);
    assert.doesNotMatch(bigCupSvg(lg), / width="64"/);
  }
  for (const lg of ["nwsl", "wchl", "unknown"]) assert.equal(bigCupSvg(lg), cupSvg(lg), lg);
});

test("places 1 to 3 have a titled medal in metal, and no other place has one", () => {
  for (const [p, name] of [[1, "Gold medal"], [2, "Silver medal"], [3, "Bronze medal"]] as const) {
    assert.match(medalSvg(p), new RegExp(`^<svg .*<title>${name}</title>`));
  }
  assert.equal(medalSvg(4), "");
  assert.notEqual(medalSvg(1), medalSvg(2));
});

test("cupsFor draws each league named once, for a client component to draw", () => {
  const cups = cupsFor(["nhl", "nba", "nhl"]);
  assert.deepEqual(Object.keys(cups), ["nhl", "nba"]);
  assert.equal(cups.nhl, cupSvg("nhl"));
});

/** A small fake element: bindTurn needs no DOM. */
class Fake implements TurnContainer {
  innerHTML = "";
  style = { touchAction: "", userSelect: "", cursor: "" };
  attributes = new Map<string, string>();
  addEventListener(_type: string, _listener: (event: TurnEvent) => void): void {}
  removeEventListener(_type: string, _listener: (event: TurnEvent) => void): void {}
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  removeAttribute(name: string): void { this.attributes.delete(name); }
}

test("the banner still the server sends is the first frame the browser draws when the trophy is bound to turn", () => {
  const el = new Fake();
  const turner = bindTurn(el, TROPHY_STANLEY_CUP, { style: "metal", size: 64, title: false, pitch: TROPHY_TILT });
  assert.equal(el.innerHTML.replace(' width="64" height="64"', ""), bannerCupSvg("nhl"));
  turner.destroy();
});

test("the PCHA, NHA, WHA, PWHL and WNBA champions are drawn with their own cups, not the generic ones", () => {
  for (const lg of ["pcha", "nha", "wha", "pwhl"]) {
    assert.notEqual(cupSvg(lg), cupSvg("nhl"), lg);
    assert.notEqual(bannerCupSvg(lg), bannerCupSvg("nhl"), lg);
    assert.notEqual(bigCupSvg(lg), bigCupSvg("nhl"), lg);
  }
});

test("the WNBA final is drawn with its own trophy, not the NBA's ball", () => {
  assert.notEqual(cupSvg("wnba"), cupSvg("nba"));
  assert.notEqual(bannerCupSvg("wnba"), bannerCupSvg("nba"));
  assert.notEqual(bigCupSvg("wnba"), bigCupSvg("nba"));
  assert.notEqual(gameCupSvg("wnba", true), gameCupSvg("nba", true));
  assert.notEqual(gameCupSvg("wnba", false), gameCupSvg("nba", false));
});

test("the PWHL final is drawn with the Walter Cup, not the Stanley Cup", () => {
  assert.notEqual(gameCupSvg("pwhl", true), gameCupSvg("nhl", true));
  assert.notEqual(gameCupSvg("pwhl", false), gameCupSvg("nhl", false));
  assert.ok(gameCupSvg("pwhl", false).includes("currentColor"));
});

test("the AHL, ECHL and college football finals are drawn with the Calder Cup, the Kelly Cup and the College Football Playoff trophy, not a stand-in", () => {
  for (const [lg, standIn, name] of [["ahl", "nhl", "Calder Cup"], ["echl", "nhl", "Kelly Cup"], ["ncaaf", "nfl", "National Championship"]] as const) {
    assert.notEqual(gameCupSvg(lg, true), gameCupSvg(standIn, true), lg);
    assert.notEqual(gameCupSvg(lg, false), gameCupSvg(standIn, false), lg);
    assert.notEqual(cupSvg(lg), cupSvg(standIn), lg);
    assert.notEqual(bannerCupSvg(lg), bannerCupSvg(standIn), lg);
    assert.match(bigCupSvg(lg), new RegExp(`<title>${name}</title>`), lg);
    assert.match(gameCupSvg(lg, false), /currentColor/, lg);
  }
  assert.notEqual(gameCupSvg("ahl", true), gameCupSvg("echl", true));
});

test("a big-game banner shows a trophy for the leagues that have a cup, and nothing for the ones that do not", () => {
  const name = (lg: string, year = 2025) => bigGameTrophy(lg, year);
  for (const lg of ["nhl", "pwhl", "nba", "wnba", "mlb", "nfl", "cfl", "ahl", "echl", "ncaaf"]) assert.ok(name(lg), lg);
  assert.equal(name("pwhl"), "trophy.name.pwhl");
  assert.equal(name("wnba"), "trophy.name.wnba");
  assert.equal(name("mlb"), "trophy.name.mlb");
  assert.equal(name("ahl"), "trophy.name.ahl");
  assert.equal(name("nfl", 1965), null);
  for (const lg of ["afl", "aafc", "wchl", "na", "fl", "nope"]) assert.equal(name(lg), null, lg);
});

test("the big-game cup is untitled and sized by the page: the line cup small, the metal cup large", () => {
  for (const lg of ["nhl", "pwhl", "nba", "wnba", "mlb", "nfl", "cfl", "ahl", "echl", "ncaaf"]) {
    const small = gameCupSvg(lg, false), large = gameCupSvg(lg, true);
    assert.ok(!small.includes("<title>") && !large.includes("<title>"), lg);
    assert.ok(!small.includes(' width="64"') && !large.includes(' width="64"'), lg);
    assert.ok(small.includes("currentColor"), lg);
    // the Calder and Kelly cups are measured on photographs and carry more strokes (3 and 4 KB) than the older cups
    assert.ok(small.length < (lg === "ahl" || lg === "echl" ? 4500 : 2500), `${lg} small cup ${small.length} bytes`);
  }
});

test("the NBA's title trophy is chosen by season: none before 1977-78, the first Larry O'Brien design to 2020-21, the 2022 design from 2021-22", () => {
  assert.equal(titleTrophyKey("nba", 1976), null);
  assert.equal(titleTrophyKey("nba", 1946), null);
  assert.equal(titleTrophyKey("nba", 1977), "nba-1977");
  assert.equal(titleTrophyKey("nba", 2014), "nba-1977");
  assert.equal(titleTrophyKey("nba", 2020), "nba-1977");
  assert.equal(titleTrophyKey("nba", 2021), "nba");
  assert.equal(titleTrophyKey("nba", 2023), "nba");
  assert.equal(titleTrophyKey("nba"), "nba", "the trophy of today");
  assert.equal(titleTrophyKey("nhl", 1930), "nhl", "another league keeps its own cup");
  assert.equal(trophyPhrase("nba", 1976), null);
  assert.equal(championshipName("nba", 1970, "Larry O'Brien Championship Trophy"), "NBA Championship");
  assert.equal(championshipName("nba", 1977, "Larry O'Brien Championship Trophy"), "Larry O'Brien Championship Trophy");
  assert.equal(trophyPhrase("nba", 1977), "trophy.name.nba");
  assert.equal(bigGameTrophy("nba", 1960), null);
  assert.equal(bigGameTrophy("nba", 2014), "trophy.name.nba");
  assert.notEqual(bannerCupSvg("nba-1977"), bannerCupSvg("nba"));
  assert.notEqual(gameCupSvg("nba-1977", true), gameCupSvg("nba", true));
  assert.notEqual(gameCupSvg("nba-1977", false), gameCupSvg("nba", false));
  assert.match(gameCupSvg("nba-1977", false), /currentColor/);
  assert.match(bigCupSvg("nba"), /<title>Larry O'Brien Trophy<\/title>/);
  assert.notEqual(bannerCupSvg("nba"), bannerCupSvg("wnba"));
});

test("a conference trophy is chosen by conference and season, and never for a season before it existed", () => {
  assert.equal(conferenceTrophyKey("nba", 2023, "east"), "nba-east");
  assert.equal(conferenceTrophyKey("nba", 2021, "west"), "nba-west", "named in 2022, the 2021-22 season");
  assert.equal(conferenceTrophyKey("nba", 2020, "west"), "nba-west-2001");
  assert.equal(conferenceTrophyKey("nba", 2000, "east"), "nba-east-2001", "first given in the 2001 playoffs, the 2000-01 season");
  assert.equal(conferenceTrophyKey("nba", 1999, "east"), null);
  assert.equal(conferenceTrophyKey("nba", 2023, null), null);
  assert.equal(conferenceTrophyKey("nba", 2023, "nfc"), null);
  assert.equal(conferenceTrophyKey("nfl", 2024, "nfc"), "nfc");
  assert.equal(conferenceTrophyKey("nfl", 1984, "afc"), "afc");
  assert.equal(conferenceTrophyKey("nfl", 1983, "afc"), null);
  assert.equal(conferenceTrophyKey("wnba", 2024, "east"), null);
  assert.equal(conferenceTrophyPhrase("nba", 2023, "west"), "trophy.name.nbaWest");
  assert.equal(conferenceTrophyPhrase("nba", 2010, "east"), "trophy.name.nbaEast2001");
  assert.equal(conferenceTrophyPhrase("nfl", 2024, "afc"), "trophy.name.afc");
  for (const key of ["nba-west", "nba-west-2001", "nba-east", "nba-east-2001", "nfc", "afc", "nhl-east", "nhl-west"]) {
    assert.ok(gameCupSvg(key, true).length > 500, key);
    assert.match(gameCupSvg(key, false), /currentColor/, key);
    assert.ok(!gameCupSvg(key, true).includes("<title>"), key);
  }
  assert.notEqual(gameCupSvg("nba-west", true), gameCupSvg("nba-west-2001", true));
  assert.notEqual(gameCupSvg("nfc", true), gameCupSvg("nhl", true));
  assert.equal(conferenceSide("nba", "West"), "west");
  assert.equal(conferenceSide("nba", "Eastern Conference"), "east");
  assert.equal(conferenceSide("nfl", "NFC"), "nfc");
  assert.equal(conferenceSide("nfl", "East"), null);
  assert.equal(sideLookup("nfl", [{ franchise_id: 7, conference_short: "AFC" }])(7), "afc");
  assert.equal(sideLookup("nfl", null)(7), null);
});

test("the Finals MVP award and the Rookie of the Year award have their own drawings on the trophy pages", () => {
  for (const [code, kind] of [["nba_finals_mvp", "person_award"], ["mlb_rookie_of_the_year", "person_award"]] as const) {
    const art = trophyArt(code, kind);
    assert.equal(art.named, true, code);
    assert.notEqual(art.emblem, trophyArt("nhl_hart", "person_award").emblem, code);
    assert.ok(trophyBigSvg(art, "x").length > 500, code);
  }
  assert.equal(trophyArt("nba_larry_obrien", "championship").emblem.id, "trophy:larry-obrien-trophy");
  assert.equal(trophyArt("nba_mvp", "person_award").named, false, "an award with no drawing keeps the stand-in");
});

test("the Stanley Cup, the Grey Cup, the Commissioner's Trophy and the Vince Lombardi Trophy are the package's named trophies, not a generic cup", () => {
  for (const [lg, id] of [["nhl", "stanley-cup"], ["cfl", "grey-cup"], ["mlb", "commissioners-trophy"], ["nfl", "lombardi-trophy"]] as const) {
    assert.equal(trophyArt({ nhl: "nhl_stanley_cup", cfl: "cfl_grey_cup", mlb: "mlb_world_series", nfl: "nfl_super_bowl" }[lg], "championship").emblem.id, `trophy:${id}`, lg);
    assert.ok(gameCupSvg(lg, true).length > 900, lg);
    assert.match(gameCupSvg(lg, false), /currentColor/, lg);
    assert.ok(gameCupSvg(lg, false).length < 2500, `${lg} small cup ${gameCupSvg(lg, false).length} bytes`);
  }
});

test("the NFL's title trophy is the Vince Lombardi Trophy from the 1970 season and the football cup of the NFL Championship before it", () => {
  assert.equal(titleTrophyKey("nfl", 1970), "nfl");
  assert.equal(titleTrophyKey("nfl", 2024), "nfl");
  assert.equal(titleTrophyKey("nfl", 1969), "nfl-pre");
  assert.equal(titleTrophyKey("nfl", 1933), "nfl-pre");
  assert.equal(titleTrophyKey("nfl"), "nfl");
  assert.notEqual(bannerCupSvg("nfl"), bannerCupSvg("nfl-pre"));
  assert.match(bigCupSvg("nfl"), /<title>Vince Lombardi Trophy<\/title>/);
  assert.equal(trophyPhrase("nfl", 1969), "rnd.nflOld");
});

test("MLB's title trophy: none before 1967, the baseball cup for 1967 to 1999, the Commissioner's Trophy of Tiffany's design from 2000", () => {
  assert.equal(titleTrophyKey("mlb", 1966), null);
  assert.equal(titleTrophyKey("mlb", 1903), null);
  assert.equal(titleTrophyKey("mlb", 1967), "mlb-1967");
  assert.equal(titleTrophyKey("mlb", 1999), "mlb-1967");
  assert.equal(titleTrophyKey("mlb", 2000), "mlb");
  assert.equal(titleTrophyKey("mlb", 2025), "mlb");
  assert.equal(titleTrophyKey("mlb"), "mlb");
  assert.equal(trophyPhrase("mlb", 1966), null);
  assert.equal(trophyPhrase("mlb", 1999), "trophy.name.mlbOld");
  assert.equal(trophyPhrase("mlb", 2000), "trophy.name.mlb");
  assert.equal(bigGameTrophy("mlb", 1950), null);
  assert.notEqual(bannerCupSvg("mlb"), bannerCupSvg("mlb-1967"));
  assert.match(bigCupSvg("mlb"), /<title>Commissioner's Trophy<\/title>/);
  // The World Series pennants of other leagues and the early championship are not the Commissioner's Trophy.
  assert.equal(trophyArt("mlb_world_series", "championship").key, "cup-mlb");
  assert.equal(trophyArt("mlb_early_championship", "championship").emblem.id, "trophy:baseball");
  assert.equal(trophyArt("mlb_pennant_na", "championship").emblem.id, "trophy:baseball");
});

test("the NHL's conference trophies go to a conference's playoff champion from 1981-82, and are never drawn for a season they did not go to one", () => {
  assert.equal(conferenceTrophyKey("nhl", 2024, "east"), "nhl-east");
  assert.equal(conferenceTrophyKey("nhl", 2024, "west"), "nhl-west");
  assert.equal(conferenceTrophyKey("nhl", 1981, "east"), "nhl-east", "the 1981-82 playoffs: the first with a conference playoff champion");
  assert.equal(conferenceTrophyKey("nhl", 1980, "east"), null, "to 1980-81 they went to the regular season's first place");
  assert.equal(conferenceTrophyKey("nhl", 1950, "west"), null);
  assert.equal(conferenceTrophyKey("nhl", 2024, "nfc"), null);
  assert.equal(conferenceTrophyKey("nhl", 2024, null), null);
  assert.equal(hasConferenceTrophy("nhl", 1981), true);
  assert.equal(hasConferenceTrophy("nhl", 1980), false);
  assert.equal(conferenceTrophyPhrase("nhl", 2023, "east"), "trophy.name.nhlEast");
  assert.equal(conferenceTrophyPhrase("nhl", 1990, "west"), "trophy.name.nhlWest");
  assert.equal(conferenceTrophyPhrase("nhl", 1975, "west"), null);
  // The archive's names for the NHL conferences, over the years.
  assert.equal(conferenceSide("nhl", "Wales"), "east");
  assert.equal(conferenceSide("nhl", "Prince of Wales Conference"), "east");
  assert.equal(conferenceSide("nhl", "Campbell"), "west");
  assert.equal(conferenceSide("nhl", "Clarence Campbell Conference"), "west");
  assert.equal(conferenceSide("nhl", "East"), "east");
  assert.equal(conferenceSide("nhl", "Western Conference"), "west");
  assert.equal(conferenceSide("nhl", "Central"), null);
  // 2020-21 had four divisions: East and Central semifinal winners took the Prince of Wales Trophy, North and West the Campbell Bowl.
  const rows = [["East", 1], ["Central", 2], ["North", 3], ["West", 4]].map(([d, f]) => ({ franchise_id: f as number, year: 2020, conference_short: null, division_short: d as string }));
  const side = sideLookup("nhl", rows);
  assert.deepEqual([1, 2, 3, 4].map(side), ["east", "east", "west", "west"]);
  assert.equal(sideLookup("nhl", rows.map((r) => ({ ...r, year: 2021 })))(1), null, "a division is a side only in 2020-21");
  assert.notEqual(gameCupSvg("nhl-east", true), gameCupSvg("nhl-west", true));
});

test("every award the archive names that the package has a trophy for is drawn with it, and the others keep the stand-in", () => {
  const named: Record<string, string> = {
    nhl_hart: "hart-trophy", nhl_vezina: "vezina-trophy", nhl_norris: "norris-trophy", nhl_calder: "calder-trophy", nhl_art_ross: "art-ross-trophy", nhl_conn_smythe: "conn-smythe-trophy",
    nhl_lady_byng: "lady-byng-trophy", nhl_selke: "selke-trophy", nhl_jennings: "jennings-trophy", nhl_masterton: "masterton-trophy", nhl_king_clancy: "king-clancy-trophy",
    nhl_jack_adams: "jack-adams-trophy", nhl_presidents_trophy: "presidents-trophy", nhl_rocket_richard: "rocket-richard-trophy", nhl_ted_lindsay: "ted-lindsay-award",
    mlb_mvp: "mlb-mvp-award", mlb_cy_young: "cy-young-award", mlb_gold_glove: "gold-glove-award", mlb_silver_slugger: "silver-slugger-award", mlb_world_series_mvp: "world-series-mvp-trophy",
    mlb_rookie_of_the_year: "jackie-robinson-award", mlb_hank_aaron: "hank-aaron-award", mlb_rolaids_relief_man: "relief-man-award", nba_finals_mvp: "bill-russell-trophy",
  };
  const kinds: Record<string, string> = { nhl_presidents_trophy: "team_award" };
  const keys = new Set<string>();
  for (const [code, id] of Object.entries(named)) {
    const art = trophyArt(code, kinds[code] ?? "person_award");
    assert.equal(art.emblem.id, `trophy:${id}`, code);
    assert.equal(art.named, true, code);
    assert.ok(!keys.has(art.key), `${code} has a drawing of its own`);
    keys.add(art.key);
  }
  for (const [code, kind] of [["nhl_gm_of_the_year", "person_award"], ["nba_mvp", "person_award"], ["nba_coach_of_the_year", "person_award"], ["nfl_super_bowl_mvp", "person_award"], ["nfl_ap_mvp", "person_award"],
    ["mlb_manager_of_the_year", "person_award"], ["cfl_most_outstanding_player", "person_award"], ["cfl_coach_of_the_year", "person_award"], ["mlb_pennant_al", "team_award"]] as const) {
    assert.equal(trophyArt(code, kind).named, false, code);
  }
});

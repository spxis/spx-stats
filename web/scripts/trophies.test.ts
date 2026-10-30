import assert from "node:assert/strict";
import { test } from "node:test";
import { TROPHY_HOCKEY_CUP } from "@johnmorrisdotca/dougu-sports/trophy/hockey-cup";
import { bindTurn, type TurnContainer, type TurnEvent } from "@johnmorrisdotca/dougu-sports/turn";
import { bannerCupSvg, bigCupSvg, cupSvg, cupsFor, gameCupSvg, medalSvg } from "../src/lib/cups.ts";
import { bigGameTrophy } from "../src/lib/trophies.ts";
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
  const turner = bindTurn(el, TROPHY_HOCKEY_CUP, { style: "metal", size: 64, title: false, pitch: TROPHY_TILT });
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
    assert.ok(small.length < 2500, `${lg} small cup ${small.length} bytes`);
  }
});

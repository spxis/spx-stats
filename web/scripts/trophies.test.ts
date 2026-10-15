import assert from "node:assert/strict";
import { test } from "node:test";
import { TROPHY_HOCKEY_CUP } from "@johnmorrisdotca/dougu-sports/trophy/hockey-cup";
import { bindTurn, type TurnContainer, type TurnEvent } from "@johnmorrisdotca/dougu-sports/turn";
import { bannerCupSvg, cupSvg, cupsFor, medalSvg } from "../src/lib/cups.ts";
import { TROPHY_TILT } from "../src/lib/trophyTurn.ts";

/** Run in web/: pnpm test:trophies (it needs the react-server condition, as lib/cups.ts is server-only). */
test("every league has a titled cup drawn by the package, in line style, and an unknown league gets the NHL's", () => {
  for (const [lg, name] of [["nhl", "Stanley Cup"], ["nba", "Larry O'Brien Trophy"], ["cfl", "Grey Cup"], ["worldcup", "World Cup"], ["mls", "MLS Cup"]]) {
    assert.match(cupSvg(lg), new RegExp(`<title>${name}</title>`));
  }
  assert.equal(cupSvg("unknown"), cupSvg("nhl"));
  assert.match(cupSvg("nhl"), /currentColor/);
  assert.doesNotMatch(cupSvg("nhl"), / width="64"/, "the page's CSS sizes it");
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

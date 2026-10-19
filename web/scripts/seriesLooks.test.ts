import assert from "node:assert/strict";
import { test } from "node:test";
import { contrast, lum, PAPER } from "../src/lib/brand.ts";
import { APART, deltaE, seriesLooks, TEXT_CONTRAST, TOO_LIGHT, type SideLook } from "../src/lib/seriesLooks.ts";

/** Run in web/: pnpm test:looks */

/** Real club colours as the archive holds them (api.team_brand, current era, 2026-10-13). */
const CLUB = {
  rays: ["092C5C", "8FBCE6"], yankees: ["132448", "FFFFFF"], redSox: ["BD3039", "0D2B56"], dodgers: ["005A9C", "FFFFFF"],
  padres: ["2F241D", "FFC425"], leafs: ["00205B", "00205B"], canadiens: ["A6192E", "001E62"], rams: ["003594", "FFD100"],
  chargers: ["0080C6", "FFC20E"], redWings: ["C8102E", "C8102E"], blackhawks: ["CE1126", "010101"], falcons: ["A71930", "000000"],
  buccaneers: ["A71930", "322F2B"], angels: ["BA0021", "003263"], cardinals: ["BE0A14", "001541"],
} as const;
type Club = keyof typeof CLUB;
const brand = (c: Club) => ({ primary_hex: CLUB[c][0], secondary_hex: CLUB[c][1] }) as Parameters<typeof seriesLooks>[1];
const pair = (league: string, a: Club, b: Club) => seriesLooks(league, brand(a), brand(b));

/** What every pair must satisfy: no white-ish panel, text at AA on both blocks, the blocks apart, and the lines apart and readable on both papers. */
function assertSound([a, b]: [SideLook, SideLook], label: string) {
  for (const [side, look] of [["first", a], ["second", b]] as const) {
    assert.ok(lum(look.block) <= TOO_LIGHT, `${label}: ${side} panel #${look.block} is white-ish`);
    assert.ok(contrast(look.block, look.on) >= TEXT_CONTRAST, `${label}: text on ${side} panel is ${contrast(look.block, look.on).toFixed(2)}:1`);
    assert.ok(contrast(look.light, PAPER.light) >= 3, `${label}: ${side} line #${look.light} unreadable on light paper`);
    assert.ok(contrast(look.dark, PAPER.dark) >= 3, `${label}: ${side} line #${look.dark} unreadable on dark paper`);
  }
  assert.ok(deltaE(a.block, b.block) >= APART, `${label}: blocks #${a.block} and #${b.block} are alike (${deltaE(a.block, b.block).toFixed(1)})`);
  assert.ok(deltaE(a.light, b.light) >= APART, `${label}: light lines alike`);
  assert.ok(deltaE(a.dark, b.dark) >= APART, `${label}: dark lines alike`);
}

test("the bug: Rays vs Yankees, the Yankees panel is a distinct blue, not white", () => {
  const [rays, yankees] = pair("mlb", "rays", "yankees");
  assert.equal(rays.block, "092c5c");
  assert.notEqual(yankees.block, "ffffff");
  assert.ok(lum(yankees.block) < 0.3);
  assert.ok(deltaE(rays.block, yankees.block) >= APART);
  assertSound([rays, yankees], "rays-yankees");
});

test("Yankees vs Red Sox: nothing close, each keeps its own primary", () => {
  const [yankees, redSox] = pair("mlb", "yankees", "redSox");
  assert.equal(yankees.block, "132448");
  assert.equal(redSox.block, "bd3039");
  assertSound([yankees, redSox], "yankees-redsox");
});

test("Leafs vs Canadiens: nothing close", () => {
  const [leafs, habs] = pair("nhl", "leafs", "canadiens");
  assert.equal(leafs.block, "00205b");
  assert.equal(habs.block, "a6192e");
  assertSound([leafs, habs], "leafs-canadiens");
});

test("Dodgers vs Padres, either way round: the white secondary is never used", () => {
  const [dodgers, padres] = pair("mlb", "dodgers", "padres");
  assert.equal(dodgers.block, "005a9c");
  assertSound([dodgers, padres], "dodgers-padres");
  const [padres2, dodgers2] = pair("mlb", "padres", "dodgers");
  assert.equal(dodgers2.block, "005a9c");
  assertSound([padres2, dodgers2], "padres-dodgers");
});

test("Rams vs Chargers: two blues", () => {
  const [rams, chargers] = pair("nfl", "rams", "chargers");
  assert.equal(rams.block, "003594");
  assertSound([rams, chargers], "rams-chargers");
  assertSound(pair("nfl", "chargers", "rams"), "chargers-rams");
});

test("two reds: Red Wings (secondary the same red) vs Blackhawks", () => {
  const [wings, hawks] = pair("nhl", "redWings", "blackhawks");
  assertSound([wings, hawks], "wings-hawks");
  assert.equal(hawks.block, "010101", "the Blackhawks take their black");
  const [hawks2, wings2] = pair("nhl", "blackhawks", "redWings");
  assertSound([hawks2, wings2], "hawks-wings");
  assert.notEqual(wings2.block, "c8102e", "the second red gives way");
});

test("two reds with a dark second colour: Falcons vs Buccaneers, Angels vs Cardinals", () => {
  assertSound(pair("nfl", "falcons", "buccaneers"), "falcons-buccaneers");
  assertSound(pair("mlb", "angels", "cardinals"), "angels-cardinals");
});

test("the same club twice and clubs with no colours still give a sound pair", () => {
  assertSound(pair("mlb", "yankees", "yankees"), "yankees-yankees");
  const [x, y] = seriesLooks("nhl", null, null);
  assert.ok(contrast(x.block, x.on) >= TEXT_CONTRAST && contrast(y.block, y.on) >= TEXT_CONTRAST);
  assert.notEqual(y.block, "ffffff");
});

test("every pair among the sampled clubs is sound, in either order", () => {
  const clubs = Object.keys(CLUB) as Club[];
  for (const a of clubs) for (const b of clubs) assertSound(pair("mlb", a, b), `${a}-${b}`);
});

/** NWSL colours as db/seed/nwsl_colour.csv holds them (secondary empty where the article states none). */
const NWSL: Record<string, [string, string | null]> = {
  thorns: ["99242B", "000000"], dash: ["FF6900", "8AB7E9"], pride: ["61259E", "00ABFF"], courage: ["00416B", "B4A269"],
  louisville: ["14002F", "C5B5F2"], current: ["CF3339", "62CBC9"], wave: ["032E62", "FC1896"], bay: ["0C2032", "FF5049"],
  royals: ["0E1735", "FDB71A"], stars: ["072743", "DA1A23"], reign: ["292431", "D0A66B"], gotham: ["000000", "A9F1FD"],
  breakers: ["0A3BD1", null], fckc: ["003F77", null], spirit: ["000000", "EDE939"], angelCity: ["000000", "F1B1A5"],
};

test("every pair of NWSL clubs is sound, in either order (Gotham v Spirit are both black)", () => {
  const side = (k: string) => ({ primary_hex: NWSL[k][0], secondary_hex: NWSL[k][1] }) as Parameters<typeof seriesLooks>[1];
  for (const a of Object.keys(NWSL)) for (const b of Object.keys(NWSL)) if (a !== b) assertSound(seriesLooks("nwsl", side(a), side(b)), `${a}-${b}`);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { KYOGIJO_STYLE, PARKS, PARK_IDS, SPORTS } from "@johnmorrisdotca/kyogijo-stadiums";
import { eraOf, erasOf, MLB_PARK_IDS, MLB_PARKS, parkExtras, parkIdFor, parseSurfaceFile, SURFACE_SPORT, surfaceFileName } from "../src/lib/venuePark.ts";

/** Run in web/: pnpm test:venues */

test("every park key we map to is one kyogijo knows, and every current MLB park of kyogijo is mapped", () => {
  for (const id of Object.keys(MLB_PARKS)) assert.ok(PARK_IDS.includes(id), `kyogijo has no park ${id}`);
  const current = PARK_IDS.filter((id) => PARKS[id].league === "MLB" && PARKS[id].status === "current");
  assert.equal(current.length, 30);
  assert.deepEqual(current.filter((id) => !(id in MLB_PARKS)), [], "a current MLB park with no name map");
});

test("a park's own name from kyogijo finds that park, and no name belongs to two parks", () => {
  const seen = new Map<string, string>();
  for (const [id, names] of Object.entries(MLB_PARKS)) {
    assert.equal(parkIdFor([PARKS[id].name], true), id, PARKS[id].name);
    assert.ok(names.includes(PARKS[id].name), `${id}: kyogijo's name ${PARKS[id].name} is not in the map`);
    for (const n of names) {
      const key = n.toLowerCase().replace(/[^a-z0-9]/g, "");
      assert.ok(!seen.has(key) || seen.get(key) === id, `${n} is both ${seen.get(key)} and ${id}`);
      seen.set(key, id);
    }
  }
});

test("a park is found by an old sponsor's name, any case or accent, among the venue's other names", () => {
  assert.equal(parkIdFor(["Minute Maid Park"], true), "daikin-park");
  assert.equal(parkIdFor(["guaranteed rate field"], true), "rate-field");
  assert.equal(parkIdFor(["Skydôme", "SkyDome"], true), "rogers-centre");
  assert.equal(parkIdFor(["Pacific Bell Park", "AT&T Park", "Oracle Park"], true), "oracle-park");
  assert.equal(parkIdFor(["Some Name Now", "Fenway Park"], true), "fenway-park");
});

test("a past park gets the generic field, even if a current park has its name; so does a name we do not know", () => {
  assert.equal(parkIdFor(["Yankee Stadium"], false), null, "the first Yankee Stadium");
  assert.equal(parkIdFor(["Busch Stadium"], false), null);
  assert.equal(parkIdFor(["Olympic Stadium", "Stade olympique"], true), null);
  assert.equal(parkIdFor([], true), null);
});

test("a park is found by its Wikidata id: every MLB park of kyogijo, past or present, finds itself", () => {
  assert.equal(MLB_PARK_IDS.length, 74);
  for (const id of MLB_PARK_IDS) assert.equal(parkIdFor([], false, PARKS[id].wikidata), id, id);
  assert.equal(parkIdFor(["Olympic Stadium", "Stade olympique"], false, "Q285467"), "olympic-stadium-montreal");
  assert.equal(parkIdFor(["Jarry Park"], false, "Q3495641"), "jarry-park-stadium");
  assert.equal(parkIdFor(["Exhibition Stadium"], false, "Q1383747"), "exhibition-stadium");
  assert.equal(parkIdFor(["Polo Grounds"], false, "Q1276360"), "polo-grounds");
  assert.equal(parkIdFor(["Yankee Stadium"], false, "Q675214"), "yankee-stadium-1923", "the first Yankee Stadium is its own park, not today's");
});

test("an id of no MLB park (an NPB park, a made-up one, none) falls back to the names, and only for a park a club plays in now", () => {
  const npb = PARK_IDS.find((id) => PARKS[id].league === "NPB") as string;
  assert.equal(parkIdFor(["Some Ground"], true, PARKS[npb].wikidata), null);
  assert.equal(parkIdFor(["Fenway Park"], true, "Q0"), "fenway-park");
  assert.equal(parkIdFor(["Fenway Park"], true, null), "fenway-park");
  assert.equal(parkIdFor(["Fenway Park"], false, null), null);
});

test("every sport we draw is one kyogijo draws", () => {
  for (const sport of Object.values(SURFACE_SPORT)) assert.ok((SPORTS as readonly string[]).includes(sport), sport);
});

test("a season is held to the era of the rules it fell in; today's drawing has no era", () => {
  assert.equal(eraOf("nhl", null, null), null);
  assert.equal(eraOf("nhl", null, 2019), null, "after the last change");
  assert.equal(eraOf("nhl", null, 2014), null, "the last change is today's");
  assert.equal(eraOf("nhl", null, 2013), 2012);
  assert.equal(eraOf("nhl", null, 1999), 1998);
  assert.equal(eraOf("nhl", null, 1942), 1942, "before the first change: the season before it");
  assert.equal(eraOf("nhl", null, 1900), 1942);
  assert.equal(eraOf("nfl", null, 1993), null, "the NFL's last change was 1974");
  assert.equal(eraOf("nfl", null, 1960), 1945);
  assert.equal(eraOf("mlb", null, 1990), 1969);
});

test("a past park is held to the seasons it was used, and to its own eras", () => {
  assert.equal(eraOf("mlb", "olympic-stadium-montreal", 2004), 1983, "after its dated fence: the last fence");
  assert.equal(eraOf("mlb", "olympic-stadium-montreal", 1981), 1981);
  assert.equal(eraOf("mlb", "olympic-stadium-montreal", 1970), 1977, "a season before it opened for MLB");
  assert.equal(eraOf("mlb", "olympic-stadium-montreal", 3000), 1983);
  assert.equal(eraOf("mlb", "polo-grounds", 1915), 1911);
  assert.equal(eraOf("mlb", "polo-grounds", 1905), 1903);
  assert.equal(eraOf("mlb", "polo-grounds", 1950), 1923, "after the last period: the park's last fence");
  assert.equal(eraOf("mlb", "fenway-park", 1950), null, "a park that stands is drawn as it is");
  assert.equal(eraOf("mlb", "fenway-park", null), null);
});

test("every file a venue can name exists exactly once, and a drawing's era is among the eras of its file", () => {
  for (const sport of Object.values(SURFACE_SPORT)) {
    const eras = erasOf(sport, null);
    assert.equal(new Set(eras).size, eras.length, sport);
    assert.ok(eras.includes(null), `${sport} has today's drawing`);
    for (let y = 1880; y <= 2030; y++) assert.ok(eras.includes(eraOf(sport, null, y)), `${sport} ${y}`);
  }
  for (const id of MLB_PARK_IDS) {
    const eras = erasOf("mlb", id);
    assert.equal(new Set(eras).size, eras.length, id);
    for (let y = 1880; y <= 2030; y++) assert.ok(eras.includes(eraOf("mlb", id, y)), `${id} ${y}`);
    assert.equal(eras.includes(null), PARKS[id].status !== "past", id);
  }
  assert.ok(MLB_PARK_IDS.reduce((n, id) => n + erasOf("mlb", id).length, 0) < 200, "the number of files has grown");
});

test("walls and quirks are turned on only where a park has figures for them", () => {
  assert.deepEqual(parkExtras("wrigley-field", null), { walls: true, quirks: true });
  assert.equal(parkExtras("tropicana-field", null).walls, false);
  assert.deepEqual(parkExtras(null, null), { walls: false, quirks: false });
  assert.equal(parkExtras("metrodome", 1990).walls, true);
});

test("a surface file name round-trips, and a name that is none is refused", () => {
  assert.equal(surfaceFileName("nfl", null, "en"), "nfl.en.svg");
  assert.equal(surfaceFileName("nhl", null, "ja", 1997), "nhl_1997.ja.svg");
  assert.deepEqual(parseSurfaceFile("nfl.en.svg"), { sport: "nfl", park: null, era: null, language: "en" });
  assert.deepEqual(parseSurfaceFile("nhl_1997.ja.svg"), { sport: "nhl", park: null, era: 1997, language: "ja" });
  assert.deepEqual(parseSurfaceFile(surfaceFileName("mlb", "fenway-park", "ja")), { sport: "mlb", park: "fenway-park", era: null, language: "ja" });
  assert.deepEqual(parseSurfaceFile(surfaceFileName("mlb", "yankee-stadium-1923", "en", 1923)), { sport: "mlb", park: "yankee-stadium-1923", era: 1923, language: "en" });
  for (const id of MLB_PARK_IDS) for (const era of erasOf("mlb", id)) assert.deepEqual(parseSurfaceFile(surfaceFileName("mlb", id, "en", era)), { sport: "mlb", park: id, era, language: "en" });
  for (const bad of ["", "nfl.fr.svg", "nfl-fenway-park.en.svg", "soccer.en.svg", "../mlb.en.svg", "nfl.en.svg/x", "mlb-.en.svg", "nhl_97.en.svg", "nhl_.en.svg"]) assert.equal(parseSurfaceFile(bad), null, bad);
});

test("the stylesheet inside a surface file can have its page-only selector cut (venueDraw.ts), so the dark colours follow the browser", () => {
  assert.ok(KYOGIJO_STYLE.includes("html:not([data-theme=light]) "), "kyogijo changed how its dark colours are chosen: check lib/venueDraw.ts");
  assert.ok(KYOGIJO_STYLE.includes("@media (prefers-color-scheme:dark)"));
});

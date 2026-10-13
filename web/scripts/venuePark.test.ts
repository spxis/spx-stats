import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { KYOGIJO_STYLE, PARKS, PARK_IDS, SPORTS } from "@johnmorrisdotca/kyogijo";
import { MLB_PARKS, parkIdFor, SURFACE_SPORT } from "../src/lib/venuePark.ts";

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

test("every sport we draw is one kyogijo draws", () => {
  for (const sport of Object.values(SURFACE_SPORT)) assert.ok((SPORTS as readonly string[]).includes(sport), sport);
});

test("components/kyogijo.css is the stylesheet of the installed kyogijo, so the pages can link it instead of carrying it", () => {
  const css = readFileSync(new URL("../src/components/kyogijo.css", import.meta.url), "utf8");
  assert.equal(css.slice(css.indexOf("*/\n") + 3).trim(), KYOGIJO_STYLE.trim(), "copy KYOGIJO_STYLE into src/components/kyogijo.css again");
});

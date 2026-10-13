import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { listQuery, PLAYER_LISTED, playerQuery } from "../src/lib/listQuery.ts";

/** Run in web/: pnpm test:playerlist. Soccer people (World Cup) are in api.player_index with no league; no five-league player list may show them. */

const order = [{ field: "name", dir: "asc" as const }, { field: "person_id", num: true, dir: "asc" as const }];
const select = ["person_id", "name", "leagues"];
const has = (q: string) => q.split("&").includes(PLAYER_LISTED);

test("the filter keeps rows whose leagues is neither null nor empty", () => {
  assert.equal(PLAYER_LISTED, "leagues=neq.%7B%7D");
});

test("a player query always carries it: plain, searched, in a league, paged by cursor", () => {
  assert.ok(has(playerQuery({ filters: [], select, order })));
  assert.ok(has(playerQuery({ filters: ["search=like.%2Awayne%2A"], select, order })));
  assert.ok(has(playerQuery({ filters: ["leagues=cs.%7Bnhl%7D", "country=eq.CA"], select, order, after: ["Gretzky", 7] })));
  assert.ok(has(playerQuery({ filters: ["first_season=lte.2000"], select, order, after: null })));
  assert.ok(!has(listQuery({ filters: [], select, order })), "the plain builder adds nothing");
});

test("every read of the player views in the code goes through the filter", () => {
  const dir = new URL("../src/lib/", import.meta.url);
  // reads by person id (rosters, coach lists, league links; listQuery.ts only defines the filter) are not lists: they never page through the index
  const byId = new Set(["roster.ts", "coachData.ts", "playerLinks.ts", "listQuery.ts"]);
  const listReaders = new Set<string>();
  for (const f of readdirSync(dir).filter((n) => /\.tsx?$/.test(n) && !byId.has(n))) {
    const src = readFileSync(new URL(f, dir), "utf8");
    if (!/["`']player_(index|search)["`']/.test(src)) continue;
    listReaders.add(f);
    assert.ok(/PLAYER_LISTED|playerQuery/.test(src), `${f} reads player_index/player_search without PLAYER_LISTED or playerQuery`);
  }
  assert.deepEqual([...listReaders].sort(), ["listApi.ts", "playerIndex.ts"]);
  assert.match(readFileSync(new URL("listApi.ts", dir), "utf8"), /rowsSlice\("player_search", playerQuery\(/);
  assert.match(readFileSync(new URL("playerIndex.ts", dir), "utf8"), /playerQuery\(\{ filters, select, order, after: win\.after \}\)/);
});

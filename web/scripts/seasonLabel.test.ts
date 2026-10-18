import assert from "node:assert/strict";
import { test } from "node:test";
import { seasonLabel, seasonSeg } from "../src/lib/leagues.ts";
import { parseSeasonSeg, seasonPath } from "../src/lib/slug.ts";

/** Run in web/: pnpm test:labels. The label is for the reader (1999-2000 across a century); the address segment never changes (1999-00). */
test("a two-year season is shown in full only when the second year starts a century", () => {
  assert.equal(seasonLabel("nhl", 1999), "1999-2000");
  assert.equal(seasonLabel("nba", 1899), "1899-1900");
  assert.equal(seasonLabel("wha", 2099), "2099-2100");
  assert.equal(seasonLabel("nhl", 2000), "2000-01");
  assert.equal(seasonLabel("nhl", 1998), "1998-99");
  assert.equal(seasonLabel("nhl", 1993), "1993-94");
});

test("the address segment keeps the short form, so no address changes", () => {
  assert.equal(seasonSeg("nhl", 1999), "1999-00");
  assert.equal(seasonSeg("nba", 1899), "1899-00");
  assert.equal(seasonSeg("nhl", 2000), "2000-01");
  assert.equal(seasonPath("nhl", 1999), "/nhl/1999-00");
  assert.deepEqual(parseSeasonSeg("nhl", "1999-00"), { y: 1999, canonical: true });
});

test("the other leagues are one year, whatever the century", () => {
  assert.equal(seasonLabel("nfl", 1999), "1999");
  assert.equal(seasonSeg("nfl", 1999), "1999");
  assert.equal(seasonLabel("mlb", 1999), "1999");
});

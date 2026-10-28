import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { SOURCE_REGISTRY } from "../src/data/sourceRegistry.ts";
import { byTier, greyOnlyBySource, greySourcesIn, isGrey } from "../src/lib/adminSources.ts";
import { PHRASES } from "../src/lib/i18n/phrases.constants.ts";

/** Run in web/: pnpm test:sources. The registry snapshot must be what scripts/daily/sources.py says (regenerate with scripts/daily/sources_export.py). */

test("the snapshot agrees with the registry and the db/build step", () => {
  execFileSync("python3", ["-I", "scripts/daily/sources_export.py", "--check"], { cwd: new URL("../..", import.meta.url) });
});

test("every grey source carries notes, a daily cap and a spacing; the grey list is John's", () => {
  const grey = SOURCE_REGISTRY.filter(isGrey);
  assert.deepEqual(grey.map((s) => s.id).sort(), ["cfl_api", "fangraphs", "hockeytech", "ncaa_stats", "transfermarkt"]);
  for (const s of grey) {
    assert.ok(s.notes.length > 20, s.id);
    assert.ok(s.dailyCap && s.spacingSeconds, s.id);
  }
});

test("the list shows green first, then grey, then confirm-only, then red", () => {
  const tiers = byTier().map((s) => s.tier);
  const order = ["green", "grey", "red-confirm", "red"];
  assert.deepEqual([...tiers].sort((a, b) => order.indexOf(a) - order.indexOf(b)), tiers);
});

test("a run names a grey source by id, by id with a suffix or by host; green and red sources never light the marker", () => {
  const ids = (t: Array<string | null>) => greySourcesIn(t).map((s) => s.id).sort();
  assert.deepEqual(ids(["grey-fetch", "fangraphs"]), ["fangraphs"]);
  assert.deepEqual(ids(["ncaa_stats:2025"]), ["ncaa_stats"]);
  assert.deepEqual(ids(["fetched https://stats.ncaa.org/contests/1/box_score"]), ["ncaa_stats"]);
  assert.deepEqual(ids(["wikipedia", "nhl_api", "daily-scores", null]), []);
  assert.deepEqual(ids(["cfbd"]), [], "CollegeFootballData is green");
});

test("the grey-only report adds up per source, biggest first", () => {
  const out = greyOnlyBySource([
    { source: "b", entity_kind: "game", n_rows: 2 },
    { source: "a", entity_kind: "game", n_rows: 5 },
    { source: "b", entity_kind: "person", n_rows: 4 },
  ]);
  assert.deepEqual(out.map((g) => [g.source, g.total]), [["b", 6], ["a", 5]]);
});

test("every phrase the page and the marker use exists", () => {
  for (const k of ["asrc.title", "asrc.greyArea", "asrc.greyAreaHint", "asrc.report.title", "asrc.report.missing", "asrc.report.none", "runs.greyArea", "adminNav.sources", "asrc.tier.grey"]) {
    assert.ok(k in PHRASES, k);
  }
});

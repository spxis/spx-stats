import assert from "node:assert/strict";
import { test } from "node:test";
import { provenanceTriples, sourceGroup, sourcesByCount, sum, weight, type ProvRow } from "../src/lib/provenance.ts";

/** Run in web/: pnpm test:provenance */
const rows: ProvRow[] = [
  { kind: "game", league: "nhl", source: "spx_database", checked_by: "nhl_api", outcome: "confirmed", n: 100 },
  { kind: "game", league: "nhl", source: "spxn_database", checked_by: "nhl_api", outcome: "confirmed", n: 20 },
  { kind: "game", league: "nhl", source: "spx_database", checked_by: "nhl_api", outcome: "disputed", n: 3 },
  { kind: "game", league: "nhl", source: "nhl_api", checked_by: null, outcome: "single", n: 500 },
  { kind: "game", league: "mlb", source: "retrosheet", checked_by: null, outcome: "single", n: 900 },
  { kind: "person", league: null, source: "lahman", checked_by: null, outcome: "single", n: 40 },
  { kind: "venue", league: null, source: "lahman", checked_by: null, outcome: "single", n: 7 },
  { kind: "game", league: "nhl", source: "nhl_api", checked_by: null, outcome: "maybe", n: 5 },
  { kind: "game", league: "nhl", source: "nhl_api", checked_by: null, outcome: "single", n: 0 },
];

test("SPX's databases are one source", () => {
  assert.equal(sourceGroup("spx_database"), "spx");
  assert.equal(sourceGroup("spxn_database"), "spx");
  assert.equal(sourceGroup("spx_files"), "spx");
  assert.equal(sourceGroup("spx_stats_derived"), "spx_stats_derived");
  assert.equal(sourceGroup("retrosheet"), "retrosheet");
  assert.equal(sourceGroup(null), "unknown");
});

test("every league keeps all records, people included; kinds, outcomes and empty rows the diagram does not know are left out", () => {
  const all = provenanceTriples(rows, null);
  assert.equal(sum(all), 100 + 20 + 3 + 500 + 900 + 40);
  const spxConfirmed = all.find((t) => t.source === "spx" && t.outcome === "confirmed")!;
  assert.equal(spxConfirmed.n, 120);
  assert.deepEqual([...spxConfirmed.checkers], [["nhl_api", 120]]);
});

test("one league keeps its own records and no people", () => {
  const nhl = provenanceTriples(rows, "nhl");
  assert.equal(sum(nhl), 623);
  assert.ok(nhl.every((t) => t.kind === "game"));
  assert.deepEqual(sourcesByCount(nhl), ["nhl_api", "spx"]);
});

test("a heavy count does not hide a light one", () => {
  assert.ok(weight(200000) / weight(450) < 10);
  assert.ok(weight(1) > 0);
});

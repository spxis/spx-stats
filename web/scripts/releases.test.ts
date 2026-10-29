import assert from "node:assert/strict";
import { test } from "node:test";
import { plainMarks, splitMarks } from "../src/lib/localTime.ts";
import { readFileSync } from "node:fs";
import { barMessages, driftState, healthLine, releaseTarget, requestBlock, TURSO_TABLES, waitingCount, type SyncRow } from "../src/lib/releases/rules.ts";

/** Run in web/: pnpm test:releases */
const row = (table_name: string, state: "same" | "differs", checked_at: string): SyncRow => ({ table_name, ds1_rows: 1, prod_rows: 1, state, checked_at, detail: null });
const NOW = Date.parse("2026-10-13T12:00:00Z");

test("a mismatch that a later release overtook is out of date, not a mismatch", () => {
  const sync = [row("core.game", "differs", "2026-10-13T03:57:00Z"), row("core.person", "differs", "2026-10-13T03:57:00Z"), row("core.venue", "same", "2026-10-13T03:57:00Z")];
  const releases = [
    { number: "2026.10.13-1", tables: ["core.game"], status: "done", finished_at: "2026-10-13T09:00:00Z" },
    { number: "2026.10.13-2", tables: ["core.game", "core.venue"], status: "done", finished_at: "2026-10-13T10:00:00Z" },
  ];
  const s = driftState(sync, releases, NOW);
  assert.deepEqual(s.differs.map((d) => d.table_name), ["core.person"]);
  assert.deepEqual(s.outdated.map((d) => d.table_name), ["core.game"]);
  assert.equal(s.newerRelease, "2026.10.13-2");
  assert.equal(s.stale, false);
});

test("rows the runner wrote after the release are current again", () => {
  const sync = [row("core.game", "same", "2026-10-13T10:00:05Z")];
  const s = driftState(sync, [{ number: "2026.10.13-2", tables: ["core.game"], status: "done", finished_at: "2026-10-13T10:00:00Z" }], NOW);
  assert.equal(s.differs.length + s.outdated.length, 0);
});

test("a release that touched other tables, or has not finished, changes nothing", () => {
  const sync = [row("core.game", "differs", "2026-10-13T03:57:00Z")];
  const s = driftState(sync, [
    { number: "2026.10.13-1", tables: ["core.person"], status: "done", finished_at: "2026-10-13T09:00:00Z" },
    { number: "2026.10.13-2", tables: ["core.game"], status: "running", finished_at: null },
  ], NOW);
  assert.deepEqual(s.differs.map((d) => d.table_name), ["core.game"]);
  assert.equal(s.outdated.length, 0);
  assert.equal(s.newerRelease, null);
});

test("no comparison at all, or an old one, is stale", () => {
  assert.equal(driftState([], [], NOW).stale, true);
  assert.equal(driftState([row("core.game", "same", "2026-10-11T00:00:00Z")], [], NOW).stale, true);
});

test("the cooldown of a drift check does not block a scores request, but an open request of any kind blocks both", () => {
  const drift = { id: 7, kind: "drift", status: "done", requested_at: "2026-10-13T11:55:00Z", finished_at: "2026-10-13T11:56:00Z" };
  assert.match(plainMarks(requestBlock([drift], NOW, 10, "drift") ?? ""), /ask again at 12:06 UTC/);
  assert.equal(requestBlock([drift], NOW, 10, "scores"), null);
  const open = { id: 8, kind: "scores", status: "queued", requested_at: "2026-10-13T12:00:00Z", finished_at: null };
  assert.match(requestBlock([open], NOW, 10, "drift") ?? "", /#8 is queued/);
});

test("a request for one league does not start the all-leagues cooldown, and the other way round the all-leagues one does (migration 150)", () => {
  const nhl = { id: 9, kind: "scores", league: "nhl", status: "done", requested_at: "2026-10-13T11:55:00Z", finished_at: "2026-10-13T11:56:00Z" };
  assert.equal(requestBlock([nhl], NOW, 10, "scores"), null);
  const all = { id: 10, kind: "scores", league: null, status: "done", requested_at: "2026-10-13T11:55:00Z", finished_at: "2026-10-13T11:56:00Z" };
  assert.match(plainMarks(requestBlock([all], NOW, 10, "scores") ?? ""), /ask again at 12:06 UTC/);
  assert.match(requestBlock([{ ...nhl, status: "running", finished_at: null }], NOW, 10, "scores") ?? "", /#9 is running/, "an open league request blocks the all-leagues one");
});

test("the API health line: no outage, one that is over, one still going", () => {
  const e = { failing_since: "2026-10-14T07:00:00+00:00", detected_at: "2026-10-14T07:04:00+00:00", probes_failed: 90, reload_at: "2026-10-14T07:04:00+00:00", restart_at: "2026-10-14T07:09:00+00:00", recovered_at: null, last_error: "HTTP 503 PGRST002" };
  assert.equal(healthLine([]).kind, "none");
  const down = healthLine([e]);
  assert.equal(down.kind, "down");
  assert.match(plainMarks(down.text), /failing from 2026-10-14 07:00 UTC/);
  assert.match(plainMarks(down.text), /schema reload 07:04 UTC, project restart 07:09 UTC/);
  assert.equal(splitMarks(down.text).filter((p) => typeof p !== "string").length, 3, "the three times are marks, drawn in the reader's zone");
  const past = healthLine([{ ...e, recovered_at: "2026-10-14T07:30:00+00:00" }, { ...e, failing_since: "2026-10-10T01:00:00+00:00" }]);
  assert.equal(past.kind, "past");
  assert.match(plainMarks(past.text), /2026-10-14 07:00 UTC to 07:30 UTC \(30 min\)/);
  assert.match(past.text, /2 outages recorded/);
  assert.match(healthLine([{ ...e, reload_at: null, restart_at: null }]).text, /has not acted yet/);
});

test("the account menu counts what waits for the admin, from the summary the banner reads", () => {
  assert.equal(waitingCount(null), 0);
  assert.equal(waitingCount(undefined), 0);
  assert.equal(waitingCount({ waiting: 0, drift: 0, paused: false }), 0);
  assert.equal(waitingCount({ waiting: 1, drift: 0, paused: false }), 1);
  assert.equal(waitingCount({ waiting: 2, drift: 0, paused: false }), 2);
  // a drift fix that is not auto-approvable is a pending release: it is in `waiting` already and counts once
  assert.equal(waitingCount({ waiting: 1, drift: 1, paused: false }), 1);
  assert.equal(waitingCount({ waiting: 3, drift: 1, paused: false }), 3);
  // a drift fix that approves itself is not waiting, but the bar names it, so the menu does too
  assert.equal(waitingCount({ waiting: 0, drift: 1, paused: false }), 1);
  // failed releases that need a look are added; summaries from before migration 106 have no `failed`
  assert.equal(waitingCount({ waiting: 1, drift: 1, paused: false, failed: 1 }), 2);
  assert.equal(waitingCount({ waiting: 0, drift: 0, paused: false, failed: 2 }), 2);
  assert.equal(waitingCount({ waiting: 1, drift: 0, paused: false, failed: 0 }), 1);
  // Hold is a state, not an item
  assert.equal(waitingCount({ waiting: 0, drift: 0, paused: true }), 0);
  assert.equal(waitingCount({ waiting: 2, drift: 0, paused: true }), 2);
  // junk never counts
  assert.equal(waitingCount({ waiting: -1, drift: Number.NaN, paused: false, failed: 1.9 }), 1);
});

test("the bar names a failed release, and the menu count and the bar agree on whether anything waits", () => {
  const cases = [
    { waiting: 0, drift: 0, paused: false },
    { waiting: 1, drift: 0, paused: false },
    { waiting: 0, drift: 1, paused: false },
    { waiting: 0, drift: 0, paused: false, failed: 1 },
    { waiting: 2, drift: 1, paused: true, failed: 3 },
    { waiting: 0, drift: 0, paused: true },
  ];
  for (const c of cases) {
    const items = barMessages(c).filter((m) => !m.includes("Hold"));
    assert.equal(waitingCount(c) > 0, items.length > 0, JSON.stringify(c));
  }
  assert.deepEqual(barMessages({ waiting: 0, drift: 0, paused: false, failed: 1 }), ["1 failed release needs a look"]);
  assert.deepEqual(barMessages({ waiting: 0, drift: 0, paused: false, failed: 2 }), ["2 failed releases need a look"]);
  assert.deepEqual(barMessages({ waiting: 0, drift: 0, paused: false, failed: 0 }), []);
});

test("the Turso table list matches TABLES in scripts/release/turso.py", () => {
  const src = readFileSync(new URL("../../scripts/release/turso.py", import.meta.url), "utf8");
  const fromPython = [...src.matchAll(/^    "([a-z_]+\.[a-z_]+)": /gm)].map((m) => m[1]).sort();
  assert.deepEqual([...TURSO_TABLES].sort(), fromPython);
});

test("where a release writes: DS1 step, Turso, production; the preview wins when present", () => {
  const turso = ["meta.verification", "meta.data_issue"];
  // approved and recent rows come without a preview (the dashboard strips it)
  assert.equal(releaseTarget({ kind: "publish", tables: turso, preview: null }), "turso");
  assert.equal(releaseTarget({ kind: "publish", tables: ["meta.verification", "api.totals"] }), "turso");
  // pending row with a preview that names the target
  assert.equal(releaseTarget({ kind: "publish", tables: turso, preview: { target: "turso" } }), "turso");
  assert.equal(releaseTarget({ kind: "publish", tables: ["core.game"], preview: { target: "production" } }), "production");
  // a production row
  assert.equal(releaseTarget({ kind: "publish", tables: ["core.game", "meta.verification"] }), "production");
  assert.equal(releaseTarget({ kind: "publish", tables: ["core.game"], preview: null }), "production");
  // a DS1 step, whatever its tables
  assert.equal(releaseTarget({ kind: "ds1_step", tables: turso }), "ds1");
  // no tables at all is not a Turso release
  assert.equal(releaseTarget({ kind: "publish", tables: [] }), "production");
});

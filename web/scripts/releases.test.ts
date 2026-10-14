import assert from "node:assert/strict";
import { test } from "node:test";
import { driftState, healthLine, requestBlock, type SyncRow } from "../src/lib/releases/rules.ts";

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
  assert.match(requestBlock([drift], NOW, 10, "drift") ?? "", /ask again at 12:06 UTC/);
  assert.equal(requestBlock([drift], NOW, 10, "scores"), null);
  const open = { id: 8, kind: "scores", status: "queued", requested_at: "2026-10-13T12:00:00Z", finished_at: null };
  assert.match(requestBlock([open], NOW, 10, "drift") ?? "", /#8 is queued/);
});

test("the API health line: no outage, one that is over, one still going", () => {
  const e = { failing_since: "2026-10-14T07:00:00+00:00", detected_at: "2026-10-14T07:04:00+00:00", probes_failed: 90, reload_at: "2026-10-14T07:04:00+00:00", restart_at: "2026-10-14T07:09:00+00:00", recovered_at: null, last_error: "HTTP 503 PGRST002" };
  assert.equal(healthLine([]).kind, "none");
  const down = healthLine([e]);
  assert.equal(down.kind, "down");
  assert.match(down.text, /failing from 2026-10-14 07:00 UTC/);
  assert.match(down.text, /schema reload 07:04, project restart 07:09 UTC/);
  const past = healthLine([{ ...e, recovered_at: "2026-10-14T07:30:00+00:00" }, { ...e, failing_since: "2026-10-10T01:00:00+00:00" }]);
  assert.equal(past.kind, "past");
  assert.match(past.text, /2026-10-14 07:00 to 07:30 UTC \(30 min\)/);
  assert.match(past.text, /2 outages recorded/);
  assert.match(healthLine([{ ...e, reload_at: null, restart_at: null }]).text, /has not acted yet/);
});

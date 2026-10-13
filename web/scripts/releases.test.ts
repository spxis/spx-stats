import assert from "node:assert/strict";
import { test } from "node:test";
import { driftState, requestBlock, type SyncRow } from "../src/lib/releases/rules.ts";

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

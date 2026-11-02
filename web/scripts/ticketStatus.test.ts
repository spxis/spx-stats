import assert from "node:assert/strict";
import { test } from "node:test";
import { gatherStatus, projectOf, render } from "./ticketStatus.ts";

/** Run in web/: pnpm test:ticketstatus */

const NOW = Date.parse("2026-11-02T12:00:00Z");
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const t = (extra: object) => ({ title: "x", status: "open", claimedBy: null, ...extra }) as never;

const boards: Record<string, { status: number; tickets: never[] }> = {
  "spx-stats": {
    status: 200,
    tickets: [
      t({ title: "page weight: lighter lists", shortId: "SPX-1" }),
      t({ title: "kyogijo-stadiums: roof", shortId: "SPX-2", status: "inProgress", claimedBy: "machine2", claimedAt: ago(1) }),
      t({ title: "kyogijo-stadiums: lights", shortId: "SPX-3", status: "inProgress", claimedBy: "machine1", claimedAt: ago(72) }),
      t({ title: "senshu-jerseys: belt", status: "done", releasedAt: ago(24) }),
      t({ title: "senshu-jerseys: old", status: "done", releasedAt: ago(24 * 20) }),
    ],
  },
  modules: { status: 200, tickets: [t({ title: "meigen-sports: a", seq: 5 }), t({ title: "fuda-cards: b", seq: 6 }), t({ title: "tool without prefix", area: "Meet-Prompter", seq: 7 })] },
  hotaru: { status: 401, tickets: [] },
  wazadb: { status: 404, tickets: [] },
};

const deps = {
  boards: ["spx-stats", "modules", "hotaru", "wazadb", "hako-devices"],
  token: (b: string) => (b === "hako-devices" ? null : "not-a-real-token"),
  fetchTickets: async (b: string) => boards[b]!,
  versions: () => [{ name: "kazoku-ui", main: "0.6.0", npm: "0.3.0" }],
  now: NOW,
};

test("counts per board and per project, stale holds, 7-day window", async () => {
  const s = await gatherStatus(deps);
  const spx = s.boards[0]!;
  assert.ok(spx.ok);
  assert.equal(spx.open, 1);
  assert.equal(spx.inProgress, 2);
  assert.equal(spx.done7d, 1);
  assert.deepEqual(spx.groups.map((g) => g.project), ["kyogijo-stadiums", "site+data", "senshu-jerseys"]);
  assert.deepEqual(spx.holds.map((h) => [h.id, h.stale]), [["SPX-3", true], ["SPX-2", false]]);
  assert.equal(s.totals.stale, 1);
  assert.equal(s.totals.waiting, 1);
});

test("a shared board groups by prefix, then by area", async () => {
  const s = await gatherStatus(deps);
  const modules = s.boards[1]!;
  assert.ok(modules.ok);
  assert.deepEqual(modules.groups.map((g) => g.project).sort(), ["fuda-cards", "meet-prompter", "meigen-sports"]);
  assert.equal(projectOf("spx-stats", t({ title: "data: archive" })), "site+data");
});

test("a board with no key, a refused key or no board still lets the rest print", async () => {
  const s = await gatherStatus(deps);
  assert.deepEqual(s.boards.slice(2).map((b) => (b.ok ? "ok" : b.problem)), ["key refused", "no such board yet", "no key on this machine"]);
  const text = render(s);
  assert.match(text, /hako-devices: no key on this machine/);
  assert.match(text, /kazoku-ui: main 0\.6\.0, npm 0\.3\.0/);
  assert.match(text, /STALE SPX-3 machine1 \(3d\)/);
  assert.ok(text.split("\n").every((l) => l.length <= 44));
  assert.equal(/not-a-real-token/.test(JSON.stringify(s) + text), false);
});

test("an unreachable board is reported, not thrown", async () => {
  const s = await gatherStatus({ ...deps, boards: ["spx-stats"], fetchTickets: async () => { throw new Error("offline"); } });
  assert.deepEqual(s.boards[0], { board: "spx-stats", ok: false, problem: "unreachable (offline)" });
});

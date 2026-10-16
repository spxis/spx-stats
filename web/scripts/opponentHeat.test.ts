import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGrid, choiceQuery, readChoice, sortRows, winShare, type HeatCell, type OpponentHeatView } from "../src/lib/opponentHeat.ts";

/** Run in web/: pnpm test:opheat. The sums and the address choices behind a team page's record-against-each-opponent heat map. */

const opp = (f: number, name: string, lg = "nhl") => ({ f, lg, name, href: `/${lg}/team/${f}`, pair: `/${lg}/head-to-head/${f}` });
const view: OpponentHeatView = {
  lg: "nhl",
  leagues: ["nhl", "wha"],
  opps: [opp(1, "Calgary"), opp(2, "Anaheim"), opp(3, "Winnipeg", "wha")],
  cells: [
    // opp, year, phase, gp, w, l, t, otl, pf, pa
    [0, 2000, 0, 4, 3, 1, 0, 0, 12, 8],
    [0, 2000, 1, 7, 3, 4, 0, 0, 20, 22],
    [0, 2001, 0, 2, 1, 0, 1, 0, 5, 3],
    [1, 2000, 0, 10, 2, 6, 0, 2, 20, 30],
    [2, 1975, 0, 8, 4, 4, 0, 0, 30, 28],
  ] satisfies HeatCell[],
};

test("win share counts a tie as half and an overtime loss as a loss", () => {
  assert.equal(winShare({ gp: 4, w: 1, l: 1, t: 2, otl: 0, pf: 0, pa: 0 }), 0.5);
  assert.equal(winShare({ gp: 10, w: 2, l: 6, t: 0, otl: 2, pf: 0, pa: 0 }), 0.2);
  assert.equal(winShare({ gp: 0, w: 0, l: 0, t: 0, otl: 0, pf: 0, pa: 0 }), null);
});

test("all adds the two parts of the season; one part leaves the other out", () => {
  const all = buildGrid(view, "all", "nhl");
  const calgary = all.rows.find((r) => r.opp.name === "Calgary")!;
  assert.deepEqual([calgary.life.gp, calgary.life.w, calgary.life.l, calgary.life.t], [13, 7, 5, 1]);
  assert.equal(calgary.by.get(2000)!.gp, 11);
  assert.deepEqual(all.years, [2000, 2001]);
  const playoffs = buildGrid(view, "playoffs", "nhl");
  assert.deepEqual(playoffs.rows.map((r) => r.opp.name), ["Calgary"]);
  assert.equal(playoffs.rows[0].life.gp, 7);
  assert.deepEqual(playoffs.years, [2000]);
});

test("a league choice keeps only that league's opponents; null keeps all, with the gap years in between", () => {
  assert.deepEqual(buildGrid(view, "all", "wha").rows.map((r) => r.opp.name), ["Winnipeg"]);
  const every = buildGrid(view, "all", null);
  assert.equal(every.rows.length, 3);
  assert.equal(every.years.length, 27);
  assert.deepEqual(buildGrid({ ...view, cells: [] }, "all", null), { rows: [], years: [] });
});

test("rows sort by win share, games or name, either way, with a steady order for equals", () => {
  const rows = buildGrid(view, "all", null).rows;
  const names = (s: Parameters<typeof sortRows>[1], d: Parameters<typeof sortRows>[2]) => sortRows(rows, s, d, () => "?").map((r) => r.opp.name);
  assert.deepEqual(names("pct", "desc"), ["Calgary", "Winnipeg", "Anaheim"]);
  assert.deepEqual(names("games", "desc"), ["Calgary", "Anaheim", "Winnipeg"]);
  assert.deepEqual(names("name", "asc"), ["Anaheim", "Calgary", "Winnipeg"]);
  assert.deepEqual(names("name", "desc"), ["Winnipeg", "Calgary", "Anaheim"]);
});

test("the choices are read from the address and written back without their defaults", () => {
  const leagues = ["nhl", "wha"];
  const none = readChoice("", leagues, "nhl");
  assert.deepEqual(none, { phase: "all", sort: "pct", dir: "desc", league: "nhl", min: 0 });
  assert.deepEqual(choiceQuery(none, "nhl"), { hphase: null, hsort: null, hdir: null, hlg: null, hmin: null });
  const c = readChoice("?hphase=p&hsort=name&hdir=desc&hlg=all&hmin=25&x=1", leagues, "nhl");
  assert.deepEqual(c, { phase: "playoffs", sort: "name", dir: "desc", league: null, min: 25 });
  assert.deepEqual(choiceQuery(c, "nhl"), { hphase: "p", hsort: "name", hdir: "desc", hlg: "all", hmin: "25" });
  // Anything unknown falls back to the default.
  assert.deepEqual(readChoice("?hphase=z&hsort=q&hdir=up&hlg=xyz&hmin=7", leagues, "nhl"), none);
  assert.equal(readChoice("?hsort=name", leagues, "nhl").dir, "asc");
});

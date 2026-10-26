import assert from "node:assert/strict";
import { test } from "node:test";
import { packRef, type BoardData, type RefRow, type StatRow } from "../src/lib/playerBoard.ts";
import { careerRows, commonGroups, decades, peakRow, pickerQuery, radarPairs, sideOf, statLines, vsFromSearch, winner, type CompareData } from "../src/lib/playerCompare.ts";

/** Run in web/: pnpm test:playercompare */

const row = (year: number, stats: Record<string, number>, o: Partial<StatRow> = {}): StatRow =>
  ({ league: "nhl", year, ts: year * 10, f: 1, team: "Oilers", phase: "regular", group: "skater", stats, ...o });

const season = (year: number, f = 1, o: Partial<BoardData["seasons"][number]> = {}) => ({ league: "nhl", year, label: String(year), f, team: "Oilers", reg: true, po: false, teamPo: false, champ: false, ...o });

/** A skater's reference row for one year: 11 points from 0 to 1 goals a game and the average. */
const ref = (m: string, year: number): RefRow => ({ g: "skater", p: "regular", m, y: year, n: 600, a: 0.3, q: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.7, 1] });

function board(o: Partial<BoardData>): BoardData {
  return { name: "X", min: 1980, max: 1982, bucket: "F", position: "C", stats: [], seasons: [], clubs: {}, titles: [], awards: [], refs: [], held: [], ...o };
}
const data = (id: number, b: BoardData | null): CompareData =>
  ({ id, name: `P${id}`, path: `/nhl/player/p-${id}`, home: "nhl", facts: { born: null, died: null, place: null, country: null, heightCm: null, hof: null, positions: [], leagues: ["nhl"], first: 1980, last: 1982 }, board: b, positions: [] });

const refs = [1980, 1981, 1982].flatMap((y) => ["g_pg", "a_pg", "pts_pg", "sog_pg", "pm_pg"].map((m) => packRef(ref(m, y))));

const star = board({
  stats: [row(1980, { gp: 80, g: 50, a: 60, pts: 110, pim: 30 }), row(1981, { gp: 80, g: 40, a: 70, pts: 110, pim: 20 }), row(1982, { gp: 80, g: 30, a: 50, pts: 80, pim: 10 }),
    row(1981, { gp: 10, g: 5, a: 5, pts: 10 }, { phase: "playoffs" })],
  seasons: [season(1980), season(1981), season(1982, 2, { team: "Rangers" })],
  titles: [{ league: "nhl", year: 1981, team: "Oilers" }],
  awards: [{ league: "nhl", year: 1981, award: "Hart", team: "Oilers" }, { league: "nhl", year: 1982, award: "Ross", team: "Rangers" }],
  refs,
});
const role = board({
  stats: [row(1980, { gp: 60, g: 5, a: 10, pts: 15, pim: 60 }, { f: 3 }), row(1981, { gp: 70, g: 6, a: 12, pts: 18, pim: 90 }, { f: 3 })],
  seasons: [season(1980, 3), season(1981, 3)],
  refs,
});
const goalie = board({ position: "G", stats: [row(1980, { gp: 60, w: 30, l: 20, so: 3, ga: 150, toi: 3600, sv: 1500, sa: 1650 }, { group: "goalie", f: 4 })], seasons: [season(1980, 4)] });

test("winner: the higher figure, the lower where less is better, nobody when a figure is missing", () => {
  assert.equal(winner(3, 2), "a");
  assert.equal(winner(2, 3), "b");
  assert.equal(winner(3, 3), "tie");
  assert.equal(winner(2.1, 3.4, true), "a");
  assert.equal(winner(null, 3), null);
  assert.equal(winner(3, null), null);
  assert.equal(winner(Number.NaN, 3), null);
});

test("career rows count seasons, clubs, titles and awards; clubs name no winner", () => {
  const rows = Object.fromEntries(careerRows(star, role).map((r) => [r.id, r]));
  assert.deepEqual([rows.seasons.a, rows.seasons.b, rows.seasons.win], [3, 2, "a"]);
  assert.deepEqual([rows.clubs.a, rows.clubs.b, rows.clubs.win], [2, 1, null]);
  assert.deepEqual([rows.titles.a, rows.titles.b, rows.titles.win], [1, 0, "a"]);
  assert.deepEqual([rows.awards.a, rows.awards.b, rows.awards.win], [2, 0, "a"]);
});

test("a person without a playing record has no career figure and so no winner", () => {
  const rows = careerRows(star, null);
  assert.ok(rows.every((r) => r.b == null && r.win == null));
  assert.ok(careerRows(null, null).every((r) => r.a == null && r.b == null && r.win == null));
});

test("the stat groups both have are compared, in the first player's order", () => {
  const sa = sideOf(data(1, star), "regular")!, sb = sideOf(data(2, role), "regular")!, sg = sideOf(data(3, goalie), "regular")!;
  assert.deepEqual(commonGroups(sa, sb), ["skater"]);
  assert.deepEqual(commonGroups(sa, sg), []);
  assert.equal(sideOf(data(4, null), "regular"), null);
});

test("a phase with no rows in a group drops the group", () => {
  const sa = sideOf(data(1, star), "playoffs")!, sb = sideOf(data(2, role), "playoffs")!;
  assert.deepEqual(sa.groups.map((g) => g.def.id), ["skater"]);
  assert.deepEqual(sb.groups, []);
  assert.deepEqual(commonGroups(sa, sb), []);
});

test("totals and per-game figures name a winner each; penalty minutes name none", () => {
  const sa = sideOf(data(1, star), "regular")!, sb = sideOf(data(2, role), "regular")!;
  const lines = Object.fromEntries(statLines("skater", sa, sb).map((l) => [l.id, l]));
  assert.equal(lines.g.a, 120);
  assert.equal(lines.g.b, 11);
  assert.equal(lines.g.win, "a");
  assert.equal(lines.g.per?.win, "a");
  assert.equal(lines.g.per?.a, 120 / 240);
  assert.equal(lines.pim.win, null);
  assert.equal(lines.pim.per?.win, null);
  assert.equal(lines.gp.win, "a");
  assert.deepEqual(statLines("goalie", sa, sb), []);
});

test("a rate names no winner until both have played enough", () => {
  const few = board({ position: "G", stats: [row(1980, { gp: 3, w: 3, l: 0, so: 1, ga: 3, toi: 180, sv: 90, sa: 93 }, { group: "goalie", f: 4 })], seasons: [season(1980, 4)] });
  const many = board({ position: "G", stats: [row(1980, { gp: 60, w: 30, l: 20, so: 3, ga: 150, toi: 3600, sv: 1500, sa: 1650 }, { group: "goalie", f: 4 })], seasons: [season(1980, 5)] });
  const a = sideOf(data(1, few), "regular")!, b = sideOf(data(2, many), "regular")!;
  const lines = Object.fromEntries(statLines("goalie", a, b).map((l) => [l.id, l]));
  assert.equal(lines.w.win, "b");
  assert.equal(lines.gaa.win, null);
  assert.equal(lines.svp.win, null);
  const c = sideOf(data(3, many), "regular")!;
  const d = sideOf(data(4, board({ position: "G", stats: [row(1981, { gp: 60, w: 20, l: 30, so: 1, ga: 200, toi: 3600, sv: 1400, sa: 1600 }, { group: "goalie", f: 4 })], seasons: [season(1981, 6)] })), "regular")!;
  const full = Object.fromEntries(statLines("goalie", c, d).map((l) => [l.id, l]));
  assert.equal(full.gaa.win, "a");
  assert.equal(full.svp.win, "a");
  assert.equal(full.w.win, "a");
});

test("the best season is the one with the most of the headline stat", () => {
  const sa = sideOf(data(1, star), "regular")!, sb = sideOf(data(2, role), "regular")!;
  const peak = peakRow("skater", sa, sb)!;
  assert.deepEqual(peak.a, { year: 1980, value: 110 });
  assert.deepEqual(peak.b, { year: 1981, value: 18 });
  assert.equal(peak.win, "a");
  assert.equal(peakRow("goalie", sa, sb), null);
});

test("the radar keeps the axes both are placed on, and nothing without league figures or enough games", () => {
  const sa = sideOf(data(1, star), "regular")!, sb = sideOf(data(2, role), "regular")!;
  const pairs = radarPairs("skater", sa, sb);
  assert.deepEqual(pairs.map((p) => p.ref).sort(), ["a_pg", "g_pg", "pts_pg"]);
  const p = pairs.find((x) => x.ref === "g_pg")!;
  assert.ok(p.a.pct > p.b.pct);
  const bare = sideOf(data(3, board({ ...role, refs: [] })), "regular")!;
  assert.deepEqual(radarPairs("skater", sa, bare), []);
  const little = sideOf(data(4, board({ stats: [row(1980, { gp: 5, g: 1, a: 1, pts: 2 })], seasons: [season(1980, 9)], refs })), "regular")!;
  assert.deepEqual(radarPairs("skater", sa, little), []);
});

test("the picker asks the players list only for what was chosen", () => {
  assert.equal(pickerQuery({ q: "  ", league: "", position: "", decade: null }), null);
  const p = new URLSearchParams(pickerQuery({ q: " Gret ", league: "nhl", position: "C", decade: 1980 })!);
  assert.equal(p.get("q"), "Gret");
  assert.equal(p.get("league"), "nhl");
  assert.equal(p.get("position"), "C");
  assert.equal(p.get("from"), "1980");
  assert.equal(p.get("to"), "1989");
  assert.equal(p.get("limit"), "10");
  assert.equal(new URLSearchParams(pickerQuery({ q: "", league: "", position: "C", decade: null }) ?? "").get("position"), null, "a position needs a league");
  assert.equal(pickerQuery({ q: "", league: "", position: "C", decade: null }), null);
  assert.equal(new URLSearchParams(pickerQuery({ q: "a", league: "", position: "", decade: null })!).has("from"), false);
});

test("the eras are decades, newest first, from 1900", () => {
  const d = decades(2026);
  assert.equal(d[0], 2020);
  assert.equal(d.at(-1), 1900);
  assert.equal(d.length, 13);
});

test("?vs= names a person by a plain whole number only", () => {
  assert.equal(vsFromSearch("?vs=8449"), 8449);
  assert.equal(vsFromSearch("?from=1980&vs=7&phase=p"), 7);
  for (const bad of ["", "?vs=", "?vs=0", "?vs=-3", "?vs=1.5", "?vs=abc", "?vs=12345678901", "?vs=1e3"]) assert.equal(vsFromSearch(bad), null, bad);
});

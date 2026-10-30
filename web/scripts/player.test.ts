import assert from "node:assert/strict";
import { test } from "node:test";
import {
  awardBadge, bucketOf, enoughPlayed, groupViews, heroFigure, bySeason, cdfAt, clampSpan, cumulative, GROUPS, indexRefs, packRef, unpackRef, inningsText, inRange, leagueAvg, leagueFinishes, metricOf, milestonesOf,
  peakRun, peakSeason, perOf, pooledPercentile, radarOf, rankIn, refKey, shares, sumStats, topPercent, type RefRow, type StatRow,
} from "../src/lib/playerBoard.ts";
import { clubInfoKey, clubKey, type BoardData, type SeasonInfo } from "../src/lib/playerBoard.ts";
import { packBoard, readBoard } from "../src/lib/playerBoardWire.ts";
import { showStat, STAT_GROUPS } from "../src/lib/playerStats.ts";
import { playerRangeKey, parsePlayerState, playerStateText, rawPlayerSpan } from "../src/lib/playerRange.ts";

/** Run in web/: pnpm test:player */

const row = (year: number, stats: Record<string, number>, o: Partial<StatRow> = {}): StatRow =>
  ({ league: "nhl", year, ts: year * 10, f: 1, team: "Oilers", phase: "regular", group: "skater", stats, ...o });

const career: StatRow[] = [
  row(1979, { gp: 75, g: 12, a: 21, pts: 33, pm: -9 }),
  row(1980, { gp: 72, g: 23, a: 40, pts: 63 }),
  row(1981, { gp: 80, g: 50, a: 109, pts: 159 }),
  row(1981, { gp: 5, g: 1, a: 2, pts: 3 }, { phase: "playoffs" }),
  row(1982, { gp: 40, g: 10, a: 10, pts: 20 }, { f: 2, team: "Rangers", ts: 19821 }),
  row(1982, { gp: 30, g: 8, a: 12, pts: 20 }, { f: 3, team: "Kings", ts: 19822 }),
];

test("rows in range: by years, phase and clubs", () => {
  assert.equal(inRange(career, { from: 1980, to: 1981 }, "regular").length, 2);
  assert.equal(inRange(career, { from: 1980, to: 1981 }, null).length, 3);
  assert.equal(inRange(career, { from: 1900, to: 2100 }, "playoffs").length, 1);
  assert.equal(inRange(career, { from: 1979, to: 1982 }, "regular", new Set(["nhl:2"])).length, 1);
  assert.equal(inRange(career, { from: 1979, to: 1982 }, "regular", new Set()).length, 5);
  assert.equal(clubKey(career[4]), "nhl:2");
});

test("totals add the clubs of a season; a key no row holds stays absent", () => {
  const t = sumStats(inRange(career, { from: 1979, to: 1982 }, "regular"));
  assert.equal(t.gp, 75 + 72 + 80 + 40 + 30);
  assert.equal(t.g, 12 + 23 + 50 + 10 + 8);
  assert.equal(t.pm, -9);
  assert.equal("sog" in t, false);
  const seasons = bySeason(inRange(career, { from: 1979, to: 1982 }, "regular"));
  assert.deepEqual(seasons.map((s) => s.year), [1979, 1980, 1981, 1982]);
  assert.equal(seasons[3].stats.pts, 40);
  assert.equal(seasons[3].parts.length, 2);
  assert.equal(seasons[3].parts[0].team, "Rangers");
});

test("per-game rates come from the totals, not from averaging seasons", () => {
  const sk = GROUPS.skater;
  const t = sumStats(inRange(career, { from: 1979, to: 1980 }, "regular"));
  assert.equal(perOf(metricOf(sk, "g"), t), 35 / 147);
  assert.equal(perOf(metricOf(sk, "g"), {}), null);
  assert.equal(perOf(metricOf(sk, "g"), { g: 5, gp: 0 }), null);
});

test("goalie and hitter rates are worked out from counting numbers and are null without them", () => {
  const go = GROUPS.goalie, ba = GROUPS.batting, pi = GROUPS.pitching;
  assert.equal(metricOf(go, "svp").get({ sv: 900, sa: 1000 }), 0.9);
  assert.ok(Math.abs((metricOf(go, "gaa").get({ ga: 4, toi: 7200 }) ?? 0) - 2) < 1e-9);
  assert.equal(metricOf(go, "gaa").get({ ga: 60 }), null);
  assert.equal(metricOf(ba, "avg").get({ h: 150, ab: 500 }), 0.3);
  assert.equal(metricOf(ba, "avg").get({ h: 150 }), null);
  assert.ok(Math.abs((metricOf(pi, "era").get({ er: 40, ipouts: 360 }) ?? 0) - 3) < 1e-9);
  assert.ok(Math.abs((perOf(metricOf(pi, "so"), { so: 120, ipouts: 540 }) ?? 0) - 6) < 1e-9);
  assert.equal(inningsText(361), "120.1");
  assert.equal(go.games({ gp: 40 }), 40);
  assert.equal(ba.games({ g: 150 }), 150);
});

test("a season's rank among the league's best totals", () => {
  const top = [92, 85, 70, 65, 60, 60, 55, 50, 48, 47, 40, 39, 38, 37, 36, 35, 34, 33, 32, 31];
  assert.equal(rankIn(top, 100), 1);
  assert.equal(rankIn(top, 92), 1);
  assert.equal(rankIn(top, 85), 2);
  assert.equal(rankIn(top, 60), 5); // ties share the better place
  assert.equal(rankIn(top, 31), 20);
  assert.equal(rankIn(top, 20), null); // below the best twenty held: not known
  assert.equal(rankIn(top, 0), null);
  assert.equal(rankIn(top, null), null);
  assert.equal(rankIn(undefined, 50), null);
  assert.equal(rankIn([10, 8, 5], 3), 4); // a short list is every player: the rank is known
});

const Q = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

test("a value's place in a distribution given as eleven points", () => {
  assert.ok(Math.abs(cdfAt(Q, 0.5) - 0.5) < 1e-9);
  assert.ok(Math.abs(cdfAt(Q, 0.25) - 0.25) < 1e-9);
  assert.equal(cdfAt(Q, -1), 0);
  assert.equal(cdfAt(Q, 2), 1);
  assert.ok(Math.abs(cdfAt([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], 0.5) - 0.55) < 1e-9);
  assert.ok(Number.isNaN(cdfAt([1], 1)));
});

test("percentiles pool the seasons by their players and turn a lower-is-better figure round", () => {
  assert.ok(Math.abs(pooledPercentile([{ n: 100, q: Q }], 0.9)! - 0.9) < 1e-9);
  assert.ok(Math.abs(pooledPercentile([{ n: 100, q: Q }], 0.9, true)! - 0.1) < 1e-9);
  // two seasons, one three times the size: the pooled share is weighted
  const wide = Q.map((x) => x * 2);
  const p = pooledPercentile([{ n: 300, q: Q }, { n: 100, q: wide }], 1)!;
  assert.ok(Math.abs(p - (300 * 1 + 100 * 0.5) / 400) < 1e-9);
  assert.equal(pooledPercentile([], 1), null);
  assert.equal(pooledPercentile([{ n: 10, q: Q }], null), null);
  assert.equal(topPercent(0.97), 3);
  assert.equal(topPercent(1), 1);
  assert.equal(topPercent(0), 100);
});

const ref = (g: string, y: number, m: string, extra: Partial<RefRow>): RefRow => ({ g, p: "regular", m, y, n: 200, ...extra });

test("the radar uses the seasons the player played, and leaves out an axis with no figures", () => {
  const refs = indexRefs([
    ref("skater", 1980, "g_pg", { q: Q.map((x) => x * 0.8), a: 0.2 }),
    ref("skater", 1981, "g_pg", { q: Q.map((x) => x * 0.8), a: 0.21 }),
    ref("skater", 1999, "g_pg", { q: Q.map((x) => x * 8) }), // a season the player did not play: ignored
  ]);
  const pts = radarOf(GROUPS.skater, inRange(career, { from: 1980, to: 1981 }, "regular"), refs, "regular");
  const g = pts.find((x) => x.ref === "g_pg")!;
  assert.ok(Math.abs(g.value! - 73 / 152) < 1e-9);
  assert.ok(Math.abs(g.pct! - cdfAt(Q.map((x) => x * 0.8), 73 / 152)) < 1e-9);
  assert.equal(pts.find((x) => x.ref === "a_pg")!.pct, null);
  assert.equal(pts.find((x) => x.ref === "sog_pg")!.value, null);
  assert.equal(leagueAvg(refs, "skater", "regular", "g_pg", 1981), 0.21);
  assert.equal(leagueAvg(refs, "skater", "regular", "g_pg", 1990), null);
  assert.equal(leagueAvg(refs, "skater", "regular", undefined, 1981), null);
  assert.ok(refs.has(refKey("skater", "regular", "g_pg", 1980)));
});

test("league finishes count the seasons led and the seasons in the top ten", () => {
  const refs = indexRefs([
    ref("skater", 1979, "pts", { t: [140, 120, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10] }),
    ref("skater", 1980, "pts", { t: [100, 90, 80, 70, 65, 62, 61, 60, 59, 58, 57, 56] }),
    ref("skater", 1981, "pts", { t: [159, 120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 20] }),
  ]);
  const seasons = bySeason(inRange(career, { from: 1979, to: 1981 }, "regular"));
  const f = leagueFinishes(seasons, metricOf(GROUPS.skater, "pts"), refs, "skater", "regular");
  assert.deepEqual(f, { led: 1, top10: 3, known: 3 }); // 33 is 7th of the 12 held in 1979, 63 is 6th in 1980, 159 is first in 1981
});

test("the career line and its milestones", () => {
  const pts = cumulative(bySeason(inRange(career, { from: 1900, to: 2100 }, "regular")), (s) => s.pts ?? null);
  assert.deepEqual(pts.map((p) => p.value), [33, 96, 255, 295]);
  assert.deepEqual(pts.map((p) => p.added), [33, 63, 159, 40]);
  assert.deepEqual(milestonesOf(pts, [100, 250, 1000]).map((m) => [m.mark, m.year]), [[100, 1981], [250, 1981]]);
  assert.deepEqual(milestonesOf(pts, [96]).map((m) => m.year), [1980]); // reached exactly
  assert.deepEqual(milestonesOf([], [100]), []);
  // a season with no figure is skipped, not counted as zero
  assert.equal(cumulative(bySeason(career), (s) => s.pm ?? null).length, 1);
});

test("the best run of seasons", () => {
  const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v, i) => ({ year: 2000 + i, v: v === 6 ? 50 : v }));
  assert.deepEqual(peakRun(vals, 5), { from: 2005, to: 2009 }); // 50 sits at 2005 and the seasons after it add more than those before
  assert.deepEqual(peakRun(vals.slice(0, 3), 5), { from: 2000, to: 2002 });
  assert.equal(peakRun([], 5), null);
  assert.equal(peakSeason(vals), 2005);
  assert.equal(peakSeason([{ year: 1, v: 0 }]), null);
});

test("shares keep the slices that count", () => {
  const s = shares([{ key: "a", value: 30 }, { key: "b", value: 0 }, { key: "c", value: 10 }]);
  assert.deepEqual(s.map((x) => x.key), ["a", "c"]);
  assert.equal(s[0].share, 0.75);
  assert.deepEqual(shares([{ key: "a", value: 0 }]), []);
});

test("award badges", () => {
  assert.equal(awardBadge("Hart Memorial Trophy"), "H");
  assert.equal(awardBadge("Art Ross Trophy"), "AR");
  assert.equal(awardBadge("NBA Most Valuable Player Award"), "MVP");
  assert.equal(awardBadge("Cy Young Award"), "CY");
  assert.equal(awardBadge("Rawlings Gold Glove Award"), "GG");
  assert.equal(awardBadge("Calder Memorial Trophy"), "ROY");
});

test("position bucket and range clamping", () => {
  assert.equal(bucketOf("skater", "C"), "F");
  assert.equal(bucketOf("skater", "LW"), "F");
  assert.equal(bucketOf("skater", "D"), "D");
  assert.equal(bucketOf("skater", null), "all");
  assert.equal(bucketOf("batting", "C"), "all"); // a catcher is no forward
  assert.deepEqual(clampSpan({ from: 1500, to: 3000 }, 1979, 2004), { from: 1979, to: 2004 });
  assert.deepEqual(clampSpan({ from: 1990, to: 1985 }, 1979, 2004), { from: 1985, to: 1990 });
  assert.deepEqual(clampSpan(null, 1979, 2004), { from: 1979, to: 2004 });
  assert.deepEqual(clampSpan({ from: 1990 }, 1979, 2004), { from: 1990, to: 2004 });
});

test("the hero card gives a percentile only when the player played enough and the league figures exist", () => {
  const refs = indexRefs([ref("skater", 1980, "g_pg", { q: Q.map((x) => x * 0.8) }), ref("skater", 1981, "g_pg", { q: Q.map((x) => x * 0.8) })]);
  const sk = GROUPS.skater, goals = metricOf(sk, "g");
  const two = inRange(career, { from: 1980, to: 1981 }, "regular");
  const f = heroFigure(sk, goals, two, refs, "regular");
  assert.equal(f.value, 73);
  assert.ok(Math.abs(f.per! - 73 / 152) < 1e-9);
  assert.ok(f.pct! > 0.5 && f.pct! < 1);
  assert.equal(heroFigure(sk, goals, two, indexRefs([]), "regular").pct, null); // no league figures: no claim
  assert.equal(heroFigure(sk, goals, [row(1980, { gp: 5, g: 5 })], refs, "regular").pct, null); // five games compare with nobody
  assert.equal(enoughPlayed("skater", "regular", { gp: 19 }), false);
  assert.equal(enoughPlayed("skater", "playoffs", { gp: 5 }), true);
  assert.equal(enoughPlayed("batting", "regular", { ab: 100 }), true);
  assert.equal(enoughPlayed("pitching", "regular", {}), false);
  assert.equal(enoughPlayed("nba", "regular", { gp: 80 }), false);
});

test("the board's state in the address: range, phase, clubs, and the old season link", () => {
  assert.equal(parsePlayerState("?from=1985&to=1990&phase=p&teams=nhl:1,nhl:2", 1979, 2004, ["nhl:1", "nhl:2", "nhl:3"]).phase, "playoffs");
  const s = parsePlayerState("?from=1985&to=1990&phase=p&teams=nhl:1,nhl:9", 1979, 2004, ["nhl:1", "nhl:2"]);
  assert.deepEqual(s.span, { from: 1985, to: 1990 });
  assert.deepEqual([...s.clubs], ["nhl:1"]);
  assert.deepEqual(parsePlayerState("", 1979, 2004, []).span, { from: 1979, to: 2004 });
  assert.deepEqual(parsePlayerState("?season=1988", 1979, 2004, []).span, { from: 1988, to: 1988 }); // the old ?season= link
  assert.deepEqual(parsePlayerState("?from=abc&to=1990", 1979, 2004, []).span, { from: 1979, to: 1990 });
  assert.equal(playerStateText({ span: { from: 1985, to: 1990 }, phase: "playoffs", clubs: new Set(["nhl:1"]) }, 1979, 2004), "?from=1985&to=1990&phase=p&teams=nhl%3A1");
  assert.equal(playerStateText({ span: { from: 1979, to: 2004 }, phase: "regular", clubs: new Set() }, 1979, 2004), "");
  assert.equal(playerRangeKey("/nhl/player/mark-messier-2359"), "spxn-range-p:/nhl/player/mark-messier-2359");
  assert.equal(rawPlayerSpan("?from=1985&to=1990"), "1985-1990");
  assert.equal(rawPlayerSpan("?from=1985"), "1985-");
  assert.equal(rawPlayerSpan(""), "");
});

test("league figures travel as short lists and come back whole", () => {
  const a = ref("skater", 1980, "g_pg", { a: 0.2041, q: [0, 0.01234, 0.5, 1, 2, 3, 4, 5, 6, 7, 8] });
  const back = unpackRef(packRef(a));
  assert.deepEqual(back, { ...a, a: 0.204, q: [0, 0.012, 0.5, 1, 2, 3, 4, 5, 6, 7, 8] });
  const t = ref("skater", 1980, "pts", { t: [100, 90] });
  assert.deepEqual(unpackRef(packRef({ ...t, p: "playoffs" })), { ...t, p: "playoffs" });
  assert.equal("q" in unpackRef(packRef(t)), false);
});

// ---- basketball and football ---------------------------------------------------------------------------------------------------------

test("basketball: per-game figures come from the totals, and a season's clubs add up", () => {
  const bb = GROUPS.basketball;
  const rows: StatRow[] = [
    { league: "nba", year: 1990, ts: 1, f: 1, team: "Bulls", phase: "regular", group: "basketball", stats: { gp: 82, gs: 82, min: 3197, pts: 2753, reb: 492, ast: 453, stl: 227, blk: 54 } },
    { league: "nba", year: 1991, ts: 2, f: 1, team: "Bulls", phase: "regular", group: "basketball", stats: { gp: 82, pts: 2580, reb: 511, ast: 489, stl: 223, blk: 51 } },
  ];
  const t = sumStats(rows);
  assert.equal(perOf(metricOf(bb, "pts"), t), (2753 + 2580) / 164);
  assert.equal(metricOf(bb, "reb").ref, "reb_pg");
  assert.equal(STAT_GROUPS.basketball.cols.find((c) => c.key === "mpg")!.get(rows[0].stats), 3197 / 82);
  assert.equal(STAT_GROUPS.basketball.cols.find((c) => c.key === "mpg")!.get(rows[1].stats), null); // no minutes in that season: no figure, not zero
  assert.equal(enoughPlayed("basketball", "regular", { gp: 19 }), false);
  assert.equal(enoughPlayed("basketball", "regular", { gp: 20 }), true);
});

test("football: passer rating, yards per carry and combined tackles are worked out from counting numbers", () => {
  const pass = STAT_GROUPS.passing.cols, rush = STAT_GROUPS.rushing.cols, def = STAT_GROUPS.defense.cols, kick = STAT_GROUPS.kicking.cols;
  // Tom Brady, 2007: 398 of 578 for 4806 yards, 50 touchdowns, 8 interceptions: a rating of 117.2
  const brady = { gp: 16, cmp: 398, att: 578, yds: 4806, td: 50, int: 8 };
  assert.ok(Math.abs(pass.find((c) => c.key === "rtg")!.get(brady)! - 117.2) < 0.05);
  assert.equal(pass.find((c) => c.key === "cmppct")!.get(brady), 398 / 578);
  assert.equal(pass.find((c) => c.key === "rtg")!.get({ gp: 3 }), null);
  assert.equal(rush.find((c) => c.key === "ypc")!.get({ att: 20, yds: 90 }), 4.5);
  assert.equal(rush.find((c) => c.key === "ypc")!.get({ att: 0, yds: 0 }), null);
  assert.equal(def.find((c) => c.key === "cmb")!.get({ tkl: 60, ast: 25 }), 85);
  assert.equal(def.find((c) => c.key === "cmb")!.get({ sck: 2 }), null); // tackles not recorded: no figure
  assert.equal(kick.find((c) => c.key === "fg50")!.get({ fg50: 4, fg60: 1 }), 5);
  assert.equal(showStat("pct", 0.6836, String), "68.4");
  assert.equal(showStat("rate1", 8.315, String), "8.3");
  // a defender's page lists defense first, a quarterback's passing
  const stats = (group: string): StatRow => ({ league: "nfl", year: 2007, ts: 1, f: 1, team: "Patriots", phase: "regular", group, stats: { gp: 16, att: 5 } });
  const all = [stats("rushing"), stats("passing"), stats("defense")];
  const span = { from: 1999, to: 2025 };
  assert.deepEqual(groupViews(all, span, "regular", new Set(), "QB").map((g) => g.def.id), ["passing", "rushing", "defense"]);
  assert.deepEqual(groupViews(all, span, "regular", new Set(), "LB").map((g) => g.def.id), ["defense", "passing", "rushing"]);
  assert.equal(enoughPlayed("passing", "regular", { att: 99 }), false);
  assert.equal(enoughPlayed("kicking", "playoffs", { fga: 3 }), true);
});

test("the board as the page sends it reads back exactly, and a long career is small", () => {
  const stats: StatRow[] = Array.from({ length: 22 }, (_, i) => i).flatMap((i) => [
    row(2001 + i, { gp: 150 + i, g: 30 + i, a: 40, pts: 70 + i, ...(i % 3 ? { pm: -i } : {}) }, { ts: 100 + i, team: i < 11 ? "Anaheim Mighty Ducks" : "Oilers" }),
    row(2001 + i, { gp: 5, g: 1, a: 0, pts: 1 }, { phase: "playoffs", ts: 100 + i, team: i < 11 ? "Anaheim Mighty Ducks" : "Oilers", group: "goalie" }),
  ]);
  const seasons = Array.from({ length: 22 }, (_, i): SeasonInfo => ({ league: "nhl", year: 2001 + i, label: `${2001 + i}-${String(2002 + i).slice(2)}`, f: i < 11 ? 1 : 2, team: i === 3 ? null : i < 11 ? "Anaheim Mighty Ducks" : "Oilers", reg: true, po: i % 2 === 0, teamPo: i % 4 === 0, champ: i === 5 }));
  const clubs: BoardData["clubs"] = {};
  for (const s of seasons) clubs[clubInfoKey(s.league, s.f, s.year)] = { team: s.team, logo: s.f === 1 ? "https://example.invalid/a.png" : s.year > 2015 ? null : "https://example.invalid/b.png", tone: s.f === 1 ? "light-dark(#111111, #eeeeee)" : "light-dark(#222222, #dddddd)" };
  const board: BoardData = { name: "A Player", min: 2001, max: 2022, bucket: "F", position: "C", stats, seasons, clubs, titles: [{ league: "nhl", year: 2006, team: "Oilers" }],
    awards: [{ league: "nhl", year: 2010, award: "Trophy", team: null }], held: ["nhl|2001", "nhl|2002"] };
  const wire = packBoard(board);
  assert.deepEqual(readBoard(JSON.parse(JSON.stringify(wire))), board);
  assert.equal("refs" in wire, false, "the league's figures are fetched, not carried");
  assert.equal(wire.logos.length, 2, "each logo address is written once");
  assert.ok(JSON.stringify(wire).length < 0.5 * JSON.stringify(board).length, "the wire form is under half the plain one");
});

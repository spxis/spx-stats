import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { RETROSHEET_ZONES } from "@johnmorrisdotca/kyogijo-stadiums/frames";
import { fenceAt as kyFenceAt } from "@johnmorrisdotca/kyogijo-stadiums/geometry";
import { fenceFor } from "@johnmorrisdotca/kyogijo-stadiums/parks";
import { RESULTS, sideOf, TRAJS, unpackCells, unpackTraj, ZONE_CODES, ZONE_XY } from "../src/lib/battedBall.ts";
import { BALL_KINDS, drawBalls } from "../src/lib/fieldPlays.ts";
import { ballTypes, decodeRows, FIELD_BOX, fenceAt, hasBalls, homeRunBubbles, homeRunLanes, homeRunSpot, KINDS, sprayLayers, summarize, type SprayWire } from "../src/lib/playerSpray.ts";

/** Run in web/: pnpm test:spray */

// A real row of core.batted_ball_player_hand (Francisco Lindor, 2024, batting right-handed against left-handed pitchers), as db/build/237 packs it, and what
// core.hit_cells_json and core.hit_traj_json unpack it to (db/migrations/072).
const CELLS = "0201010301020501010a01020c430101010d01010e010311010112010413030101150102160503011823070301190301011a010f1b0302011e01012001012101022301022d0602022e06010330030101311502010433030201340106351502010536030201370302013803020139150501013a01033b0301013c0301013d150202013e0302013f030101410101420201";
const CELLS_JSON: Record<string, Record<string, number>> = {"1": {"out": 2}, "4": {"out": 2, "single": 1}, "5": {"out": 3, "double": 1}, "6": {"out": 15}, "7": {"out": 1, "single": 1}, "8": {"out": 2, "single": 1}, "9": {"out": 1, "single": 1}, "1S": {"out": 1}, "23": {"out": 1}, "34": {"out": 1, "single": 1}, "3F": {"out": 2}, "4D": {"out": 2}, "4M": {"out": 1, "single": 1}, "56": {"out": 7, "error": 1, "single": 3}, "5S": {"out": 2}, "6M": {"out": 4}, "6S": {"out": 3}, "78": {"out": 2, "single": 1}, "7D": {"out": 2, "double": 1, "home_run": 4}, "7L": {"double": 2, "single": 2}, "89": {"out": 1, "single": 1}, "8D": {"out": 2, "single": 1}, "8S": {"out": 2, "single": 1}, "9L": {"single": 1}, "9S": {"out": 2, "single": 1}, "34D": {"out": 2}, "34S": {"out": 1}, "4MS": {"out": 1}, "56D": {"out": 1}, "56S": {"out": 1, "single": 1, "fielders_choice": 1}, "5DF": {"out": 1}, "78D": {"out": 6}, "7LD": {"double": 3, "single": 1}, "89D": {"out": 1, "single": 1}, "89S": {"out": 3}, "8XD": {"out": 5, "double": 1, "home_run": 1}, "9LS": {"out": 1}, "78XD": {"out": 2, "double": 1, "home_run": 5}, "89XD": {"out": 2, "double": 2, "home_run": 1}};
const TRAJ = "3123240c000000";
const TRAJ_JSON: Record<string, number> = {"F": 36, "G": 49, "L": 35, "P": 12};

test("the zone list is the one of the migration, in its order", () => {
  const sql = readFileSync(new URL("../../db/migrations/072_batted_ball.sql", import.meta.url), "utf8");
  const listed = (sql.match(/unnest\(string_to_array\(([\s\S]*?), ' '\)\) with ordinality/)?.[1] ?? "").replace(/'\s*\n\s*'/g, " ").replace(/'/g, "").trim().split(/\s+/);
  assert.equal(listed.length, 68);
  assert.deepEqual([...ZONE_CODES], listed);
});

test("the zone centres are kyogijo's", () => {
  assert.deepEqual(Object.keys(ZONE_XY).sort(), [...ZONE_CODES].sort());
  for (const z of ZONE_CODES) assert.deepEqual([...ZONE_XY[z]!], [...(RETROSHEET_ZONES[z] as readonly [number, number])], z);
});

test("packed cells unpack as the database's own function unpacks them", () => {
  const got = unpackCells(CELLS);
  const want = new Map(Object.entries(CELLS_JSON));
  assert.equal(got.size, want.size);
  for (const [zone, byResult] of want) {
    const c = got.get(zone)!;
    assert.ok(c, zone);
    RESULTS.forEach((r, i) => assert.equal(c[i], byResult[r] ?? 0, `${zone} ${r}`));
  }
  assert.equal(unpackCells("\\x" + CELLS).size, want.size, "a PostgREST hex text starts with \\x");
  assert.deepEqual(unpackTraj(TRAJ), TRAJS.map((t) => TRAJ_JSON[t] ?? 0));
  assert.equal(unpackCells("").size, 0);
});

test("the standard field's box and fence are the drawing's", () => {
  const svg = drawBalls([], { park: null, year: 2025, away: { name: "", color: "" }, home: { name: "", color: "" }, title: "t" }).svg;
  const box = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg)!;
  assert.deepEqual([FIELD_BOX.x, FIELD_BOX.y, FIELD_BOX.w, FIELD_BOX.h], [Number(box[1]), Number(box[2]), Number(box[3]), Number(box[4])]);
  const fence = fenceFor(undefined, undefined, 2025);
  for (let a = -50; a <= 50; a += 2.5) assert.ok(Math.abs(fenceAt(a) - kyFenceAt(fence, a)) < 0.6, `fence at ${a} degrees`);
});

test("the marks are the game page's, colour and result", () => {
  for (const k of KINDS) {
    const g = BALL_KINDS.find((b) => b.outcome === k.kind)!;
    assert.equal(k.color, g.color, k.kind);
    assert.equal(k.phrase, g.phrase, k.kind);
    assert.deepEqual(k.results.map((i) => RESULTS[i]).sort(), g.codes.flatMap((c) => ({ o: ["out"], s: ["single"], d: ["double"], t: ["triple"], h: ["home_run"], e: ["error"], f: ["fielders_choice"] })[c]!).sort(), k.kind);
  }
});

test("a ball is pulled, up the middle or the other way by the side the batter hit from", () => {
  assert.equal(sideOf("7LD", "R"), "pull");
  assert.equal(sideOf("7LD", "L"), "oppo");
  assert.equal(sideOf("9LD", "L"), "pull");
  assert.equal(sideOf("9LD", "R"), "oppo");
  assert.equal(sideOf("8D", "R"), "centre");
  assert.equal(sideOf("8D", "L"), "centre");
  assert.equal(sideOf("2F", "R"), "centre", "behind the plate is the middle");
  assert.equal(sideOf("5", "R"), "pull", "the third baseman's ground is the right-hander's pull side");
  assert.equal(sideOf("3", "R"), "oppo");
  assert.equal(sideOf("6M", "R"), "centre", "up the middle is within fifteen degrees of the line to centre field");
  assert.equal(sideOf("78", "R"), "pull", "left-centre is sixteen degrees off it");
  assert.equal(sideOf("7D", "R"), "pull");
  assert.equal(sideOf("23F", "L"), "pull");
  for (const z of ZONE_CODES) {
    const r = sideOf(z, "R"), l = sideOf(z, "L");
    assert.ok(r === "centre" ? l === "centre" : l !== r && l !== "centre", `${z}: the two sides differ off the middle`);
  }
});

const wire = (rows: SprayWire["rows"]): SprayWire => ({ rows });
const ROWS = decodeRows(wire([[2023, 0, 1, 10, "01000000000000", "0000"], [2024, 0, 0, Number(132), TRAJ, CELLS], [2024, 0, 1, 5, TRAJ, CELLS], [2024, 1, 1, 1, TRAJ, CELLS]]));

test("the seasons chosen decide the rows, and each role is kept apart", () => {
  assert.equal(hasBalls(ROWS, "bat", 2024, 2024), true);
  assert.equal(hasBalls(ROWS, "pit", 2024, 2024), true);
  assert.equal(hasBalls(ROWS, "pit", 2020, 2023), false);
  const one = summarize(ROWS, "bat", 2024, 2024), two = summarize(ROWS, "bat", 2023, 2024);
  assert.deepEqual(one.years, [2024]);
  assert.deepEqual(two.years, [2023, 2024]);
  assert.equal(one.n, Number(132) + 5);
  const balls = Object.values(CELLS_JSON).reduce((s, z) => s + Object.values(z).reduce((a, b) => a + b, 0), 0);
  assert.equal(one.results.reduce((a, b) => a + b, 0), 2 * balls, "both sides of the same cells add up");
  assert.equal(one.sides.pull + one.sides.centre + one.sides.oppo, 2 * balls);
  assert.equal(summarize(ROWS, "bat", 2030, 2031).n, 0);
});

test("the sides add up for a batter who hit from both sides: each ball is told by the side of its own row", () => {
  const right = summarize(decodeRows(wire([[2024, 0, 1, 1, TRAJ, CELLS]])), "bat", 2024, 2024), left = summarize(decodeRows(wire([[2024, 0, 0, 1, TRAJ, CELLS]])), "bat", 2024, 2024);
  assert.equal(right.sides.pull, left.sides.oppo);
  assert.equal(right.sides.oppo, left.sides.pull);
  assert.equal(right.sides.centre, left.sides.centre);
  const together = summarize(decodeRows(wire([[2024, 0, 1, 1, TRAJ, CELLS], [2024, 0, 0, 1, TRAJ, CELLS]])), "bat", 2024, 2024);
  assert.equal(together.sides.pull, right.sides.pull + left.sides.pull);
});

test("ball types add up, with the three bunts together", () => {
  const t = ballTypes([5, 4, 3, 2, 1, 1, 1]);
  assert.deepEqual(t.map((x) => `${x.key}${x.n}`), ["G5", "L4", "F3", "P2", "B3"]);
});

test("a spray chart has one mark for each ball, the same every time, and hits only unless outs are asked for", () => {
  const sum = summarize(ROWS, "bat", 2024, 2024);
  const hits = sprayLayers(sum.zones, false), all = sprayLayers(sum.zones, true);
  assert.deepEqual(hits, sprayLayers(sum.zones, false));
  const count = (ls: typeof hits) => Object.fromEntries(ls.map((l) => [l.kind, l.n]));
  assert.deepEqual(hits.map((l) => l.kind), ["single", "double", "home run"].filter((k) => count(hits)[k]), "no out, error or fielder's choice in the hits chart");
  const hitBalls = sum.results[1]! + sum.results[2]! + sum.results[3]! + sum.results[4]!;
  assert.equal(hits.reduce((s, l) => s + l.n, 0), hitBalls);
  assert.equal(all.reduce((s, l) => s + l.n, 0), sum.n === 0 ? 0 : sum.results.reduce((a, b) => a + b, 0));
  assert.equal(all.find((l) => l.kind === "out")!.n, sum.results[0]);
  assert.equal(all.find((l) => l.kind === "reached")!.n, sum.results[5]! + sum.results[6]!);
  assert.deepEqual(all.map((l) => l.kind), ["out", "reached", "single", "double", "home run"], "bottom to top: a home run lies over an out");
  for (const l of all) assert.equal((l.d.match(/z/g) ?? []).length, l.n, `a closed path for each ${l.kind}`);
});

test("a busy zone does not spread wider than its share of the field, and every mark stays in the drawing", () => {
  const zones = new Map([["8D", [0, 4000, 0, 0, 0, 0, 0]], ["6", [3000, 0, 0, 0, 0, 0, 0]]]);
  const [layer] = sprayLayers(zones, true).filter((l) => l.kind === "single");
  const xs = [...layer!.d.matchAll(/M(-?[\d.]+) (-?[\d.]+)a/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
  assert.equal(xs.length, 4000);
  assert.ok(xs.every(([x, y]) => Math.hypot(x - 0, y + 330) < 40), "within the reach of the zone");
  assert.equal(new Set(xs.map((p) => p.join(","))).size, 4000, "no two on one another");
  for (const l of sprayLayers(new Map([...ZONE_CODES].map((z) => [z, [3, 3, 3, 3, 3, 3, 3]])), true)) {
    for (const m of l.d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)) {
      const x = Number(m[1]), y = Number(m[2]);
      assert.ok(x > FIELD_BOX.x && x < FIELD_BOX.x + FIELD_BOX.w && y > FIELD_BOX.y && y < FIELD_BOX.y + FIELD_BOX.h, `${l.kind} at ${x},${y} is in the drawing`);
    }
  }
});

test("a home run is set past the fence along its zone's direction, and never short of the zone", () => {
  for (const z of ["7LD", "78D", "8XD", "8D", "9D", "89XD"]) {
    const p = homeRunSpot(z), [x, y] = ZONE_XY[z]!;
    assert.ok(Math.hypot(p.x, p.y) >= Math.hypot(x, y) - 0.01, z);
    assert.ok(Math.hypot(p.x, p.y) >= fenceAt((Math.atan2(x, y) * 180) / Math.PI) + 8.9, `${z} is past the fence`);
    assert.ok(Math.abs(p.x * y - p.y * x) < 0.01, `${z} is on its own line from home plate`);
  }
});

test("home run discs do not overlap, a deeper zone lies further out, and the lanes add up", () => {
  const zones = new Map<string, number[]>([["78D", [0, 0, 0, 0, 20, 0, 0]], ["78XD", [0, 0, 0, 0, 9, 0, 0]], ["7LD", [0, 0, 0, 0, 30, 0, 0]], ["7D", [0, 0, 0, 0, 25, 0, 0]], ["8D", [0, 0, 0, 0, 3, 0, 0]], ["8XD", [0, 0, 0, 0, 1, 0, 0]], ["6", [9, 0, 0, 0, 0, 0, 0]]]);
  const b = homeRunBubbles(zones);
  assert.equal(b.length, 6, "a zone with no home run has no disc");
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) assert.ok(Math.hypot(b[i]!.x - b[j]!.x, b[i]!.y - b[j]!.y) >= b[i]!.r + b[j]!.r, `${b[i]!.zone} and ${b[j]!.zone} are apart`);
  const d = (zone: string) => Math.hypot(b.find((x) => x.zone === zone)!.x, b.find((x) => x.zone === zone)!.y);
  assert.ok(d("78XD") > d("78D"));
  assert.ok(b.find((x) => x.zone === "7LD")!.r > b.find((x) => x.zone === "8XD")!.r, "more home runs, a bigger disc");
  const lanes = homeRunLanes(zones);
  assert.equal(lanes.total, 88);
  assert.deepEqual([lanes.left, lanes.leftCentre, lanes.centre, lanes.rightCentre, lanes.right], [55, 29, 4, 0, 0]);
});

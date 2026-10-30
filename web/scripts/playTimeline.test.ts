import assert from "node:assert/strict";
import { test } from "node:test";
import { drawBalls, drawDrives, parseBalls, parseDrives } from "../src/lib/fieldPlays.ts";
import { mlbWire, nflWire } from "../src/lib/fieldPlaysWire.ts";
import { ballAt, ballLift, driveSlots, flightMs, mlbFrame, mlbTimeline, nflFrame, nflTimeline } from "../src/lib/playTimeline.ts";

/** Run in web/: pnpm test:playtimeline. The replay's clock (lib/playTimeline.ts) and its fit to the still drawing (lib/fieldPlayStage.ts moves the marks the file holds). */

const BALLS = "1,0,8D,F,o,501;1,0,78,L,s,502;1,1,7LD,F,h,;2,1,6M,G,e,;3,0,9LD,L,d,;3,0,8,F,t,12;4,1,56,BG,f,;4,1,56,G,o,;4,1,1S,P,o,;5,0,5,G,s,";
// A zero-length drive (a turnover on the spot), a returned turnover, an end of half and a drive that starts where its first play is not.
const DRIVES = "1,0,1,15:00,F,70,4,10,2,259,1,70 62 50 49 43 6 4;2,1,1,10:41,T,70,0,16,5,510,1,70 69 58 53 44;3,0,1,02:11,P,81,72,3,0,103,0,81 81 75 72;4,1,2,12:00,O,60,66,3,0,60,0,60 62 66;5,0,2,05:00,X,50,50,1,0,10,0,50;6,1,2,00:30,H,40,40,1,0,3,0,40;7,0,3,15:00,P,75,60,4,1,100,0,72 70 64 61";
const TEAMS: [{ name: string; color: string }, { name: string; color: string }] = [{ name: "Dodgers", color: "005a9c" }, { name: "Cubs", color: "cc3433" }];

/** The marks (direct children but the title and description) of each layer of a drawing, by the layer's id suffix. */
function layersOf(svg: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const re = /<g id="ky-[a-z0-9]+-([a-z-]+)" class="ky-layer[^>]*>([\s\S]*?)<\/g>/g;
  for (const m of svg.matchAll(re)) {
    const body = m[2]!.replace(/<title[^>]*>[\s\S]*?<\/title>|<desc[^>]*>[\s\S]*?<\/desc>/g, "");
    out[m[1]!] = body.match(/<(circle|path|rect|polygon)\b[^>]*?(\/>|>[\s\S]*?<\/\1>|>)/g) ?? [];
  }
  return out;
}

test("the replay's balls are where the still drawing's marks are, in the same order", () => {
  const balls = parseBalls(BALLS);
  const wire = mlbWire(balls, { park: "rogers-centre", year: 2025, teams: TEAMS, score: [4, 1] });
  assert.equal(wire.balls.length, balls.length);
  const svg = drawBalls(balls, { park: "rogers-centre", year: 2025, away: { name: "Dodgers", color: "005a9c" }, home: { name: "Cubs", color: "cc3433" }, title: "t" }).svg;
  const layers = layersOf(svg);
  assert.equal(layers["balls-away"]!.length, wire.balls.filter((b) => b[1] === 0).length);
  assert.equal(layers["balls-home"]!.length, wire.balls.filter((b) => b[1] === 1).length);
  for (const half of [0, 1] as const) {
    const mine = wire.balls.filter((b) => b[1] === half);
    layers[half ? "balls-home" : "balls-away"]!.forEach((mark, i) => {
      const c = /cx="(-?[\d.]+)" cy="(-?[\d.]+)"/.exec(mark);
      if (c) { assert.equal(Number(c[1]), mine[i]![4]); assert.equal(Number(c[2]), mine[i]![5]); }
    });
  }
});

test("a ball flies from home plate to its mark, and arrives exactly on it", () => {
  const wire = mlbWire(parseBalls(BALLS), { park: null, year: 2025, teams: TEAMS, score: [null, null] });
  for (const b of wire.balls) {
    const s0 = ballAt(b, 0);
    assert.ok(s0.x === 0 && Math.abs(s0.y) === 0, "it leaves home plate");
    const end = ballAt(b, 1);
    assert.ok(Math.abs(end.x - b[4]) < 1e-9 && Math.abs(end.y - b[5]) < 1e-9, "it lands on the mark");
    const mid = ballAt(b, 0.5);
    assert.ok(mid.y <= b[5] / 2 + 1e-9, "the arc only lifts the ball, up the page");
    assert.ok(flightMs(b) >= 350 && flightMs(b) <= 1500);
  }
  const g = wire.balls.find((b) => b[3] === "G")!, f = wire.balls.find((b) => b[3] === "F")!, hr = wire.balls.find((b) => b[2] === "h")!;
  assert.equal(ballLift(g), 0);
  assert.ok(ballLift(f) > 20 && ballLift(hr) > 60, "a fly ball and a home run rise");
  assert.ok(Math.hypot(hr[4], hr[5]) > 300, "a home run comes down just past the fence");
});

test("the baseball clock goes inning by inning, the balls one after another, with a running count", () => {
  const wire = mlbWire(parseBalls(BALLS), { park: null, year: 2025, teams: TEAMS, score: [3, 2] });
  const tl = mlbTimeline(wire.balls);
  assert.deepEqual(tl.blocks.map((b) => `${b.inning}${b.half}`), ["10", "11", "21", "30", "41", "50"]);
  assert.deepEqual(tl.chips.map((c) => c.inning), [1, 2, 3, 4, 5]);
  for (let i = 1; i < wire.balls.length; i++) assert.ok(tl.launch[i]! > tl.land[i - 1]!, "no ball is hit before the last has come down");
  assert.ok(tl.steps.every((s, i) => i === 0 || s > tl.steps[i - 1]!));
  const start = mlbFrame(tl, 0);
  assert.deepEqual([start.landed, start.fly, start.block], [0, null, 0]);
  const mid = mlbFrame(tl, (tl.launch[2]! + tl.land[2]!) / 2);
  assert.equal(mid.landed, 2);
  assert.equal(mid.fly!.i, 2);
  assert.ok(mid.fly!.u > 0.4 && mid.fly!.u < 0.6);
  assert.equal(mid.block, 1);
  const end = mlbFrame(tl, tl.total);
  assert.equal(end.landed, 10);
  assert.ok(end.done && end.fly === null);
  assert.deepEqual(end.tally[0], { hits: 4, hr: 0, outs: 1 }, "the visitors: two singles, a double and a triple, one out");
  assert.deepEqual(end.tally[1], { hits: 1, hr: 1, outs: 2 });
  const snapped = mlbFrame(tl, tl.launch[3]!, true);
  assert.equal(snapped.landed, 4, "with reduced motion a ball is on the field once hit, and none is in the air");
  assert.equal(snapped.fly, null);
  assert.deepEqual(mlbTimeline([]).blocks, []);
});

test("the replay's drives are the still drawing's bars, dots and end marks, and the lines it draws are the ones the data gives", () => {
  const drives = parseDrives(DRIVES);
  const wire = nflWire(drives, { teams: TEAMS, score: [null, null] });
  const opts = { year: 2024, away: { name: "A", color: "005a9c" }, home: { name: "B", color: "cc3433" }, title: "t" };
  for (const orientation of ["wide", "tall"] as const) {
    const svg = drawDrives(drives, { ...opts, orientation }).svg;
    const layers = layersOf(svg);
    const lay = driveSlots(wire.drives);
    assert.equal(layers["casing"]!.length, lay.bars, "a drive that did not move has no bar");
    assert.equal(layers["drives"]!.length, lay.bars);
    assert.equal(layers["returns"]!.length, lay.returns);
    assert.equal(layers["plays"]!.length, lay.dots);
    assert.equal(layers["ends"]!.length, lay.ends);
    wire.drives.forEach((d, j) => {
      const s = lay.slots[j]!;
      if (s.bar >= 0) assert.ok(layers["drives"]![s.bar]!.includes(`d="M${d.x0} ${d.y}L${d.x1} ${d.y}"`), `drive ${j + 1}'s bar is where the wire says`);
      d.xs.forEach((x, i) => assert.ok(layers["plays"]![s.dot0 + i]!.includes(`cx="${x}" cy="${d.y}"`), `drive ${j + 1}'s dot ${i + 1}`));
      if (s.ret >= 0) assert.ok(layers["returns"]![s.ret]!.includes(`d="M${d.x1} ${d.y}L${d.xr} ${d.y}"`));
    });
  }
});

test("the football clock plays the drives in order, play by play, and keeps the score honest", () => {
  const wire = nflWire(parseDrives(DRIVES), { teams: TEAMS, score: [9, 6] });
  const tl = nflTimeline(wire.drives, wire.score);
  for (let j = 1; j < tl.drives.length; j++) assert.ok(tl.drives[j]!.t0 >= tl.drives[j - 1]!.doneAt, "a drive begins after the last is done");
  assert.deepEqual(tl.chips.map((c) => c.qtr), [1, 2, 3]);
  const f0 = nflFrame(tl, wire.drives, 0, wire.score);
  assert.equal(f0.k, 0);
  assert.equal(f0.ballX, wire.drives[0]!.x0);
  assert.deepEqual(f0.score, [0, 0]);
  // part-way through the first drive the bar reaches the ball, between two lines of scrimmage
  const d0 = tl.drives[0]!;
  const half = nflFrame(tl, wire.drives, (d0.arrive[2]! + d0.arrive[3]!) / 2, wire.score);
  assert.equal(half.barX, half.ballX);
  assert.equal(half.dots, 3, "the dots of the plays the ball has reached");
  assert.equal(half.ended, false);
  // the field goal scores when the drive ends, the returned turnover's touchdown when the return is home
  assert.deepEqual(nflFrame(tl, wire.drives, d0.endAt + 1, wire.score).score, [3, 0]);
  const ret = tl.drives[3]!;
  assert.deepEqual(nflFrame(tl, wire.drives, ret.endAt + 10, wire.score).score, [3, 6], "the touchdown is not counted until the ball is home");
  assert.deepEqual(nflFrame(tl, wire.drives, ret.returnAt! + 1, wire.score).score, [9, 6], "the touchdown goes to the side that returned the turnover");
  const mid = nflFrame(tl, wire.drives, ret.endAt + (ret.returnAt! - ret.endAt) / 2, wire.score);
  const back = wire.drives[3]!;
  assert.ok(mid.returnX != null && (mid.returnX - back.x1) * (back.xr! - back.x1) > 0 && Math.abs(mid.returnX - back.x1) < Math.abs(back.xr! - back.x1), "the ball runs back along the dashed line");
  const end = nflFrame(tl, wire.drives, tl.total, wire.score);
  assert.ok(end.done);
  assert.deepEqual(end.score, [9, 6], "the last frame is the final score");
  const snapped = nflFrame(tl, wire.drives, tl.drives[2]!.t0, wire.score, true);
  assert.equal(snapped.k, 2);
  assert.equal(snapped.ended, true);
  assert.equal(snapped.barX, wire.drives[2]!.x1, "with reduced motion the drive begun is drawn whole");
});

test("an extra point is added to a touchdown only when the final score shows every try was good", () => {
  const td = parseDrives("1,0,1,15:00,T,70,0,5,2,100,1,70 50;2,1,1,10:00,T,70,0,5,2,100,1,70 40;3,1,2,10:00,F,50,20,5,2,100,1,50 20");
  const wire = nflWire(td, { teams: TEAMS, score: [7, 10] });
  assert.deepEqual(nflTimeline(wire.drives, [7, 10]).extra, [1, 1]);
  assert.deepEqual(nflTimeline(wire.drives, [6, 9]).extra, [0, 0], "missed tries: touchdowns count six until the last frame");
  assert.deepEqual(nflTimeline(wire.drives, [null, null]).extra, [0, 0]);
  const tl = nflTimeline(wire.drives, [7, 10]);
  assert.deepEqual(nflFrame(tl, wire.drives, tl.drives[1]!.endAt + 1, [7, 10]).score, [7, 7]);
  assert.deepEqual(nflFrame(tl, wire.drives, tl.total, [7, 10]).score, [7, 10]);
});

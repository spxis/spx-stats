import assert from "node:assert/strict";
import { test } from "node:test";
import { ballPoints, drawBalls, drawDrives, driveKindsIn, driveScores, parseBalls, parseDrives, tallyBalls, zoneWhere } from "../src/lib/fieldPlays.ts";

/** Run in web/: pnpm test:fieldplays */

// The rows below are what db/build/235 and 236 write (db/tests/game-field.sh holds the same strings).
const BALLS = "1,0,8D,F,o,501;1,0,78,L,s,502;1,1,7LD,F,h,;2,1,6M,G,e,;3,0,9LD,L,d,;3,0,8,F,t,12;4,1,56,BG,f,;4,1,56,G,o,";
const DRIVES = "1,0,1,15:00,F,70,4,10,2,259,1,70 62 50 49 43 6 4;2,1,1,10:41,T,70,0,16,5,510,1,70 69 58 53 44;3,0,1,02:11,P,81,72,3,0,103,0,81 81 75 72;4,1,2,12:00,O,60,66,3,0,60,0,60 62 66;5,0,2,05:00,?,50,50,1,0,10,,50";

test("the balls of a row are read in order, with the batter's person id or none", () => {
  const b = parseBalls(BALLS);
  assert.equal(b.length, 8);
  assert.deepEqual(b[0], { inning: 1, half: 0, zone: "8D", traj: "F", result: "o", person: 501 });
  assert.equal(b[2]!.person, null);
  assert.equal(b[2]!.half, 1);
});

test("a malformed or unknown piece is left out, never guessed", () => {
  const b = parseBalls("1,0,8D,F,o,;x;1,0,ZZ,F,o,;1,2,8D,F,o,;1,0,8D,Q,o,;1,0,8D,F,z,;0,0,8D,F,o,;2,1,9,L,s,");
  assert.deepEqual(b.map((x) => `${x.inning}${x.half}${x.zone}`), ["108D", "219"]);
  assert.deepEqual(parseBalls(""), []);
});

test("balls sharing a zone are fanned out, never on one another, and the same game always draws the same way", () => {
  const many = parseBalls(Array.from({ length: 12 }, (_, i) => `${i + 1},0,8D,F,o,`).join(";"));
  const a = ballPoints(many, null, 2025), b = ballPoints(many, null, 2025);
  assert.deepEqual(a, b);
  assert.deepEqual(a[0], { x: 0, y: 330 }, "the first ball of a zone is at its centre");
  const spots = new Set(a.map((p) => `${p.x},${p.y}`));
  assert.equal(spots.size, 12);
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) assert.ok(Math.hypot(a[i]!.x - a[j]!.x, a[i]!.y - a[j]!.y) > 3, "marks are apart");
});

test("a home run is drawn beyond the fence of its park in that season, a ball in play is not moved", () => {
  const [hr] = ballPoints(parseBalls("1,0,78,F,h,"), "fenway-park", 2025);
  const d = Math.hypot(hr!.x, hr!.y);
  assert.ok(d > 300, `a home run to left-centre at Fenway is out past the wall (${d.toFixed(0)} ft)`);
  const [out] = ballPoints(parseBalls("1,0,78,F,o,"), "fenway-park", 2025);
  assert.ok(Math.hypot(out!.x, out!.y) < d);
});

test("where a zone is, in two words' keys", () => {
  assert.deepEqual(zoneWhere("8D"), { lane: "fp.laneCentre", depth: "fp.depthOutfield" });
  assert.deepEqual(zoneWhere("7LD"), { lane: "fp.laneLeft", depth: "fp.depthOutfield" });
  assert.equal(zoneWhere("56").depth, "fp.depthInfield");
  assert.equal(zoneWhere("5F").depth, "fp.depthFoul");
  assert.equal(zoneWhere("9LSF").depth, "fp.depthFoul");
});

test("the tally counts each side's balls by outcome", () => {
  const t = tallyBalls(parseBalls(BALLS));
  assert.deepEqual(t[0], { out: 1, single: 1, double: 1, triple: 1 });
  assert.deepEqual(t[1], { "home run": 1, reached: 2, out: 1 });
});

test("a game's balls are one drawing on its park: every ball a mark, titles on request, no stylesheet missing, small", () => {
  const balls = parseBalls(BALLS);
  const d = drawBalls(balls, { park: "rogers-centre", year: 2025, away: { name: "Dodgers", color: "005a9c" }, home: { name: "Blue Jays", color: "d6232a" }, title: "Batted balls", label: (b, i) => `ball ${i + 1} ${b.zone}` });
  assert.ok(d.svg.startsWith("<svg") && d.svg.includes("<style"), "the file carries kyogijo's stylesheet");
  assert.ok(d.svg.includes("Batted balls") && d.svg.includes("ball 1 8D") && d.svg.includes("ball 8 56"));
  assert.ok(!d.svg.includes("NaN") && !d.svg.includes("undefined"));
  assert.ok(d.svg.includes("#005a9c") && d.svg.includes("#d6232a"), "each club's colour rings its batters' balls");
  assert.ok(d.width > 0 && d.height > 0 && d.height < d.width * 1.2, "cropped below the plate");
  assert.ok(d.svg.length < 40_000, `${d.svg.length} bytes`);
  const std = drawBalls(balls, { park: null, year: 1995, away: { name: "A", color: "zzzzzz" }, home: { name: "B", color: "111111" }, title: "t" });
  assert.ok(std.svg.startsWith("<svg"), "a park kyogijo does not know is the standard field; a bad colour is a neutral one");
});

test("the drives of a row are read in order", () => {
  const d = parseDrives(DRIVES);
  assert.equal(d.length, 5);
  assert.deepEqual(d[0], { drive: 1, side: 0, qtr: 1, clock: "15:00", result: "F", start: 70, end: 4, plays: 10, firstDowns: 2, seconds: 259, scored: true, los: [70, 62, 50, 49, 43, 6, 4] });
  assert.equal(d[4]!.scored, null);
  assert.deepEqual(parseDrives("1,0,1,15:00,Z,70,4,10,2,259,1,70;x;1,2,1,15:00,F,70,4,10,2,259,1,70"), []);
});

test("the key names only what happened, and a returned turnover is a turnover and a touchdown", () => {
  const d = parseDrives(DRIVES);
  assert.deepEqual(driveKindsIn(d).map((k) => k.result).sort(), ["F", "O", "P", "T", "X"]);
  assert.deepEqual(driveKindsIn(parseDrives("1,0,1,15:00,P,70,60,3,0,100,0,70 65 60")).map((k) => k.result), ["P"]);
});

test("a side's scoring drives: its touchdowns and field goals, and the touchdowns it returned", () => {
  const d = parseDrives(DRIVES);
  assert.equal(driveScores(d, 0), 2, "the visitors: a field goal, and the touchdown they returned from the home side's turnover (drive 4)");
  assert.equal(driveScores(d, 1), 1, "the home side: one touchdown");
});

test("a game's drives are one drawing on the field, wide or tall, with a dashed path for a returned turnover", () => {
  const drives = parseDrives(DRIVES);
  const opts = { year: 2024, away: { name: "Chiefs", color: "e31837" }, home: { name: "Eagles", color: "004c54" }, title: "Drives" };
  const wide = drawDrives(drives, opts), tall = drawDrives(drives, { ...opts, orientation: "tall" });
  assert.ok(wide.width > wide.height && tall.height > tall.width);
  for (const d of [wide, tall]) {
    assert.ok(d.svg.startsWith("<svg") && d.svg.includes("Drives") && !d.svg.includes("NaN") && !d.svg.includes("undefined"));
    assert.ok(d.svg.includes("#e31837") && d.svg.includes("#004c54"));
    assert.ok(d.svg.includes("stroke-dasharray"), "the returned turnover is a dashed line");
  }
  assert.ok(wide.svg.length < 40_000);
  assert.ok(drawDrives([], opts).svg.startsWith("<svg"), "no drives is an empty field, not an error");
});

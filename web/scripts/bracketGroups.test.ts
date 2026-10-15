import assert from "node:assert/strict";
import { test } from "node:test";
import { confGroup, contextDay, divGroup, fadedBy, localDay, playingOn, type BracketMark } from "../src/lib/bracketGroups.ts";

/** Run in web/: pnpm test:bracketgroups */
const marks: BracketMark[] = [
  { h: "/a", g: [divGroup("al-east"), confGroup("al")], d: ["2026-10-04", "2026-10-05"] },
  { h: "/b", g: [divGroup("al-central"), confGroup("al")], d: ["2026-10-06"] },
  { h: "/c", g: [divGroup("nl-east"), confGroup("nl")], d: ["2026-10-14"] },
  { h: "/final", g: [], d: ["2026-10-14", "2026-10-15"], keep: true },
];

test("a division's preview fades the ties with no club of it, and keeps the final", () => {
  assert.deepEqual([...fadedBy(marks, divGroup("al-east"))].sort(), ["/b", "/c"]);
  assert.deepEqual([...fadedBy(marks, divGroup("nl-east"))].sort(), ["/a", "/b"]);
});

test("a conference's preview fades the final too, as its half is a bracket of its own", () => {
  assert.deepEqual([...fadedBy(marks, confGroup("al"))].sort(), ["/c", "/final"]);
});

test("the button for everything fades nothing, and a group nobody is in fades every tie that can be faded", () => {
  assert.equal(fadedBy(marks, "").size, 0);
  assert.deepEqual([...fadedBy(marks, divGroup("none"))].sort(), ["/a", "/b", "/c"]);
});

test("a tie without group data is faded by a preview (nothing says a club of the group plays in it)", () => {
  assert.deepEqual([...fadedBy([{ h: "/x" }], divGroup("al-east"))], ["/x"]);
});

test("the ties with a game on a day", () => {
  assert.deepEqual([...playingOn(marks, "2026-10-14")].sort(), ["/c", "/final"]);
  assert.deepEqual([...playingOn(marks, "2026-10-06")], ["/b"]);
  assert.equal(playingOn(marks, "2026-10-01").size, 0);
  assert.equal(playingOn([{ h: "/none" }], "2026-10-14").size, 0);
});

test("the page's day is the one the address asks for, else the reader's own", () => {
  const now = new Date(2026, 9, 14, 23, 30); // local time, 14 October
  assert.equal(localDay(now), "2026-10-14");
  assert.equal(contextDay("", now), "2026-10-14");
  assert.equal(contextDay(undefined, now), "2026-10-14");
  assert.equal(contextDay("2026-06-02", now), "2026-06-02");
  assert.equal(contextDay("June 2", now), "2026-10-14");
  assert.equal(localDay(new Date(2026, 0, 5)), "2026-01-05");
});

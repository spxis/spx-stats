import assert from "node:assert/strict";
import { test } from "node:test";
import { localText, mark, plainMarks, splitMarks, utcText, utcTitle } from "../src/lib/localTime.ts";

/** Run in web/: pnpm test:localtime. Times on the admin pages are drawn in UTC by the server and swapped for the reader's zone in the browser. */
const ISO = "2026-10-15T03:03:00+00:00";

test("the server's form is UTC, with the zone named", () => {
  assert.equal(utcText(ISO, "stamp"), "2026-10-15 03:03 UTC");
  assert.equal(utcText(ISO, "clock"), "03:03 UTC");
  assert.equal(utcText("2026-10-15T03:03:59.999Z"), "2026-10-15 03:03 UTC", "seconds are cut, not rounded");
  assert.equal(utcTitle(ISO), "2026-10-15 03:03 UTC", "the tooltip is always the full UTC value");
  assert.equal(utcTitle(null), undefined);
});

test("a value that is not a time draws nothing", () => {
  for (const bad of [null, undefined, "", "not a date", "2026-13-45"]) {
    assert.equal(utcText(bad), null);
    assert.equal(localText(bad, "stamp", "en"), null);
    assert.equal(mark(bad), "?");
  }
});

test("the same moment in the reader's zone and language", () => {
  // 03:03 UTC on 15 October is 23:03 the evening before in New York (EDT), 12:03 in Tokyo (JST), 05:03 in Paris (CEST)
  const ny = localText(ISO, "stamp", "en", "America/New_York") ?? "";
  assert.match(ny, /Oct 14, 2026/);
  assert.match(ny, /11:03/);
  assert.match(ny, /EDT/);
  const tokyo = localText(ISO, "stamp", "ja", "Asia/Tokyo") ?? "";
  assert.match(tokyo, /2026年10月15日/);
  assert.match(tokyo, /12:03/);
  const paris = localText(ISO, "clock", "fr", "Europe/Paris") ?? "";
  assert.match(paris, /5\s?h\s?03|05:03/);
  assert.doesNotMatch(paris, /Oct|2026/, "a clock has no date");
  assert.match(localText(ISO, "clock", "en", "UTC") ?? "", /3:03/);
});

test("the zone's own offset is honoured across a daylight saving change", () => {
  // 2026-11-01 05:30 UTC is 01:30 EDT, one hour later it is 01:30 EST again
  assert.match(localText("2026-11-01T05:30:00Z", "clock", "en", "America/New_York") ?? "", /1:30.*EDT/);
  assert.match(localText("2026-11-01T06:30:00Z", "clock", "en", "America/New_York") ?? "", /1:30.*EST/);
});

test("an unknown time zone falls back to UTC instead of throwing", () => {
  assert.equal(localText(ISO, "stamp", "en", "Not/AZone"), "2026-10-15 03:03 UTC");
});

test("marks carry a time inside a sentence as plain text", () => {
  const text = `Held by Ana at ${mark(ISO)}. It approves itself after ${mark("2026-10-15T03:13:00Z", "clock")} unless you hold it.`;
  assert.equal(plainMarks(text), "Held by Ana at 2026-10-15 03:03 UTC. It approves itself after 03:13 UTC unless you hold it.");
  const pieces = splitMarks(text);
  assert.equal(pieces.length, 5);
  assert.deepEqual(pieces[1], { iso: "2026-10-15T03:03:00.000Z", style: "stamp" });
  assert.deepEqual(pieces[3], { iso: "2026-10-15T03:13:00.000Z", style: "clock" });
  assert.equal(pieces[0], "Held by Ana at ");
  assert.deepEqual(splitMarks("no times here"), ["no times here"]);
  assert.deepEqual(splitMarks(""), []);
  assert.equal(plainMarks("a ? b"), "a ? b");
});

test("a mark never swallows the text around it, and a time is always re-readable", () => {
  const m = mark(ISO, "clock");
  assert.equal(splitMarks(`${m}${m}`).length, 2);
  assert.equal(plainMarks(`(${m})`), "(03:03 UTC)");
  // the phrase catalogue fills placeholders with marks and keeps the words around them in the reader's language
  assert.equal(plainMarks("En date de {time} (il y a 5 minutes)".replace("{time}", m)), "En date de 03:03 UTC (il y a 5 minutes)");
});

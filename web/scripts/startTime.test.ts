import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startLabel, startStyle } from "../src/lib/startTime.ts";

// 19:00 PDT and 22:00 EDT on 15 October 2026 are the same instant: 02:00 UTC on the 16th.
const EVENING = "2026-10-16T02:00:00Z";

describe("startStyle", () => {
  it("uses the clock when the instant is on the game's date", () => {
    assert.equal(startStyle("2026-07-15T22:00:00Z", "2026-07-15", "UTC"), "clock");
    assert.equal(startStyle("2026-07-15T22:00:00Z", "2026-07-15", "America/New_York"), "clock");
  });

  it("shows the date when the reader's zone is on another day", () => {
    assert.equal(startStyle("2026-07-16T02:00:00Z", "2026-07-15", "UTC"), "stamp");
    assert.equal(startStyle("2026-07-16T02:00:00Z", "2026-07-15", "America/New_York"), "clock");
  });

  it("keeps the clock for a 7 p.m. Pacific game on that date", () => {
    assert.equal(startStyle(EVENING, "2026-10-15", "America/Los_Angeles"), "clock");
    assert.equal(startStyle(EVENING, "2026-10-15", "America/Vancouver"), "clock");
    assert.equal(startStyle("2026-10-15T23:00:00Z", "2026-10-15", "America/Los_Angeles"), "clock");
    assert.equal(startStyle(EVENING, "2026-10-15", "UTC"), "stamp");
  });

  it("shows the date for a reader whose zone is already the next day", () => {
    assert.equal(startStyle(EVENING, "2026-10-15", "America/New_York"), "clock");
    assert.equal(startStyle(EVENING, "2026-10-15", "Asia/Tokyo"), "stamp");
    assert.equal(startStyle(EVENING, "2026-10-15", "Europe/Paris"), "stamp");
  });

  it("keeps the clock across the spring daylight-saving change", () => {
    assert.equal(startStyle("2026-03-08T06:00:00Z", "2026-03-08", "America/New_York"), "clock");
    assert.equal(startStyle("2026-03-08T00:00:00Z", "2026-03-07", "America/New_York"), "clock");
    assert.equal(startStyle("2026-03-08T00:00:00Z", "2026-03-07", "UTC"), "stamp");
  });

  it("keeps the clock across the autumn daylight-saving change", () => {
    assert.equal(startStyle("2026-11-01T05:30:00Z", "2026-11-01", "America/New_York"), "clock");
    assert.equal(startStyle("2026-11-01T06:30:00Z", "2026-11-01", "America/New_York"), "clock");
    assert.equal(startStyle("2026-11-02T03:00:00Z", "2026-11-01", "America/Los_Angeles"), "clock");
    assert.equal(startStyle("2026-11-02T03:00:00Z", "2026-11-01", "Asia/Tokyo"), "stamp");
  });

  it("does not invent a time", () => {
    assert.equal(startStyle(null, "2026-07-15"), "clock");
    assert.equal(startStyle("not-a-time", "2026-07-15"), "clock");
  });
});

describe("startLabel", () => {
  it("is only the time for a 7 p.m. Pacific game", () => {
    assert.equal(startLabel(EVENING, "2026-10-15", "en", "America/Los_Angeles"), "7:00 p.m. PDT");
    assert.equal(startLabel("2026-10-15T23:00:00Z", "2026-10-15", "en", "America/Los_Angeles"), "4:00 p.m. PDT");
  });

  it("adds a short date when the reader's day is the next one", () => {
    const tokyo = startLabel(EVENING, "2026-10-15", "en", "Asia/Tokyo") ?? "";
    assert.match(tokyo, /^Fri 16\b/);
    assert.match(tokyo, /11:00 a\.m\./);
    assert.doesNotMatch(tokyo, /2026|Oct/);
    const fr = startLabel(EVENING, "2026-10-15", "fr", "Asia/Tokyo") ?? "";
    assert.match(fr, /ven\.\s+16/);
    assert.doesNotMatch(fr, /2026/);
    const ja = startLabel(EVENING, "2026-10-15", "ja", "Asia/Tokyo") ?? "";
    assert.match(ja, /16日\(金\)/);
    assert.match(ja, /11:00/);
    assert.doesNotMatch(ja, /2026/);
  });

  it("names the zone's own offset on a daylight-saving weekend", () => {
    assert.equal(startLabel("2026-11-01T05:30:00Z", "2026-11-01", "en", "America/New_York"), "1:30 a.m. EDT");
    assert.equal(startLabel("2026-11-01T06:30:00Z", "2026-11-01", "en", "America/New_York"), "1:30 a.m. EST");
    assert.equal(startLabel("2026-11-02T03:00:00Z", "2026-11-01", "en", "America/Los_Angeles"), "7:00 p.m. PST");
    const tokyo = startLabel("2026-11-02T03:00:00Z", "2026-11-01", "en", "Asia/Tokyo") ?? "";
    assert.match(tokyo, /^Mon 2\b/);
    assert.doesNotMatch(tokyo, /2026/);
  });

  it("draws nothing when the value is not a time", () => {
    assert.equal(startLabel(null, "2026-10-15", "en", "America/Los_Angeles"), null);
    assert.equal(startLabel("not-a-time", "2026-10-15", "en", "America/Los_Angeles"), null);
  });
});

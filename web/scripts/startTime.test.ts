import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startStyle } from "../src/lib/startTime.ts";

describe("startStyle", () => {
  it("uses the clock when the instant is on the game's date", () => {
    assert.equal(startStyle("2026-07-15T22:00:00Z", "2026-07-15", "UTC"), "clock");
    assert.equal(startStyle("2026-07-15T22:00:00Z", "2026-07-15", "America/New_York"), "clock");
  });

  it("shows the date when the reader's zone is on another day", () => {
    assert.equal(startStyle("2026-07-16T02:00:00Z", "2026-07-15", "UTC"), "stamp");
    assert.equal(startStyle("2026-07-16T02:00:00Z", "2026-07-15", "America/New_York"), "clock");
  });

  it("keeps the clock across the spring daylight-saving change", () => {
    assert.equal(startStyle("2026-03-08T06:00:00Z", "2026-03-08", "America/New_York"), "clock");
  });

  it("does not invent a time", () => {
    assert.equal(startStyle(null, "2026-07-15"), "clock");
    assert.equal(startStyle("not-a-time", "2026-07-15"), "clock");
  });
});

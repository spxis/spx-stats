import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dateEnd, playedScoreMissing } from "../src/lib/playedLate.ts";

const HOUR = 3_600_000;
// Columbus at Minnesota: 3:00 p.m. PDT on Sunday 18 October 2026 is 22:00 UTC.
const START = "2026-10-18T22:00:00Z";
const t = Date.parse(START);
const game = { status: "scheduled", startsAt: START, gameDate: "2026-10-18" };

describe("playedScoreMissing with a start time", () => {
  it("is false before the game and during the first 4 hours", () => {
    assert.equal(playedScoreMissing(game, t - 2 * HOUR), false);
    assert.equal(playedScoreMissing(game, t), false);
    assert.equal(playedScoreMissing(game, t + 4 * HOUR), false);
  });

  it("is true more than 4 hours after the start", () => {
    assert.equal(playedScoreMissing(game, t + 4 * HOUR + 1000), true);
    assert.equal(playedScoreMissing(game, t + 24 * HOUR), true);
  });

  it("does not depend on the reader's zone: the start is an instant", () => {
    const zone = (tz: string) => playedScoreMissing(game, t + 5 * HOUR, tz);
    assert.equal(zone("UTC"), true);
    assert.equal(zone("America/New_York"), true);
    assert.equal(zone("Asia/Tokyo"), true);
  });

  it("gives up on a game long past, which is a gap in the archive", () => {
    assert.equal(playedScoreMissing(game, t + 13 * 24 * HOUR), true);
    assert.equal(playedScoreMissing(game, t + 15 * 24 * HOUR), false);
  });

  it("takes the tuple's initial for scheduled", () => {
    assert.equal(playedScoreMissing({ ...game, status: "s" }, t + 5 * HOUR), true);
  });

  it("never touches any other status", () => {
    for (const status of ["final", "f", "in_progress", "postponed", "p", "cancelled", "c", "suspended", "forfeit", ""]) {
      assert.equal(playedScoreMissing({ ...game, status }, t + 24 * HOUR), false, status);
    }
  });

  it("ignores an unreadable start and falls back to the date", () => {
    const g = { status: "scheduled", startsAt: "soon", gameDate: "2026-10-18" };
    assert.equal(playedScoreMissing(g, Date.parse("2026-10-19T12:00:00Z")), true);
  });
});

describe("playedScoreMissing with no time", () => {
  const dated = { status: "scheduled", startsAt: null, gameDate: "2026-10-18" };

  it("counts from the end of the game's date in Pacific time by default", () => {
    // 18 October ends at 07:00 UTC on the 19th (PDT); 4 hours later is 11:00 UTC.
    assert.equal(playedScoreMissing(dated, Date.parse("2026-10-19T10:59:00Z")), false);
    assert.equal(playedScoreMissing(dated, Date.parse("2026-10-19T11:01:00Z")), true);
  });

  it("is false on the day itself", () => {
    assert.equal(playedScoreMissing(dated, Date.parse("2026-10-18T23:00:00Z")), false);
  });

  it("uses the zone it is given", () => {
    // 18 October ends at 15:00 UTC on the 18th in Tokyo; 4 hours later is 19:00 UTC.
    assert.equal(playedScoreMissing(dated, Date.parse("2026-10-18T18:59:00Z"), "Asia/Tokyo"), false);
    assert.equal(playedScoreMissing(dated, Date.parse("2026-10-18T19:01:00Z"), "Asia/Tokyo"), true);
  });

  it("is false for a date that is not a date", () => {
    assert.equal(playedScoreMissing({ status: "scheduled", startsAt: null, gameDate: "" }, Date.now()), false);
  });
});

describe("dateEnd", () => {
  it("is midnight at the start of the next day in the zone", () => {
    assert.equal(new Date(dateEnd("2026-10-18", "America/Los_Angeles")!).toISOString(), "2026-10-19T07:00:00.000Z");
    assert.equal(new Date(dateEnd("2026-10-18", "America/New_York")!).toISOString(), "2026-10-19T04:00:00.000Z");
    assert.equal(new Date(dateEnd("2026-10-18", "UTC")!).toISOString(), "2026-10-19T00:00:00.000Z");
  });

  it("follows the clock change", () => {
    // Summer time ended on 1 November 2026: 31 October ends at 07:00 UTC on 1 November, 1 November ends at 08:00 UTC on the 2nd.
    assert.equal(new Date(dateEnd("2026-10-31", "America/Los_Angeles")!).toISOString(), "2026-11-01T07:00:00.000Z");
    assert.equal(new Date(dateEnd("2026-11-01", "America/Los_Angeles")!).toISOString(), "2026-11-02T08:00:00.000Z");
  });

  it("is null for nonsense", () => {
    assert.equal(dateEnd("nope"), null);
    assert.equal(dateEnd("2026-10-18", "Not/AZone"), null);
  });
});

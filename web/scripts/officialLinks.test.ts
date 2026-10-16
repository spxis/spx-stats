import assert from "node:assert/strict";
import { test } from "node:test";
import { officialAbbr, type AbbrMap } from "../src/lib/abbr.ts";
import { mlbLinks, nflLinks, nhlLinks, officialLinks } from "../src/lib/officialLinks.ts";

const DAY = "2026-10-16";

test("a regular-season NHL id builds the game page, the notes PDF and that day's scores", () => {
  const links = nhlLinks(DAY, "bos", "ANA", 2026020001);
  assert.deepEqual(links.map((l) => l.kind), ["box", "notes", "day"]);
  assert.equal(links[0].href, "https://www.nhl.com/gamecenter/bos-vs-ana/2026/10/16/2026020001");
  assert.equal(links[1].href, "https://link.nhl.com/static/gamenotes/public/20262027/gn-2026-10-16-0001-BOS@ANA.pdf");
  assert.equal(links[2].href, "https://www.nhl.com/scores/2026-10-16");
});

test("playoffs use type 03 and preseason uses type 01, both taken from the id", () => {
  const playoffs = nhlLinks("2026-04-20", "EDM", "FLA", "2026030416");
  assert.equal(playoffs[0].href, "https://www.nhl.com/gamecenter/edm-vs-fla/2026/04/20/2026030416");
  assert.equal(playoffs[1].href, "https://link.nhl.com/static/gamenotes/public/20262027/gn-2026-04-20-0416-EDM@FLA.pdf");
  const pre = nhlLinks("2026-09-22", "TOR", "MTL", "2026010007");
  assert.equal(pre[0].href, "https://www.nhl.com/gamecenter/tor-vs-mtl/2026/09/22/2026010007");
  assert.match(pre[1].href, /\/20262027\/gn-2026-09-22-0007-TOR@MTL\.pdf$/);
});

test("a missing or unusable id leaves only the day's scores", () => {
  for (const id of [null, undefined, "", "2026", "2026040001", "nhlapi:2026020001"]) {
    const links = nhlLinks(DAY, "BOS", "ANA", id);
    assert.deepEqual(links.map((l) => l.kind), ["day"], String(id));
  }
});

test("a missing abbreviation leaves only the day's scores", () => {
  assert.deepEqual(nhlLinks(DAY, "BOS", null, 2026020001).map((l) => l.kind), ["day"]);
  assert.deepEqual(nhlLinks(DAY, "BOSTON", "ANA", 2026020001).map((l) => l.kind), ["day"]);
});

test("an abbreviation that changed is the one for that season, not the club's later one", () => {
  const utah: AbbrMap = {
    1: [
      { league: "nhl", franchise_id: 1, valid_from: "1979-01-01", valid_to: "2024-06-01", abbreviation: "ARI" },
      { league: "nhl", franchise_id: 1, valid_from: "2024-06-01", valid_to: null, abbreviation: "UTA" },
    ],
  };
  const old = officialLinks({ league: "nhl", date: "2024-03-01", away: officialAbbr(utah, 1, 2023), home: "VGK", nhlId: 2023021001 });
  assert.match(old[0].href, /\/ari-vs-vgk\/2024\/03\/01\/2023021001$/);
  assert.match(old[1].href, /ARI@VGK\.pdf$/);
  const now = officialLinks({ league: "nhl", date: "2025-10-16", away: officialAbbr(utah, 1, 2025), home: "VGK", nhlId: 2025020100 });
  assert.match(now[0].href, /\/uta-vs-vgk\/2025\/10\/16\/2025020100$/);
  assert.match(now[1].href, /UTA@VGK\.pdf$/);
});

const NOW = Date.parse("2026-10-16T23:00:00Z");

function timed(status: string, startsAt: string | null) {
  return officialLinks({
    league: "nhl", date: DAY, away: "BOS", home: "ANA", nhlId: 2026020001, status, startsAt, now: NOW,
  });
}

test("a future scheduled game has the box score and the day's scores, and no game notes", () => {
  const links = timed("scheduled", "2026-10-17T02:00:00Z");
  assert.deepEqual(links.map((l) => l.kind), ["box", "day"]);
  assert.equal(links[0].href, "https://www.nhl.com/gamecenter/bos-vs-ana/2026/10/16/2026020001");
  assert.equal(links[1].href, "https://www.nhl.com/scores/2026-10-16");
  assert.equal(links.some((l) => l.href.includes("gamenotes")), false);
});

test("a game in progress has game notes", () => {
  const links = timed("in_progress", "2026-10-17T02:00:00Z");
  assert.deepEqual(links.map((l) => l.kind), ["box", "notes", "day"]);
  assert.match(links[1].href, /gn-2026-10-16-0001-BOS@ANA\.pdf$/);
});

test("a final game has game notes", () => {
  const links = timed("final", null);
  assert.deepEqual(links.map((l) => l.kind), ["box", "notes", "day"]);
  assert.match(links[1].href, /gn-2026-10-16-0001-BOS@ANA\.pdf$/);
});

test("a scheduled game whose start has passed has game notes", () => {
  const links = timed("scheduled", "2026-10-16T22:00:00Z");
  assert.deepEqual(links.map((l) => l.kind), ["box", "notes", "day"]);
});

test("a scheduled game with no start, or a start still ahead, has no game notes", () => {
  assert.deepEqual(timed("scheduled", null).map((l) => l.kind), ["box", "day"]);
  assert.deepEqual(timed("scheduled", "2026-10-16T23:00:01Z").map((l) => l.kind), ["box", "day"]);
  assert.ok(timed("scheduled", "2026-10-16T23:00:00Z").some((l) => l.kind === "notes"));
});

test("the other four leagues link to that day's scores, or the schedule where the site has no dated page", () => {
  assert.equal(officialLinks({ league: "mlb", date: DAY })[0].href, "https://www.mlb.com/scores/2026-10-16");
  assert.equal(officialLinks({ league: "nba", date: "2026-10-20" })[0].href, "https://www.nba.com/games?date=2026-10-20");
  assert.equal(officialLinks({ league: "nfl", date: DAY })[0].href, "https://www.nfl.com/schedules/");
  assert.equal(officialLinks({ league: "cfl", date: DAY })[0].href, "https://www.cfl.ca/schedule/");
  assert.equal(officialLinks({ league: "nhl", date: "not-a-date" }).length, 0);
  assert.equal(officialLinks({ league: "mls", date: DAY }).length, 0);
});

test("an NFL week builds the game page from the season, the week and the two clubs, then the schedule", () => {
  const links = nflLinks(2024, "regular", 1, "Baltimore Ravens", "Kansas City Chiefs", "2024-09-05");
  assert.deepEqual(links.map((l) => l.kind), ["box", "day"]);
  assert.equal(links[0].href, "https://www.nfl.com/games/ravens-at-chiefs-2024-reg-1");
  assert.equal(links[1].href, "https://www.nfl.com/schedules/");
});

test("a playoff week uses the postseason round, not the week number in the id", () => {
  assert.equal(
    nflLinks(2024, "playoffs", 22, "Kansas City Chiefs", "Philadelphia Eagles", "2025-02-09")[0].href,
    "https://www.nfl.com/games/chiefs-at-eagles-2024-post-4",
  );
  assert.equal(
    nflLinks(2020, "playoffs", 21, "Kansas City Chiefs", "Tampa Bay Buccaneers", "2021-02-07")[0].href,
    "https://www.nfl.com/games/chiefs-at-buccaneers-2020-post-4",
  );
  assert.equal(
    nflLinks(2021, "regular", 18, "San Francisco 49ers", "Los Angeles Rams", "2022-01-09")[0].href,
    "https://www.nfl.com/games/49ers-at-rams-2021-reg-18",
  );
  assert.equal(
    nflLinks(2020, "playoffs", 18, "Washington Football Team", "Tampa Bay Buccaneers", "2021-01-09")[0].href,
    "https://www.nfl.com/games/football-team-at-buccaneers-2020-post-1",
  );
});

test("a missing NFL week, or a week that does not belong to that phase, leaves only the schedule", () => {
  assert.deepEqual(nflLinks(2024, "regular", null, "Baltimore Ravens", "Kansas City Chiefs", "2024-09-05").map((l) => l.kind), ["day"]);
  assert.deepEqual(nflLinks(2024, "playoffs", 1, "Baltimore Ravens", "Kansas City Chiefs", "2024-09-05").map((l) => l.kind), ["day"]);
  assert.deepEqual(nflLinks(2024, "regular", 1, null, "Kansas City Chiefs", "2024-09-05").map((l) => l.kind), ["day"]);
  assert.equal(officialLinks({ league: "nfl", date: "2024-09-05", year: 2024, phase: "regular", awayName: "Baltimore Ravens", homeName: "Kansas City Chiefs" })[0].href, "https://www.nfl.com/schedules/");
});

test("a Retrosheet id builds Retrosheet's box score, and the day's scores stay on MLB.com", () => {
  const links = mlbLinks("2025-11-01", "TOR:0");
  assert.deepEqual(links.map((l) => l.kind), ["box", "day"]);
  assert.equal(links[0].href, "https://www.retrosheet.org/boxesetc/2025/B11010TOR2025.htm");
  assert.equal(links[1].href, "https://www.mlb.com/scores/2025-11-01");
  assert.equal(links.some((l) => l.href.includes("mlb.com") && l.kind === "box"), false);
});

test("a missing or unusable Retrosheet id leaves only that day's scores", () => {
  for (const box of [null, undefined, "", "TOR:4", "20251101:TOR:LAN:0:worldseries"]) {
    const links = mlbLinks("2025-11-01", box);
    assert.deepEqual(links.map((l) => l.kind), ["day"], String(box));
    assert.equal(links[0].href, "https://www.mlb.com/scores/2025-11-01");
  }
});

test("NBA and CFL stay on the day's page when an NFL week or a Retrosheet id is passed", () => {
  assert.equal(officialLinks({ league: "nba", date: "2026-10-20", nflWeek: 1, retroBox: "TOR:0", year: 2026, phase: "regular" })[0].href, "https://www.nba.com/games?date=2026-10-20");
  assert.equal(officialLinks({ league: "cfl", date: DAY, nflWeek: 1, retroBox: "TOR:0" })[0].href, "https://www.cfl.ca/schedule/");
});

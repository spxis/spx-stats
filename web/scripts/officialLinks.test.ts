import assert from "node:assert/strict";
import { test } from "node:test";
import { officialAbbr, type AbbrMap } from "../src/lib/abbr.ts";
import { nhlLinks, officialLinks } from "../src/lib/officialLinks.ts";

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

test("the other four leagues link to that day's scores, or the schedule where the site has no dated page", () => {
  assert.equal(officialLinks({ league: "mlb", date: DAY })[0].href, "https://www.mlb.com/scores/2026-10-16");
  assert.equal(officialLinks({ league: "nba", date: "2026-10-20" })[0].href, "https://www.nba.com/games?date=2026-10-20");
  assert.equal(officialLinks({ league: "nfl", date: DAY })[0].href, "https://www.nfl.com/schedules/");
  assert.equal(officialLinks({ league: "cfl", date: DAY })[0].href, "https://www.cfl.ca/schedule/");
  assert.equal(officialLinks({ league: "nhl", date: "not-a-date" }).length, 0);
  assert.equal(officialLinks({ league: "mls", date: DAY }).length, 0);
});

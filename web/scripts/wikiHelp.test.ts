import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { officialLinks } from "../src/lib/officialLinks.ts";
import { playedScoreMissing } from "../src/lib/playedLate.ts";
import {
  candidateWindow, citeTemplate, gameCitation, gapGame, groupByLeague, localDay, mlbPostseasonTitle, pageToCite, publisherOf,
  seasonLabel, seasonTitle, wikiEditUrl, wikiViewUrl,
} from "../src/lib/wikiHelp.ts";

const row = (o: Record<string, unknown> = {}) => ({
  league: "nhl", year: 2026, game_id: 7, game_date: "2026-10-16", phase: "regular", status: "scheduled",
  away: "Boston Bruins", home: "Anaheim Ducks", starts_at: "2026-10-17T02:00:00Z", nhl_id: 2026020001, nfl_week: null, ...o,
}) as Parameters<typeof gapGame>[0];
const abbr = (side: "away" | "home") => (side === "away" ? "BOS" : "ANA");

describe("Wikipedia article titles", () => {
  it("labels the season as scripts/daily/run.py does", () => {
    assert.equal(seasonLabel("nhl", 2026), "2026–27");
    assert.equal(seasonLabel("nba", 1999), "1999–00");
    assert.equal(seasonLabel("nfl", 2026), "2026");
    assert.equal(seasonLabel("cfl", 2026), "2026");
  });
  it("builds the club-season title, without accents, with the one alias", () => {
    assert.equal(seasonTitle("nhl", 2026, "Montréal Canadiens"), "2026–27 Montreal Canadiens season");
    assert.equal(seasonTitle("mlb", 2026, "Sacramento Athletics"), "2026 Athletics season");
    assert.equal(seasonTitle("mlb", 2026, "New York Yankees"), "2026 New York Yankees season");
    assert.equal(mlbPostseasonTitle(2026), "2026 Major League Baseball postseason");
  });
  it("builds the view and edit addresses on English Wikipedia", () => {
    assert.equal(wikiViewUrl("2026–27 Boston Bruins season"), "https://en.wikipedia.org/wiki/2026%E2%80%9327_Boston_Bruins_season");
    assert.equal(wikiEditUrl("2026 Athletics season"), "https://en.wikipedia.org/w/index.php?title=2026_Athletics_season&action=edit");
  });
});

describe("which games are candidates", () => {
  it("keeps a scheduled regular-season or playoff game of the five leagues and names both clubs' articles", () => {
    const g = gapGame(row(), abbr)!;
    assert.deepEqual(g.articles, ["2026–27 Boston Bruins season", "2026–27 Anaheim Ducks season"]);
    assert.equal(g.awayAbbr, "BOS");
    assert.equal(g.nhlId, 2026020001);
  });
  it("adds the MLB postseason article to a playoff game", () => {
    const g = gapGame(row({ league: "mlb", phase: "playoffs", away: "Seattle Mariners", home: "Detroit Tigers" }), abbr)!;
    assert.equal(g.articles.length, 3);
    assert.equal(g.articles[2], "2026 Major League Baseball postseason");
  });
  it("leaves out a final, a postponed game, a preseason game, another league and a game with no club", () => {
    assert.equal(gapGame(row({ status: "final" }), abbr), null);
    assert.equal(gapGame(row({ status: "postponed" }), abbr), null);
    assert.equal(gapGame(row({ phase: "preseason" }), abbr), null);
    assert.equal(gapGame(row({ league: "wnba" }), abbr), null);
    assert.equal(gapGame(row({ home: null }), abbr), null);
  });
  it("carries every game of the last 16 days and the day after", () => {
    assert.deepEqual(candidateWindow("2026-10-19"), { first: "2026-10-03", last: "2026-10-20" });
  });
  it("is cut down by the 4 hour, 14 day rule on the reader's clock", () => {
    const g = gapGame(row(), abbr)!;
    const start = Date.parse(g.startsAt!);
    const missing = (now: number) => playedScoreMissing({ status: "scheduled", startsAt: g.startsAt, gameDate: g.date }, now);
    assert.equal(missing(start + 3 * 3_600_000), false);
    assert.equal(missing(start + 5 * 3_600_000), true);
    assert.equal(missing(start + 15 * 86_400_000), false);
  });
});

describe("the official page and the citation", () => {
  const now = Date.parse("2026-10-19T12:00:00Z");
  it("prefers the game's own page and never the notes PDF", () => {
    const g = gapGame(row(), abbr)!;
    const links = officialLinks({ league: g.league, date: g.date, away: g.awayAbbr, home: g.homeAbbr, nhlId: g.nhlId, status: "scheduled", startsAt: g.startsAt, now });
    assert.equal(pageToCite(links)?.kind, "box");
    const c = gameCitation(g, links, "2026-10-19")!;
    assert.equal(c.url, "https://www.nhl.com/gamecenter/bos-vs-ana/2026/10/16/2026020001");
    assert.equal(c.template, "{{cite web |url=https://www.nhl.com/gamecenter/bos-vs-ana/2026/10/16/2026020001 |title=Boston Bruins at Anaheim Ducks, 2026-10-16 |publisher=NHL.com |access-date=2026-10-19}}");
  });
  it("falls back to the day's scores when the league has no game page", () => {
    const g = gapGame(row({ league: "nba", away: "Boston Celtics", home: "Miami Heat", nhl_id: null }), abbr)!;
    const links = officialLinks({ league: g.league, date: g.date, status: "scheduled", now });
    const c = gameCitation(g, links, "2026-10-19")!;
    assert.equal(c.url, "https://www.nba.com/games?date=2026-10-16");
    assert.match(c.template, /\|title=NBA scores, 2026-10-16 \|publisher=NBA\.com /);
  });
  it("never puts our own site, a score or a parameter-breaking character in the template", () => {
    const t = citeTemplate({ url: "https://www.nhl.com/x", title: "A | B {{C}}", publisher: "NHL.com", accessDate: "2026-10-19" });
    assert.ok(!/spxn/i.test(t));
    assert.equal(t.match(/\|/g)?.length, 4);
    assert.ok(!t.includes("{{C}}"));
  });
  it("names the publisher from the address, or none for an address it does not know", () => {
    assert.equal(publisherOf("https://www.nfl.com/games/x"), "NFL.com");
    assert.equal(publisherOf("https://www.cfl.ca/schedule/"), "CFL.ca");
    assert.equal(publisherOf("https://www.retrosheet.org/boxesetc/x.htm"), "Retrosheet");
    assert.equal(publisherOf("https://example.com/"), null);
    assert.equal(publisherOf("not a url"), null);
  });
  it("gives no citation without an official link", () => {
    assert.equal(gameCitation(gapGame(row(), abbr)!, [], "2026-10-19"), null);
  });
});

describe("the list", () => {
  it("groups by league in the page's order, newest day first", () => {
    const a = gapGame(row({ game_id: 1, game_date: "2026-10-15" }), abbr)!;
    const b = gapGame(row({ game_id: 2, game_date: "2026-10-17" }), abbr)!;
    const c = gapGame(row({ game_id: 3, league: "nba", away: "Boston Celtics", home: "Miami Heat" }), abbr)!;
    const groups = groupByLeague([c, a, b]);
    assert.deepEqual(groups.map((x) => x.league), ["nhl", "nba"]);
    assert.deepEqual(groups[0].games.map((x) => x.id), [2, 1]);
  });
  it("writes the access date in the reader's calendar", () => {
    assert.equal(localDay(new Date(2026, 9, 5, 12).getTime()), "2026-10-05");
  });
});

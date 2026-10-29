import assert from "node:assert/strict";
import { test } from "node:test";
import { menuEntries, menuFamilyOf } from "../src/lib/leagueFamilies.ts";
import { ALL_LEAGUES, hasPlayers, hasSeries, isOutsideConference, LG, LEAGUES, OUTSIDE_CONFERENCE, PARENT, seasonLabel, seasonSeg } from "../src/lib/leagues.ts";
import { bowlName, ncaafChampNote, groupOf, isVacated, playoffRound, roundTag, titleGame, titleGameOf, type PostGame } from "../src/lib/postseason.ts";

/** Run in web/: pnpm test:ncaaf. College football: its place in the menu, its seasons, what a team outside the league is, and how the postseason is told. */

test("college football is a league of its own, in the menu right after the NFL and under no parent", () => {
  assert.ok(ALL_LEAGUES.some((l) => l.code === "ncaaf"));
  assert.equal(PARENT.ncaaf, undefined);
  assert.ok(LEAGUES.some((l) => l.code === "ncaaf"));
  const menu = menuEntries();
  const i = menu.findIndex((m) => m.id === "ncaaf");
  assert.equal(menu[i - 1].id, "nfl");
  assert.deepEqual([menu[i].label, menu[i].href], ["College football", "/ncaaf"]);
  assert.equal(menuFamilyOf("ncaaf"), "ncaaf");
  assert.equal(menuFamilyOf("nfl"), "nfl");
  assert.equal(LG.ncaaf, "College football");
});

test("a season is one calendar year, and there are no series or player pages", () => {
  assert.equal(seasonSeg("ncaaf", 2025), "2025");
  assert.equal(seasonLabel("ncaaf", 2005), "2005");
  assert.equal(hasSeries("ncaaf"), false);
  assert.equal(hasSeries("nfl"), true);
  assert.equal(hasPlayers("ncaaf"), false);
  assert.equal(hasPlayers("nba"), true);
});

test("only the pseudo conference of outside opponents is outside", () => {
  assert.equal(OUTSIDE_CONFERENCE.ncaaf, "Non-FBS opponents");
  assert.equal(isOutsideConference("ncaaf", "Non-FBS opponents"), true);
  assert.equal(isOutsideConference("ncaaf", "Big Ten Conference"), false);
  assert.equal(isOutsideConference("ncaaf", null), false);
  assert.equal(isOutsideConference("nfl", "Non-FBS opponents"), false);
});

const game = (id: number, date: string, phase: string, label: string | null, a: number, b: number): PostGame => ({
  id, date, phase, label, a: { id: 1, f: 1, name: "A", score: a }, b: { id: 2, f: 2, name: "B", score: b },
});

test("a game is a conference championship, a Playoff game, a bowl or the title game by its label", () => {
  assert.equal(groupOf({ phase: "r", label: "SEC Championship Game" }, null), "conference");
  assert.equal(groupOf({ phase: "r", label: null }, null), null);
  assert.equal(groupOf({ phase: "p", label: "Rose Bowl (CFP Semifinal)" }, null), "playoff");
  assert.equal(groupOf({ phase: "p", label: "College Football Playoff (CFP First Round)" }, null), "playoff");
  assert.equal(groupOf({ phase: "p", label: "Alamo Bowl" }, null), "bowl");
  assert.equal(groupOf({ phase: "p", label: null }, null), "bowl");
  assert.equal(groupOf({ phase: "p", label: "College Football Playoff National Championship" }, null), "title");
  assert.equal(groupOf({ phase: "p", label: "Rose Bowl (National Championship Game)" }, null), "title");
  // a plain bowl that was the title game that year (the 2000 Orange Bowl) is the title game when the champion's note says so
  assert.equal(groupOf({ phase: "p", label: "Orange Bowl" }, "Orange Bowl"), "title");
  assert.equal(groupOf({ phase: "p", label: "Orange Bowl" }, null), "bowl");
});

test("the name and round of a bowl come out of its label", () => {
  assert.equal(bowlName("Rose Bowl (CFP Semifinal)"), "Rose Bowl");
  assert.equal(bowlName("Rose Bowl (National Championship Game)"), "Rose Bowl");
  assert.equal(bowlName("Cotton Bowl Classic"), "Cotton Bowl Classic");
  assert.equal(roundTag("Orange Bowl (CFP Semifinal)"), "Semifinal");
  assert.equal(roundTag("Alamo Bowl"), "");
  assert.deepEqual(["College Football Playoff (CFP First Round)", "Peach Bowl (CFP Quarterfinal)", "Orange Bowl (CFP Semifinal)", "College Football Playoff National Championship", "Alamo Bowl"].map(playoffRound), [1, 2, 3, 4, 0]);
});

test("the title game is the last game of the title group; the note names it and says when the title was vacated", () => {
  const games = [game(1, "2005-01-04", "p", "Orange Bowl (National Championship Game)", 55, 19), game(2, "2005-01-01", "p", "Rose Bowl", 38, 14)];
  assert.equal(titleGame(games, "Orange Bowl (National Championship Game)")?.id, 1);
  assert.equal(titleGame([game(2, "2005-01-01", "p", "Rose Bowl", 38, 14)], null), null);
  const note = "Won the national championship game; the title was later vacated (game: Orange Bowl (National Championship Game))";
  assert.equal(titleGameOf(note), "Orange Bowl (National Championship Game)");
  assert.equal(isVacated(note), true);
  assert.equal(isVacated("Won the national championship game (game: Sugar Bowl)"), false);
  assert.equal(titleGameOf(null), null);
});

test("a champion's note reads as a sentence, the vacated title said", () => {
  assert.equal(ncaafChampNote("Won the national championship game (game: College Football Playoff National Championship)"), "Won the College Football Playoff National Championship.");
  assert.equal(ncaafChampNote("Won the national championship game (game: Sugar Bowl)"), "Won the Sugar Bowl, that year's national championship game.");
  assert.match(ncaafChampNote("Won the national championship game; the title was later vacated (game: Orange Bowl)"), /later vacated/);
  assert.equal(ncaafChampNote("something else"), "something else");
});

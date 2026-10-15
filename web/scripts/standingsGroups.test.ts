import assert from "node:assert/strict";
import { test } from "node:test";
import type { Placed } from "../src/lib/alignment.ts";
import { chosenGroup, groupChoices, placeHeading, placeLabel, rowClasses, slug } from "../src/lib/standingsGroups.ts";

/** Run in web/: pnpm test:standingsgroups */
const mlb: Placed[] = [
  { conference: "American League", conference_short: "AL", division: "American League East", division_short: "AL East" },
  { conference: "American League", conference_short: "AL", division: "American League Central", division_short: "AL Central" },
  { conference: "National League", conference_short: "NL", division: "National League West", division_short: "NL West" },
  { conference: "National League", conference_short: "NL", division: "National League West", division_short: "NL West" },
];
const nhl: Placed[] = [
  { conference: "Eastern Conference", conference_short: "East", division: "Atlantic Division", division_short: "Atlantic" },
  { conference: "Western Conference", conference_short: "West", division: "Pacific Division", division_short: "Pacific" },
  { conference: "Western Conference", conference_short: "West", division: "Central Division", division_short: "Central" },
];
const cfl: Placed[] = [{ conference: "East", conference_short: "East" }, { conference: "West", conference_short: "West" }];

test("the column names a club's place: the short division when it already says the league, else conference and division", () => {
  assert.equal(placeLabel(mlb[0]), "AL East");
  assert.equal(placeLabel(nhl[0]), "East / Atlantic");
  assert.equal(placeLabel(cfl[0]), "East");
  assert.equal(placeLabel({}), "");
});

test("the column's heading says League for MLB, Conference elsewhere, and Division when there are no conferences", () => {
  assert.equal(placeHeading("mlb", mlb), "col.leagueDiv");
  assert.equal(placeHeading("nhl", nhl), "col.confDiv");
  assert.equal(placeHeading("cfl", cfl), "view.conference");
  assert.equal(placeHeading("mlb", [{ conference: "American League" }]), "view.league");
  assert.equal(placeHeading("nhl", [{ division: "Atlantic" }]), "view.division");
  assert.equal(placeHeading("nhl", [{}]), null);
});

test("each view offers its own groups as buttons, none for the whole league", () => {
  assert.deepEqual(groupChoices("league", mlb), []);
  assert.deepEqual(groupChoices("conference", mlb).map((c) => [c.key, c.label]), [["al", "AL"], ["nl", "NL"]]);
  assert.deepEqual(groupChoices("wildcard", nhl).map((c) => c.label), ["East", "West"]);
  assert.deepEqual(groupChoices("division", mlb).map((c) => [c.key, c.label]), [["al-central", "AL Central"], ["al-east", "AL East"], ["nl-west", "NL West"]]);
  assert.deepEqual(groupChoices("division", nhl).map((c) => [c.key, c.label]), [["east-atlantic", "Atlantic"], ["west-central", "Central"], ["west-pacific", "Pacific"]]);
});

test("one group is no choice", () => {
  assert.deepEqual(groupChoices("conference", [mlb[0], mlb[1]]), []);
  assert.deepEqual(groupChoices("division", cfl), []);
});

test("a division name shared by two conferences keeps its conference on the button", () => {
  const rows: Placed[] = [
    { conference: "Eastern Conference", conference_short: "East", division: "Central Division", division_short: "Central" },
    { conference: "Western Conference", conference_short: "West", division: "Central Division", division_short: "Central" },
  ];
  assert.deepEqual(groupChoices("division", rows).map((c) => c.label), ["East / Central", "West / Central"]);
});

test("a choice finds its own rows and the class they carry", () => {
  const al = groupChoices("conference", mlb)[0];
  assert.deepEqual(mlb.map((r) => al.has(r)), [true, true, false, false]);
  const east = groupChoices("division", mlb).find((c) => c.key === "al-east")!;
  assert.deepEqual(mlb.map((r) => east.has(r)), [true, false, false, false]);
  assert.equal(rowClasses(mlb[0]), "gc-al gd-al-east");
  assert.ok(rowClasses(mlb[0]).split(" ").includes(east.cls));
  assert.equal(rowClasses({}), "");
});

test("?group= names one choice; anything else shows the whole table", () => {
  const choices = groupChoices("conference", mlb);
  assert.equal(chosenGroup(choices, "nl")?.label, "NL");
  assert.equal(chosenGroup(choices, ["al", "nl"])?.label, "AL");
  assert.equal(chosenGroup(choices, "al-east"), null);
  assert.equal(chosenGroup(choices, undefined), null);
  assert.equal(chosenGroup([], "al"), null);
});

test("a key is lower case with single dashes", () => {
  assert.equal(slug("East / Atlantic"), "east-atlantic");
  assert.equal(slug("  AL  East "), "al-east");
  assert.equal(slug(null), "");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { PHRASES } from "../src/lib/i18n/phrases.constants.ts";
import type { TournamentTeam } from "../src/lib/soccer.ts";
import { regionOf, stripTeams, tierOf } from "../src/lib/soccerStrip.ts";

/** Run in web/: pnpm test:soccer (the strip of a tournament's teams and the map in its corner; AGENTS.md section 9). */

const team = (id: string, name: string, slug: string, flag: string | null, performance: string | null, position: number | null, extra: Partial<TournamentTeam> = {}): TournamentTeam => ({
  tournament_id: "WC-2022", league: "wc", year: 2022, team_id: id, team: name, team_slug: slug, flag_code: flag, performance, final_position: position, is_host: false,
  group_name: null, played: 7, won: 4, drawn: 2, lost: 1, goals_for: 15, goals_against: 8, managers: null, ...extra,
});

test("a team's tier runs from the group stage to the title", () => {
  assert.equal(tierOf(0), 0);
  assert.equal(tierOf(1), 0);
  assert.equal(tierOf(3), 0, "the final round of 1950 is a group");
  assert.equal(tierOf(4), 1);
  assert.equal(tierOf(5), 1);
  assert.equal(tierOf(6), 2);
  assert.equal(tierOf(7), 3);
  assert.equal(tierOf(96), 3, "fourth place reached the semi-finals");
  assert.equal(tierOf(97), 3);
  assert.equal(tierOf(98), 4);
  assert.equal(tierOf(99), 5);
});

test("a team's region on the world map: its flag's country, the United Kingdom for a home nation, the country of a team that is gone", () => {
  assert.equal(regionOf({ flag_code: "AR", team_slug: "argentina" }), "AR");
  assert.equal(regionOf({ flag_code: "GB-ENG", team_slug: "england" }), "GB");
  assert.equal(regionOf({ flag_code: "GB-WLS", team_slug: "wales" }), "GB");
  assert.equal(regionOf({ flag_code: null, team_slug: "zaire" }), "CD");
  assert.equal(regionOf({ flag_code: null, team_slug: "soviet-union" }), "RU");
  assert.equal(regionOf({ flag_code: null, team_slug: "somewhere-new" }), null);
});

test("the strip lists the teams by name, each with a squad anchor of its FIFA code, a second team with the same code taking its slug", () => {
  const say = (key: keyof typeof PHRASES) => PHRASES[key];
  const list = stripTeams([
    team("T-03", "Argentina", "argentina", "AR", "final", 1),
    team("T-10", "England", "england", "GB-ENG", "quarter-finals", null),
    team("T-90", "Aaa Land", "aaa-land", null, "group stage", null),
    team("T-91", "Aaa Islands", "aaa-islands", null, "group stage", null),
  ], say, (t) => t.team, (id) => id !== "T-10");
  assert.deepEqual(list.map((t) => t.name), ["Aaa Islands", "Aaa Land", "Argentina", "England"]);
  const arg = list.find((t) => t.slug === "argentina")!;
  assert.equal(arg.code, "ARG");
  assert.equal(arg.anchor, "squad-arg");
  assert.equal(arg.tier, 5);
  assert.equal(arg.stage, "Champions");
  assert.equal(arg.squad, true);
  assert.equal(list.find((t) => t.slug === "england")!.squad, false, "no squad on the page: the strip leads to the team's page");
  assert.equal(new Set(list.map((t) => t.anchor)).size, 4, "every anchor is its own");
  assert.equal(list.find((t) => t.slug === "aaa-islands")!.code, "AAA");
  assert.ok(list.some((t) => t.anchor === "squad-aaa-land" || t.anchor === "squad-aaa-islands"), "the second AAA takes its slug");
});

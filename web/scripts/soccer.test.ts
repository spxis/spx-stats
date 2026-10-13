import assert from "node:assert/strict";
import { test } from "node:test";
import { PHRASES } from "../src/lib/i18n/phrases.constants.ts";
import { FR } from "../src/lib/i18n/dictionaries/fr.constants.ts";
import { JA } from "../src/lib/i18n/dictionaries/ja.constants.ts";
import { SOCCER_EN, SOCCER_FR, SOCCER_JA } from "../src/lib/i18n/soccer.constants.ts";
import { subdivisionName, teamName } from "../src/lib/soccerNames.ts";
import { soccerMatchIdOf, soccerMatchPath, soccerPlayerPath, soccerTeamPath, tournamentPath } from "../src/lib/soccerPath.ts";
import { reachRank, reached, scoreLines, STAGE_PHRASE } from "../src/lib/soccerView.ts";

/** Run in web/: pnpm test:soccer */
const placeholdersIn = (t: string) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const say = (key: keyof typeof PHRASES, vars?: Record<string, string | number>) =>
  PHRASES[key].replace(/\{(\w+)\}/g, (w, n: string) => (vars && n in vars ? String(vars[n]) : w));

test("every soccer phrase is in the English, French and Japanese catalogues with the same placeholders", () => {
  for (const key of Object.keys(SOCCER_EN) as (keyof typeof SOCCER_EN)[]) {
    assert.ok(PHRASES[key], key);
    assert.ok(FR[key] && SOCCER_FR[key], `fr ${key}`);
    assert.ok(JA[key] && SOCCER_JA[key], `ja ${key}`);
    assert.deepEqual(placeholdersIn(SOCCER_FR[key]), placeholdersIn(SOCCER_EN[key]), `fr placeholders of ${key}`);
    assert.deepEqual(placeholdersIn(SOCCER_JA[key]), placeholdersIn(SOCCER_EN[key]), `ja placeholders of ${key}`);
  }
});

test("every stage the data can name has a phrase", () => {
  for (const key of ["group", "first_round", "second_group", "final_round", "round_of_32", "round_of_16", "quarter", "semi", "third_place", "final"]) {
    assert.ok(STAGE_PHRASE[key], key);
    assert.ok(STAGE_PHRASE[key] in PHRASES, key);
  }
});

test("addresses carry the id at one end and read back", () => {
  assert.equal(tournamentPath(2022), "/worldcup/2022");
  assert.equal(soccerTeamPath("west-germany"), "/worldcup/team/west-germany");
  assert.equal(soccerMatchPath(2022, 1237, "Argentina", "France"), "/worldcup/2022/match/1237-argentina-france");
  assert.equal(soccerMatchIdOf("1237-argentina-france"), 1237);
  assert.equal(soccerMatchIdOf("1237"), 1237);
  assert.equal(soccerMatchIdOf("argentina-1237"), null);
  assert.equal(soccerPlayerPath(41963, "Lionel Messi"), "/worldcup/player/lionel-messi-41963");
});

test("a team's name follows the reader's language; the home nations and former states are written out", () => {
  assert.equal(teamName({ name: "Ivory Coast", slug: "ivory-coast", flag: "CI" }, "en"), "Ivory Coast");
  assert.equal(teamName({ name: "West Germany", slug: "west-germany", flag: "DE" }, "fr"), "Allemagne de l’Ouest");
  assert.equal(teamName({ name: "England", slug: "england", flag: "GB-ENG" }, "ja"), "イングランド");
  assert.equal(teamName({ name: "Spain", slug: "spain", flag: "ES" }, "fr"), "Espagne");
  assert.equal(teamName({ name: "Nowhere", slug: "nowhere", flag: null }, "fr"), "Nowhere");
  assert.equal(subdivisionName("GB-SCT", "fr"), "Écosse");
  assert.equal(subdivisionName("FR", "fr"), null);
});

test("how far a team went: the final position first, then the stage", () => {
  const s = (k: keyof typeof PHRASES) => say(k);
  assert.equal(reached(s, { performance: "final", final_position: 1 }), "Champions");
  assert.equal(reached(s, { performance: "final", final_position: 2 }), "Runners-up");
  assert.equal(reached(s, { performance: "third-place match", final_position: 4 }), "Fourth place");
  assert.equal(reached(s, { performance: "quarter-finals", final_position: null }), "Quarter-finals");
  assert.ok(reachRank({ performance: "final", final_position: 1 }) > reachRank({ performance: "final", final_position: 2 }));
  assert.ok(reachRank({ performance: "final", final_position: 2 }) > reachRank({ performance: "semi-finals", final_position: null }));
  assert.ok(reachRank({ performance: "semi-finals", final_position: null }) > reachRank({ performance: "group stage", final_position: null }));
});

test("a score shows extra time and the shootout under it", () => {
  const base = { home_goals: 3, away_goals: 3, extra_time: true, shootout: true, home_penalties: 4, away_penalties: 2 };
  const s = (k: keyof typeof PHRASES, v?: Record<string, string | number>) => say(k, v);
  assert.deepEqual(scoreLines(s, base), { main: "3–3", note: "4–2 on penalties" });
  assert.deepEqual(scoreLines(s, { ...base, shootout: false, home_penalties: null, away_penalties: null }), { main: "3–3", note: "after extra time" });
  assert.deepEqual(scoreLines(s, { ...base, extra_time: false, shootout: false, home_penalties: null, away_penalties: null }), { main: "3–3", note: null });
});

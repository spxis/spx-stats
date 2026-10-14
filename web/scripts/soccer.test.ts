import assert from "node:assert/strict";
import { test } from "node:test";
import { PHRASES } from "../src/lib/i18n/phrases.constants.ts";
import { FR } from "../src/lib/i18n/dictionaries/fr.constants.ts";
import { JA } from "../src/lib/i18n/dictionaries/ja.constants.ts";
import { SOCCER_EN, SOCCER_FR, SOCCER_JA } from "../src/lib/i18n/soccer.constants.ts";
import { subdivisionName, teamName } from "../src/lib/soccerNames.ts";
import { soccerMatchIdOf, soccerMatchPath, soccerPlayerPath, soccerTeamPath, tournamentPath } from "../src/lib/soccerPath.ts";
import type { Match, TeamMatch } from "../src/lib/soccer.ts";
import { goalsOf, h2hPath, metPairs, opponentRecords, pairKey, splitPair, summarize } from "../src/lib/soccerH2H.ts";
import { reachRank, reached, scoreLines, STAGE_PHRASE } from "../src/lib/soccerView.ts";
import { contrast, lum, PAPER } from "../src/lib/brand.ts";
import { APART, deltaE, TEXT_CONTRAST, TOO_LIGHT } from "../src/lib/seriesLooks.ts";
import { clubAbbr, neutralLooks, SOCCER_LOOK, soccerAbbr, soccerLooks } from "../src/lib/soccerLook.ts";
import { soccerFlagAddress } from "../src/lib/soccerFlagSprite.ts";

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

// ── head to head (lib/soccerH2H.ts) ──────────────────────────────────────────────────────────────────────────────────────────────────
const meeting = (id: number, year: number, home: string, away: string, hg: number, ag: number, extra: Partial<Match> = {}): Match => ({
  match_id: id, source_key: "", league: "wc", year, tournament_id: `wc${year}`, stage_key: "group", stage_order: 1, group_name: null, match_number: null,
  match_date: `${year}-06-01`, kickoff_local: null, utc_offset: null, home_team_id: home, home, home_slug: home, home_flag: null, home_goals: hg,
  away_team_id: away, away, away_slug: away, away_flag: null, away_goals: ag, home_goals_90: null, away_goals_90: null, extra_time: false, shootout: false,
  home_penalties: null, away_penalties: null, winner_team_id: hg > ag ? home : ag > hg ? away : null, is_replay: false, venue_name: null, venue_city: null,
  venue_country: null, venue_wikidata_id: null, venue_id: null, lineup_players: 0, goal_rows: 0, source: null, checked: null, ...extra,
});

test("a pairing's address has the two slugs alphabetically, whichever way round they are asked for", () => {
  assert.equal(h2hPath("france", "argentina"), "/worldcup/head-to-head/argentina-vs-france");
  assert.equal(h2hPath("argentina", "france"), "/worldcup/head-to-head/argentina-vs-france");
  assert.deepEqual(splitPair("united-states-vs-sweden"), ["united-states", "sweden"]);
  assert.equal(splitPair("argentina"), null);
  assert.equal(splitPair("argentina-vs-argentina"), null);
  assert.equal(splitPair("a-vs-b-vs-c"), null);
  assert.equal(pairKey("T-30", "T-03"), pairKey("T-03", "T-30"));
});

test("a head-to-head record: draws include shootouts, which are counted on the side; widest wins; first, last and stages", () => {
  const ms = [
    meeting(1, 1930, "ARG", "FRA", 1, 0),
    meeting(2, 1978, "ARG", "FRA", 2, 1),
    meeting(3, 2018, "FRA", "ARG", 4, 3, { stage_key: "round_of_16", stage_order: 5 }),
    meeting(4, 2022, "ARG", "FRA", 3, 3, { stage_key: "final", stage_order: 9, extra_time: true, shootout: true, home_penalties: 4, away_penalties: 2, winner_team_id: "ARG" }),
  ];
  const s = summarize([ms[3], ms[0], ms[2], ms[1]], "ARG", "FRA");
  assert.equal(s.played, 4);
  assert.deepEqual([s.aWins, s.draws, s.bWins], [2, 1, 1]);
  assert.deepEqual([s.aShootoutWins, s.bShootoutWins], [1, 0]);
  assert.deepEqual([s.aGoals, s.bGoals], [1 + 2 + 3 + 3, 0 + 1 + 4 + 3]);
  assert.equal(s.biggestA?.match_id, 2, "1-0 and 2-1 are both one goal ahead; the match with more goals wins");
  assert.equal(s.biggestB?.match_id, 3);
  assert.equal(s.first?.match_id, 1);
  assert.equal(s.last?.match_id, 4);
  assert.deepEqual(s.stages, ["group", "round_of_16", "final"]);
  assert.deepEqual(goalsOf(ms[2], "ARG"), [3, 4]);
});

test("the pairings that have met, and a team's opponents from its own matches", () => {
  assert.equal(metPairs([{ home_team_id: "A", away_team_id: "B" }, { home_team_id: "B", away_team_id: "A" }, { home_team_id: "A", away_team_id: "C" }]).size, 2);
  const tm = (id: number, opp: string, gf: number, ga: number, shootout = false, won: boolean | null = null): TeamMatch => ({
    match_id: id, league: "wc", year: 2000 + id, tournament_id: "wc", stage_key: "group", stage_order: 1, group_name: null, match_date: "2000-01-01", team_id: "T", opponent_id: opp,
    opponent: opp, opponent_slug: opp, opponent_flag: null, is_home: true, gf, ga, result: gf > ga ? "w" : gf < ga ? "l" : "d", extra_time: shootout, shootout, pens_for: null,
    pens_against: null, won_match: won, venue_name: null, venue_city: null, venue_country: null,
  });
  const r = opponentRecords([tm(1, "X", 2, 0), tm(2, "X", 1, 1, true, true), tm(3, "Y", 0, 1), tm(4, "X", 0, 0, true, false)]);
  const x = r.find((o) => o.opponent_id === "X")!;
  assert.deepEqual([x.played, x.won, x.drawn, x.lost, x.pens_won, x.pens_lost, x.last_year], [3, 1, 2, 0, 1, 1, 2004]);
  assert.equal(r.length, 2);
});

test("a national team's FIFA code and flag colours: all 93 teams, never white-ish, text at AA on every pair of them", () => {
  const ids = Object.keys(SOCCER_LOOK);
  assert.equal(ids.length, 93);
  for (const id of ids) {
    const [abbr, a, b] = SOCCER_LOOK[id];
    assert.match(abbr, /^[A-Z]{3}$/, id);
    assert.match(a, /^[0-9a-f]{6}$/, id);
    assert.match(b, /^[0-9a-f]{6}$/, id);
  }
  // The FIFA code, which api.soccer_teams.fifa_code (ISO 3166 alpha-3 for many teams, and one code for both Germanys) is not.
  assert.deepEqual(["T-73", "T-03", "T-31", "T-86", "T-48", "T-75", "X-dr-congo", "T-88"].map((id) => soccerAbbr(id, "x")), ["ESP", "ARG", "GER", "FRG", "NED", "SUI", "COD", "ZAI"]);
  assert.equal(soccerAbbr("T-99", "Atlantis"), "ATL");
  for (const x of ids) for (const y of ids) {
    if (x >= y) continue;
    const [la, lb] = soccerLooks(x, y);
    for (const [side, look] of [["first", la], ["second", lb]] as const) {
      assert.ok(lum(look.block) <= TOO_LIGHT, `${x} v ${y}: ${side} block #${look.block} is white-ish`);
      assert.ok(contrast(look.block, look.on) >= TEXT_CONTRAST, `${x} v ${y}: text on ${side} block`);
      assert.ok(contrast(look.light, PAPER.light) >= 3 && contrast(look.dark, PAPER.dark) >= 3, `${x} v ${y}: ${side} line unreadable`);
    }
    // Two reds or two blues: the second side must still read apart (a pairing of alike flags may fall back to a neutral, never to the same colour).
    assert.ok(deltaE(la.block, lb.block) >= APART, `${x} v ${y}: blocks #${la.block} and #${lb.block} are alike`);
  }
  const [n1, n2] = neutralLooks();
  assert.ok(deltaE(n1.block, n2.block) >= APART && contrast(n1.block, n1.on) >= TEXT_CONTRAST && contrast(n2.block, n2.on) >= TEXT_CONTRAST);
});

test("MLS clubs get a short name; a round flag has a file of its own, or none", () => {
  assert.deepEqual(["C-seattle-sounders-fc", "C-la-galaxy", "C-new-york-red-bulls", "C-unknown-fc"].map((id) => clubAbbr(id, "Unknown FC")), ["SEA", "LAG", "NYRB", "UNK"]);
  assert.equal(soccerFlagAddress("ES"), "/soccer-flag/ES.svg");
  assert.equal(soccerFlagAddress("gb-eng"), "/soccer-flag/GB-ENG.svg");
  assert.equal(soccerFlagAddress(null), null);
  assert.equal(soccerFlagAddress("../x"), null);
});

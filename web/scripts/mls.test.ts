import assert from "node:assert/strict";
import { test } from "node:test";
import { PHRASES } from "../src/lib/i18n/phrases.constants.ts";
import { FR } from "../src/lib/i18n/dictionaries/fr.constants.ts";
import { JA } from "../src/lib/i18n/dictionaries/ja.constants.ts";
import { MLS_EN, MLS_FR, MLS_JA } from "../src/lib/i18n/mls.constants.ts";
import { mlsClubPath, mlsMatchPath, mlsSeasonPath } from "../src/lib/mlsPath.ts";
import { MLS_STAGE_PHRASE, mlsReachRank, mlsReached, mlsScoreLines, playoffTies, type TieMatch } from "../src/lib/mlsView.ts";

/** Run in web/: pnpm test:mls */
const placeholdersIn = (t: string) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const say = (key: keyof typeof PHRASES, vars?: Record<string, string | number>) =>
  PHRASES[key].replace(/\{(\w+)\}/g, (w, n: string) => (vars && n in vars ? String(vars[n]) : w));

test("every MLS phrase is in the English, French and Japanese catalogues with the same placeholders", () => {
  for (const key of Object.keys(MLS_EN) as (keyof typeof MLS_EN)[]) {
    assert.ok(PHRASES[key], key);
    assert.ok(FR[key] && MLS_FR[key], `fr ${key}`);
    assert.ok(JA[key] && MLS_JA[key], `ja ${key}`);
    assert.deepEqual(placeholdersIn(MLS_FR[key]), placeholdersIn(MLS_EN[key]), `fr placeholders of ${key}`);
    assert.deepEqual(placeholdersIn(MLS_JA[key]), placeholdersIn(MLS_EN[key]), `ja placeholders of ${key}`);
  }
});

test("every stage the data can name has a phrase", () => {
  for (const key of ["regular", "wild_card", "round_one", "conference_semi", "conference_final", "final"]) {
    assert.ok(MLS_STAGE_PHRASE[key], key);
    assert.ok(MLS_STAGE_PHRASE[key] in PHRASES, key);
  }
});

test("addresses", () => {
  assert.equal(mlsSeasonPath(2019), "/mls/2019");
  assert.equal(mlsClubPath("la-galaxy"), "/mls/team/la-galaxy");
  assert.equal(mlsMatchPath(2019, 512, "Seattle Sounders FC", "Toronto FC"), "/mls/2019/match/512-seattle-sounders-fc-toronto-fc");
});

test("how far a club went", () => {
  const s = (k: keyof typeof PHRASES) => say(k);
  assert.equal(mlsReached(s, "champion"), "MLS Cup champion");
  assert.equal(mlsReached(s, "missed"), "Missed the playoffs");
  assert.equal(mlsReached(s, null), "");
  assert.ok(mlsReachRank("champion") > mlsReachRank("final"));
  assert.ok(mlsReachRank("final") > mlsReachRank("conference_semi"));
  assert.ok(mlsReachRank("conference_semi") > mlsReachRank("missed"));
});

const base = { home_team_id: "C-a", away_team_id: "C-b", home: "A", away: "B", home_goals: 1, away_goals: 1, extra_time: false, shootout: false, home_penalties: null, away_penalties: null, shootout_style: null, winner_team_id: null };

test("a score shows extra time, penalties and the 1996-1999 shootout under it", () => {
  const s = (k: keyof typeof PHRASES, v?: Record<string, string | number>) => say(k, v);
  assert.deepEqual(mlsScoreLines(s, { ...base }), { main: "1–1", note: null });
  assert.deepEqual(mlsScoreLines(s, { ...base, extra_time: true }), { main: "1–1", note: "after extra time" });
  assert.deepEqual(mlsScoreLines(s, { ...base, extra_time: true, shootout: true, home_penalties: 4, away_penalties: 3, winner_team_id: "C-a" }), { main: "1–1", note: "4–3 on penalties" });
  assert.deepEqual(mlsScoreLines(s, { ...base, shootout_style: "mls", winner_team_id: "C-b" }), { main: "1–1", note: "B won the shootout" });
});

let id = 0;
const m = (stage_key: string, stage_order: number, date: string, home: string, away: string, hg: number, ag: number, extra: Partial<TieMatch> = {}): TieMatch => ({
  match_id: ++id, year: 2000, stage_key, stage_order, match_date: date, home_team_id: `C-${home}`, away_team_id: `C-${away}`, home, away, home_slug: home, away_slug: away,
  home_goals: hg, away_goals: ag, extra_time: false, shootout: false, home_penalties: null, away_penalties: null,
  winner_team_id: hg > ag ? `C-${home}` : hg < ag ? `C-${away}` : null, ...extra,
});

test("playoff ties: two legs on aggregate, a best of three by games won, the winner is who plays on", () => {
  const ms = [
    m("regular", 1, "2000-08-01", "x", "y", 1, 0),
    m("conference_semi", 4, "2000-09-14", "a", "b", 1, 0), m("conference_semi", 4, "2000-09-20", "b", "a", 2, 5),     // a beats b 6-2
    m("conference_semi", 4, "2000-09-15", "c", "d", 1, 0), m("conference_semi", 4, "2000-09-19", "d", "c", 2, 1), m("conference_semi", 4, "2000-09-22", "c", "d", 3, 0), // c wins 2 games to 1
    m("conference_final", 5, "2000-10-01", "a", "c", 2, 1),
    m("final", 6, "2000-10-15", "a", "e", 1, 0),
  ];
  const ties = playoffTies(ms, "C-a");
  assert.equal(ties.length, 4);
  assert.deepEqual(ties.map((t) => t.stage_key), ["conference_semi", "conference_semi", "conference_final", "final"]);
  const ab = ties[0];
  assert.deepEqual([ab.a.id, ab.b.id, ab.aFigure, ab.bFigure, ab.games, ab.winner], ["C-a", "C-b", 6, 2, "1–0 · 5–2", "C-a"]);
  const cd = ties[1];
  assert.deepEqual([cd.aFigure, cd.bFigure, cd.games, cd.winner], [2, 1, "1–0 · 1–2 · 3–0", "C-c"]);
  assert.equal(ties[3].winner, "C-a");
  assert.equal(playoffTies(ms.slice(0, 2), null)[0].winner, null, "a round nobody has left yet has no winner");
});

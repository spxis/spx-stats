import assert from "node:assert/strict";
import { test } from "node:test";
import { playersTitle, teamsTitle } from "../src/lib/listTitle.ts";
import { PHRASES } from "../src/lib/i18n/phrases.constants.ts";
import { FR } from "../src/lib/i18n/dictionaries/fr.constants.ts";
import { JA } from "../src/lib/i18n/dictionaries/ja.constants.ts";

/** Run in web/: pnpm test:listtitle. The heading and tab title of /players and /teams name the filters that narrow the list, in every language. */

/** The site's say(): the language's phrase (English where it has none) with its {placeholders} filled. */
const sayIn = (dictionary: Partial<Record<string, string>>) => (key: keyof typeof PHRASES, vars: Record<string, string> = {}) =>
  (dictionary[key] ?? PHRASES[key]).replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
const en = sayIn(PHRASES), fr = sayIn(FR), ja = sayIn(JA);

test("players: no filter, a league, a country, a league and a country", () => {
  assert.equal(playersTitle(en, {}), "Players");
  assert.equal(playersTitle(en, { league: "NHL" }), "NHL players");
  assert.equal(playersTitle(en, { country: "Norway" }), "Players from Norway");
  assert.equal(playersTitle(en, { league: "NHL", country: "Russia" }), "NHL players from Russia");
});

test("players: a team implies its league, so the league is not named twice", () => {
  assert.equal(playersTitle(en, { league: "NBA", team: "Houston Rockets" }), "Houston Rockets players");
  assert.equal(playersTitle(en, { league: "NBA", team: "Houston Rockets", country: "China" }), "Houston Rockets players from China");
});

test("players: empty and null choices count as none", () => {
  assert.equal(playersTitle(en, { league: "", team: null, country: undefined }), "Players");
  assert.equal(playersTitle(en, { league: null, team: "", country: "" }), "Players");
});

test("teams: league, conference or division, status, in the order a reader narrows them", () => {
  assert.equal(teamsTitle(en, {}), "Teams");
  assert.equal(teamsTitle(en, { league: "NHL" }), "NHL teams");
  assert.equal(teamsTitle(en, { league: "NHL", place: "Eastern Conference" }), "NHL teams · Eastern Conference");
  assert.equal(teamsTitle(en, { league: "NHL", status: "active" }), "NHL teams · Active");
  assert.equal(teamsTitle(en, { league: "NHL", place: "Atlantic Division", status: "defunct" }), "NHL teams · Atlantic Division · Defunct");
  assert.equal(teamsTitle(en, { status: "all" }), "Teams", "all teams is no filter");
  assert.equal(teamsTitle(en, { place: null, status: "bogus" }), "Teams");
});

test("French and Japanese say the same choices in their own words, with no placeholder left over", () => {
  assert.equal(playersTitle(fr, {}), "Joueurs");
  assert.equal(playersTitle(fr, { league: "NHL", country: "Russie" }), "Joueurs de la NHL · Russie");
  assert.equal(playersTitle(fr, { league: "NBA", team: "Houston Rockets", country: "Chine" }), "Joueurs · Houston Rockets · Chine");
  assert.equal(teamsTitle(fr, { league: "NHL", status: "active" }), "Équipes de la NHL · Actives");
  assert.equal(playersTitle(ja, {}), "選手");
  assert.equal(playersTitle(ja, { league: "NHL", country: "ロシア" }), "NHLのロシア出身選手");
  assert.equal(playersTitle(ja, { league: "NBA", team: "Houston Rockets" }), "Houston Rocketsの選手");
  assert.equal(playersTitle(ja, { country: "ノルウェー" }), "ノルウェー出身の選手");
  assert.equal(teamsTitle(ja, { league: "NHL", status: "defunct" }), "NHLのチーム · 消滅");
  for (const say of [en, fr, ja]) {
    for (const t of [playersTitle(say, { league: "NHL", team: "T", country: "C" }), playersTitle(say, { team: "T" }), teamsTitle(say, { league: "NHL", place: "P", status: "active" })]) {
      assert.ok(!/[{}]/.test(t), t);
    }
  }
});

test("every title phrase is in all three languages with the same placeholders", () => {
  const keys = ["players.title", "players.titleLeague", "players.titleTeam", "players.titleCountry", "players.titleLeagueCountry", "players.titleTeamCountry", "teams.title", "teams.titleLeague", "teams.statusActive", "teams.statusDefunct"] as const;
  const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
  for (const k of keys) {
    assert.ok(FR[k], `fr ${k}`);
    assert.ok(JA[k], `ja ${k}`);
    assert.equal(holes(FR[k]!), holes(PHRASES[k]), `fr ${k}`);
    assert.equal(holes(JA[k]!), holes(PHRASES[k]), `ja ${k}`);
  }
});

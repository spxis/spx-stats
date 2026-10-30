import assert from "node:assert/strict";
import { test } from "node:test";
import { listLabel, listTitle, playersFilters, teamsFilters } from "../src/lib/listTitle.ts";
import { PHRASES } from "../src/lib/i18n/phrases.constants.ts";
import { FR } from "../src/lib/i18n/dictionaries/fr.constants.ts";
import { JA } from "../src/lib/i18n/dictionaries/ja.constants.ts";

/** Run in web/: pnpm test:listtitle. /players and /teams keep their page word as the heading and name the filters after it, in every language. */

/** The site's say(): the language's phrase (English where it has none) with its {placeholders} filled. */
const sayIn = (dictionary: Partial<Record<string, string>>) => (key: keyof typeof PHRASES, vars: Record<string, string> = {}) =>
  (dictionary[key] ?? PHRASES[key]).replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
const en = sayIn(PHRASES), fr = sayIn(FR), ja = sayIn(JA);

test("players: the page word never changes; the filters follow it", () => {
  assert.deepEqual(playersFilters(en, {}), []);
  assert.deepEqual(playersFilters(en, { league: "NHL" }), ["NHL"]);
  assert.deepEqual(playersFilters(en, { country: "Norway" }), ["from Norway"]);
  assert.deepEqual(playersFilters(en, { league: "NHL", country: "Russia" }), ["NHL", "from Russia"]);
  assert.equal(listTitle(en("players.title"), playersFilters(en, { league: "NHL", country: "Russia" })), "Players · NHL · from Russia");
  assert.equal(listTitle(en("players.title"), []), "Players");
});

test("players: a team implies its league, so the league is not named twice", () => {
  assert.deepEqual(playersFilters(en, { league: "NBA", team: "Houston Rockets" }), ["Houston Rockets"]);
  assert.equal(listTitle("Players", playersFilters(en, { league: "NBA", team: "Houston Rockets", country: "China" })), "Players · Houston Rockets · from China");
});

test("players: empty and null choices count as none", () => {
  assert.deepEqual(playersFilters(en, { league: "", team: null, country: undefined }), []);
  assert.deepEqual(playersFilters(en, { league: null, team: "", country: "" }), []);
});

test("teams: league, conference or division, status, in the order a reader narrows them", () => {
  assert.deepEqual(teamsFilters(en, {}), []);
  assert.deepEqual(teamsFilters(en, { league: "NHL" }), ["NHL"]);
  assert.deepEqual(teamsFilters(en, { league: "NHL", place: "Eastern Conference" }), ["NHL", "Eastern Conference"]);
  assert.deepEqual(teamsFilters(en, { league: "NHL", status: "active" }), ["NHL", "Active"]);
  assert.equal(listTitle("Teams", teamsFilters(en, { league: "NHL", place: "Atlantic Division", status: "defunct" })), "Teams · NHL · Atlantic Division · Defunct");
  assert.deepEqual(teamsFilters(en, { status: "all" }), [], "all teams is no filter");
  assert.deepEqual(teamsFilters(en, { place: null, status: "bogus" }), []);
});

test("a screen reader hears one sentence, and the bare word when nothing is filtered", () => {
  assert.equal(listLabel(en, "Players", ["NHL", "from Russia"]), "Players, filtered: NHL, from Russia");
  assert.equal(listLabel(en, "Teams", []), "Teams");
  assert.equal(listLabel(fr, "Joueurs", ["NHL", "Pays : Russie"]), "Joueurs, filtres : NHL, Pays : Russie");
  assert.equal(listLabel(ja, "選手", ["NHL", "ロシア出身"]), "選手、絞り込み：NHL, ロシア出身");
});

test("French and Japanese say the same choices in their own words, with no placeholder left over", () => {
  assert.deepEqual(playersFilters(fr, { league: "NHL", country: "Russie" }), ["NHL", "Pays : Russie"]);
  assert.deepEqual(teamsFilters(fr, { league: "NHL", status: "active" }), ["NHL", "Actives"]);
  assert.deepEqual(playersFilters(ja, { league: "NHL", country: "ロシア" }), ["NHL", "ロシア出身"]);
  assert.deepEqual(teamsFilters(ja, { league: "NHL", status: "defunct" }), ["NHL", "消滅"]);
  for (const say of [en, fr, ja]) {
    const all = [...playersFilters(say, { league: "NHL", team: "T", country: "C" }), ...teamsFilters(say, { league: "NHL", place: "P", status: "active" }), listLabel(say, "H", ["a", "b"])];
    for (const t of all) assert.ok(!/[{}]/.test(t), t);
  }
});

test("every phrase the title uses is in all three languages with the same placeholders", () => {
  const keys = ["players.title", "teams.title", "players.fromCountry", "list.filtered", "teams.statusActive", "teams.statusDefunct"] as const;
  const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
  for (const k of keys) {
    assert.ok(FR[k], `fr ${k}`);
    assert.ok(JA[k], `ja ${k}`);
    assert.equal(holes(FR[k]!), holes(PHRASES[k]), `fr ${k}`);
    assert.equal(holes(JA[k]!), holes(PHRASES[k]), `ja ${k}`);
  }
});

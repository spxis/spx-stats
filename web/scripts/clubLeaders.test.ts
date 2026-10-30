import assert from "node:assert/strict";
import { test } from "node:test";
import { PHRASES } from "../src/lib/i18n/phrases.constants.ts";
import { articleOf, articleUrl, figureValue, LEADER_COLUMNS, leaderRowSchema, leaderTables } from "../src/lib/clubLeaderRows.ts";

const row = (category: string, ord: number, name: string, person_id: number | null, stats: Record<string, string | null>) =>
  ({ team_season_id: 7, category, ord, name, person_id, stats, source_key: "enwiki:2010 Calgary Stampeders season@1355620283" });

test("the rows of a club season become tables in a fixed order, each in the article's order", () => {
  const rows = [
    row("receiving", 1, "Romby Bryant", null, { rec: "78", yds: "1170", td: "15", long: "68" }),
    row("rushing", 0, "Joffrey Reynolds", 4, { att: "217", yds: "1200", avg: "5.5", td: "8", fum: "1", long: null }),
    row("passing", 0, "Henry Burris", 3, { att: "559", comp: "370", pct: "66.2", yds: "4945", td: "38", int: "20", rating: "101.9" }),
    row("receiving", 0, "Nik Lewis", 9, { rec: "90", yds: "1262", td: "9", long: "74" }),
  ].map((r) => leaderRowSchema.parse(r));
  const data = leaderTables(rows);
  assert.deepEqual(data.tables.map((t) => t.category), ["passing", "rushing", "receiving"]);
  assert.deepEqual(data.tables[2].lines.map((l) => l.name), ["Nik Lewis", "Romby Bryant"]);
  assert.deepEqual(data.tables[2].lines.map((l) => l.id), [9, null]);
});

test("a table shows only the figures some line has, in the column order of its kind", () => {
  const t = leaderTables([leaderRowSchema.parse(row("rushing", 0, "A", null, { yds: "10", att: "3", long: null, fum: null }))]).tables[0];
  assert.deepEqual(t.keys, ["att", "yds"]);
});

test("a figure sorts by the number it starts with", () => {
  assert.equal(figureValue("4945"), 4945);
  assert.equal(figureValue("66.2"), 66.2);
  assert.equal(figureValue("100T"), 100);
  assert.equal(figureValue(null), null);
  assert.equal(figureValue("N/A"), null);
});

test("the article is named by the source key", () => {
  assert.deepEqual(articleOf("enwiki:2010 Calgary Stampeders season@1355620283"), { title: "2010 Calgary Stampeders season", revid: 1355620283 });
  assert.equal(articleOf("something else"), null);
  assert.equal(articleUrl("2010 Calgary Stampeders season"), "https://en.wikipedia.org/wiki/2010_Calgary_Stampeders_season");
  assert.equal(articleUrl("1995 Birmingham Barracudas season"), "https://en.wikipedia.org/wiki/1995_Birmingham_Barracudas_season");
});

test("no data: no tables and no article", () => {
  assert.deepEqual(leaderTables([]), { tables: [], article: null });
});

test("every column names phrases that exist", () => {
  for (const cols of Object.values(LEADER_COLUMNS)) for (const c of cols) { assert.ok(c.label in PHRASES, c.label); assert.ok(c.title in PHRASES, c.title); }
  for (const k of ["title", "passing", "rushing", "receiving", "offence", "offenceNote", "note", "article"]) assert.ok(`cflLeaders.${k}` in PHRASES, k);
});

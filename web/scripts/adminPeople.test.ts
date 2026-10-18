import assert from "node:assert/strict";
import { test } from "node:test";
import {
  afterSql,
  parsePeopleSearch,
  peopleCountQuery,
  peopleOrder,
  peopleQuery,
  peopleWhere,
  readCountry,
  readSeasons,
  readSource,
  readSport,
  readYear,
  searchWords,
  yearWhere,
} from "../src/lib/adminPeopleQuery.ts";
import { cursorOf } from "../src/lib/listQuery.ts";

const NAME_ASC = peopleOrder([{ key: "name", dir: "asc" }]);

test("a name is folded and split the same way as the players list", () => {
  assert.deepEqual(searchWords("Usain Bolt"), ["usain", "bolt"]);
  assert.deepEqual(searchWords("José"), ["jose"]);
});

test("sport, source and country are allow-listed codes", () => {
  assert.equal(readSport("athletics"), "athletics");
  assert.equal(readSport("ice_hockey"), "ice_hockey");
  assert.equal(readSport("Hockey"), "hockey");
  assert.equal(readSport("athletics;drop"), undefined);
  assert.equal(readSource("wikidata_meigen"), "wikidata_meigen");
  assert.equal(readSource("Wikidata"), "wikidata");
  assert.equal(readSource("wiki data"), undefined);
  assert.equal(readCountry("jm"), "JM");
  assert.equal(readCountry("JAM"), undefined);
  assert.equal(readYear("1986"), 1986);
  assert.equal(readYear("12"), undefined);
  assert.equal(readSeasons("no"), "no");
});

test("an empty form lists from the start", () => {
  const idle = parsePeopleSearch({});
  assert.equal(idle.page, 1);
  assert.deepEqual(idle.words, []);
  assert.deepEqual(peopleWhere(idle), { sql: "", args: [] });
  const q = peopleQuery(idle, NAME_ASC, 100);
  assert.ok(q.sql.startsWith("select person_id, name,"));
  assert.ok(q.sql.includes("from api_person_admin order by name asc, person_id asc limit 100 offset 0"));
  assert.deepEqual(q.args, []);
});

test("swapped birth years are put in order", () => {
  const f = parsePeopleSearch({ from: "1990", to: "1980" });
  assert.equal(f.from, 1980);
  assert.equal(f.to, 1990);
});

test("nat and letter match the players list keys", () => {
  const f = parsePeopleSearch({ nat: "jm", letter: "B", letter_by: "first" });
  assert.equal(f.country, "JM");
  assert.equal(f.letter, "b");
  assert.equal(f.letterBy, "first");
  assert.deepEqual(peopleWhere(f), { sql: " where country = ? and letter_first = ?", args: ["JM", "b"] });
  assert.deepEqual(peopleWhere(parsePeopleSearch({ letter: "B" })), { sql: " where letter_last = ?", args: ["b"] });
});

test("a year range uses club seasons, else birth year, and keeps people with no year unless only dated ones are asked for", () => {
  const all = yearWhere(parsePeopleSearch({ from: "1953", to: "2007" }));
  assert.equal(all?.sql, "((first_season <= ? and last_season >= ?) or (first_season is null and birth_year >= ? and birth_year <= ?) or (first_season is null and birth_year is null))");
  assert.deepEqual(all?.args, [2007, 1953, 1953, 2007]);
  const dated = yearWhere(parsePeopleSearch({ from: "1953", to: "2007", dated: "yes" }));
  assert.ok(!dated?.sql.includes("birth_year is null"));
  assert.equal(yearWhere(parsePeopleSearch({})), null);
  assert.equal(yearWhere(parsePeopleSearch({ dated: "yes" }))?.sql, "(first_season is not null or birth_year is not null)");
});

test("a name search reads the folded name, one like per word, accents ignored", () => {
  assert.deepEqual(peopleWhere(parsePeopleSearch({ q: "Terry Fox" })), { sql: " where search like ? and search like ?", args: ["%terry%", "%fox%"] });
  assert.deepEqual(peopleWhere(parsePeopleSearch({ q: "Steve Fonyó" })).args, ["%steve%", "%fonyo%"]);
});

test("a first-name letter page filters on letter_first and orders by name with the person id as the tie-break", () => {
  const f = parsePeopleSearch({ letter: "T", letter_by: "first", page: "8" });
  assert.equal(f.page, 8);
  const q = peopleQuery(f, NAME_ASC, 100, 700);
  assert.ok(q.sql.includes("where letter_first = ? order by name asc, person_id asc limit 100 offset 700"));
  assert.ok(!q.sql.includes("letter_last"));
});

test("the query is one statement with allow-listed filters and every value bound", () => {
  const f = parsePeopleSearch({ q: "Bolt'; drop table x; --", sport: "athletics", nat: "jm", from: "1980", to: "1990", seasons: "no", source: "wikidata_meigen" });
  const q = peopleQuery(f, NAME_ASC, 100);
  assert.equal(q.sql.includes("drop"), false);
  assert.equal(q.sql.includes("'"), false);
  assert.equal(q.sql.includes(";"), false);
  assert.ok(q.sql.includes("exists (select 1 from json_each(sports) where value = ?)"));
  assert.ok(q.sql.includes("exists (select 1 from json_each(sources) where value = ?)"));
  assert.ok(q.sql.includes("has_seasons = 0"));
  assert.ok(q.args.includes("athletics") && q.args.includes("wikidata_meigen") && q.args.includes("JM"));
  const c = peopleCountQuery(f);
  assert.ok(c.sql.startsWith("select count(*) as n from api_person_admin where"));
  assert.equal(c.args.length, q.args.length);
});

test("a keyset cursor continues after the last row, with empty values last", () => {
  const after = afterSql(NAME_ASC, ["Bolt", 1]);
  assert.equal(after.sql, "((name > ?) or (name = ? and person_id > ?))");
  assert.deepEqual(after.args, ["Bolt", "Bolt", 1]);
  const born = afterSql(peopleOrder([{ key: "born", dir: "desc" }]), [1986, "Bolt", 1]);
  assert.ok(born.sql.startsWith("((birth_year < ?) or (birth_year is null) or (birth_year = ? and name > ?)"));
  const q = peopleQuery(parsePeopleSearch({ q: "bolt" }), NAME_ASC, 101, 0, ["Bolt", 1]);
  assert.ok(q.sql.includes("where search like ? and ((name > ?)"));
  const cursor = cursorOf("name.asc", ["Bolt", 1]);
  assert.equal(parsePeopleSearch({ after: cursor }).after, cursor);
});

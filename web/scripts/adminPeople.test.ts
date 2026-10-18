import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parsePeopleSearch,
  peopleAdminFilters,
  peopleAdminQuery,
  peopleFallbackQuery,
  peopleOrder,
  readCountry,
  readSeasons,
  readSource,
  readSport,
  readYear,
  searchWords,
  yearFilter,
} from "../src/lib/adminPeopleQuery.ts";
import { cursorOf } from "../src/lib/listQuery.ts";

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
  assert.equal(peopleAdminFilters(idle).length, 0);
  const q = peopleAdminQuery(idle);
  assert.ok(q.includes("select=person_id,name"));
  assert.ok(q.includes("order=name.asc,person_id.asc"));
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
  const filters = peopleAdminFilters(f);
  assert.ok(filters.includes("country=eq.JM"));
  assert.ok(filters.includes("letter_first=eq.b"));
  const last = peopleAdminFilters(parsePeopleSearch({ letter: "B" }));
  assert.ok(last.includes("letter_last=eq.b"));
});

test("a year range uses club seasons, else birth year, and keeps people with no year unless only dated ones are asked for", () => {
  const all = yearFilter(parsePeopleSearch({ from: "1953", to: "2007" }));
  assert.equal(all, "and=(or(and(first_season.lte.2007,last_season.gte.1953),and(first_season.is.null,birth_year.gte.1953,birth_year.lte.2007),and(first_season.is.null,birth_year.is.null)))");
  const dated = yearFilter(parsePeopleSearch({ from: "1953", to: "2007", dated: "yes" }));
  assert.ok(!dated.includes("birth_year.is.null"));
  assert.equal(yearFilter(parsePeopleSearch({})), "");
  assert.equal(yearFilter(parsePeopleSearch({ dated: "yes" })), "and=(or(first_season.not.is.null,birth_year.not.is.null))");
  const q = peopleAdminQuery(parsePeopleSearch({ from: "1953", to: "2007" }), peopleOrder([{ key: "name", dir: "asc" }]), ["Al", 5]);
  assert.equal(q.split("&").filter((x) => x.startsWith("or=")).length, 1, "the cursor keeps its own or=");
});

test("a first-name letter page filters on letter_first and orders by name with the person id as the tie-break", () => {
  const f = parsePeopleSearch({ letter: "T", letter_by: "first", page: "8" });
  assert.equal(f.page, 8);
  const q = peopleAdminQuery(f);
  assert.ok(q.startsWith("letter_first=eq.t&select="));
  assert.ok(q.endsWith("order=name.asc,person_id.asc"));
  assert.ok(!q.includes("letter_last"));
});

test("the admin view query is one request with allow-listed filters", () => {
  const f = parsePeopleSearch({ q: "Bolt", sport: "athletics", nat: "jm", from: "1980", to: "1990", seasons: "no", source: "wikidata_meigen" });
  const filters = peopleAdminFilters(f);
  assert.equal(filters.filter((x) => x.startsWith("search=")).length, 1);
  assert.ok(filters.some((x) => x.startsWith("sports=cs.")));
  assert.ok(filters.includes("country=eq.JM"));
  assert.ok(filters.some((x) => x.startsWith("and=(or(and(first_season.lte.1990,last_season.gte.1980)")));
  assert.ok(filters.includes("has_seasons=eq.false"));
  assert.ok(filters.some((x) => x.startsWith("sources=cs.")));
  const q = peopleAdminQuery(f);
  assert.ok(q.includes("select=person_id,name"));
  assert.ok(q.includes("order=name.asc,person_id.asc"));
  assert.equal(q.includes(";"), false);
});

test("a keyset cursor is an or= filter on the sort fields", () => {
  const order = peopleOrder([{ key: "name", dir: "asc" }]);
  const q = peopleAdminQuery(parsePeopleSearch({}), order, ["Bolt", 1]);
  assert.ok(q.includes("or="));
  assert.ok(q.includes("name.gt."));
  const cursor = cursorOf("name.asc", ["Bolt", 1]);
  const f = parsePeopleSearch({ after: cursor });
  assert.equal(f.after, cursor);
});

test("the people fallback cannot filter by sport or source", () => {
  const f = parsePeopleSearch({ q: "Bolt", seasons: "no", nat: "JM" });
  const q = peopleFallbackQuery(f);
  assert.ok(q.includes("name=ilike."));
  assert.ok(q.includes("seasons_played=eq.0"));
  assert.equal(q.includes("sport"), false);
  assert.equal(q.includes("qid"), false);
});

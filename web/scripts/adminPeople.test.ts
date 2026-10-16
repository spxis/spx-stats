import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasPeopleFilter,
  parsePeopleSearch,
  peopleAdminFilters,
  peopleAdminQuery,
  peopleFallbackQuery,
  readCountry,
  readSeasons,
  readSource,
  readSport,
  readYear,
  searchWords,
} from "../src/lib/adminPeopleQuery.ts";

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
  assert.equal(readSeasons("maybe"), undefined);
});

test("an empty form does not search", () => {
  const idle = parsePeopleSearch({});
  assert.equal(hasPeopleFilter(idle), false);
  assert.equal(idle.page, 1);
});

test("swapped birth years are put in order", () => {
  const f = parsePeopleSearch({ born_from: "1990", born_to: "1980" });
  assert.equal(f.bornFrom, 1980);
  assert.equal(f.bornTo, 1990);
});

test("the admin view query is one request with allow-listed filters", () => {
  const f = parsePeopleSearch({ q: "Bolt", sport: "athletics", country: "jm", born_from: "1980", born_to: "1990", seasons: "no", source: "wikidata_meigen" });
  assert.equal(hasPeopleFilter(f), true);
  const filters = peopleAdminFilters(f);
  assert.equal(filters.filter((x) => x.startsWith("search=")).length, 1);
  assert.ok(filters.includes("sports=cs.%7Bathletics%7D") || filters.some((x) => x.startsWith("sports=cs.")));
  assert.ok(filters.includes("country=eq.JM"));
  assert.ok(filters.includes("birth_year=gte.1980"));
  assert.ok(filters.includes("birth_year=lte.1990"));
  assert.ok(filters.includes("has_seasons=eq.false"));
  assert.ok(filters.some((x) => x.startsWith("sources=cs.")));
  const q = peopleAdminQuery(f);
  assert.ok(q.includes("select=person_id,name"));
  assert.ok(q.includes("order=name.asc,person_id.asc"));
  assert.equal(q.includes(";"), false);
});

test("the people fallback cannot filter by sport or source", () => {
  const f = parsePeopleSearch({ q: "Bolt", seasons: "no", country: "JM" });
  const q = peopleFallbackQuery(f);
  assert.ok(q.includes("name=ilike."));
  assert.ok(q.includes("seasons_played=eq.0"));
  assert.equal(q.includes("sport"), false);
  assert.equal(q.includes("qid"), false);
});

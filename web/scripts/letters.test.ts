import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { letterFilter, letterFilterPlain, NAME_SUFFIXES, readLetter } from "../src/lib/listQuery.ts";
import { fold } from "../src/lib/fold.ts";
import { QUERY_KEYS } from "../src/lib/routing.ts";

/** Run in web/: pnpm test:letters. The A to Z row of /players: which letter a caller means, the filter it becomes, and that the database function counts the same way. */

const lib = (name: string) => readFileSync(new URL(`../src/lib/${name}`, import.meta.url), "utf8");

test("a letter is one letter a to z, accents and capitals ignored; anything else is none", () => {
  assert.equal(readLetter("g"), "g");
  assert.equal(readLetter("G"), "g");
  assert.equal(readLetter(" É "), "e");
  assert.equal(readLetter("Ø"), "o");
  for (const bad of ["", "  ", "gg", "1", "-", "ß", "g|h", ".*", "(", "あ", undefined, null]) assert.equal(readLetter(bad), null, String(bad));
});

/** What PostgREST sends the database: the pattern of a `search=match.` filter, decoded. The database reads POSIX (Advanced) regular expressions; the lookahead and the groups mean the same in JavaScript. */
function lastPattern(letter: string): RegExp {
  const f = letterFilter(letter, "last");
  assert.ok(f.startsWith("search=match."));
  return new RegExp(decodeURIComponent(f.slice("search=match.".length)));
}
const keeps = (letter: string, names: string[]) => names.filter((n) => lastPattern(letter).test(fold(n)));

test("the last-name filter keeps names whose last word starts with the letter, and sets a trailing Jr, Sr, II, III or IV aside", () => {
  const names = ["Wayne Gretzky", "Ken Griffey Jr.", "Éric Lindros", "Martin Luther King III", "Ivan Iverson", "Jerome Bettis Sr", "Jake Allen", "Pelé", "Gordie Howe", "George Armstrong"];
  assert.deepEqual(keeps("g", names), ["Wayne Gretzky", "Ken Griffey Jr."]);
  assert.deepEqual(keeps("k", names), ["Martin Luther King III"]);
  assert.deepEqual(keeps("l", names), ["Éric Lindros"]);
  assert.deepEqual(keeps("i", names), ["Ivan Iverson"]);
  assert.deepEqual(keeps("b", names), ["Jerome Bettis Sr"]);
  assert.deepEqual(keeps("p", names), ["Pelé"]);
  assert.deepEqual(keeps("a", names), ["Jake Allen", "George Armstrong"]);
  // the suffix is never the name: Jr, Sr, III and IV file under the word before them
  assert.deepEqual(keeps("j", ["Ken Griffey Jr.", "Jr", "Jerome Bettis Sr", "Bob Jones"]), ["Bob Jones"]);
  assert.deepEqual(keeps("s", ["Jerome Bettis Sr", "Sr", "Ann Smith"]), ["Ann Smith"]);
  assert.deepEqual(keeps("i", ["Louis XIV", "Ivan II", "Ivan Iverson"]), ["Ivan II", "Ivan Iverson"]);
  assert.deepEqual(keeps("x", ["Louis XIV"]), ["Louis XIV"], "XIV is not one of the suffixes set aside");
  // a first name does not count in the last-name filter
  assert.deepEqual(keeps("w", ["Wayne Gretzky", "Ted Williams"]), ["Ted Williams"]);
});

test("the first-name filter is a prefix match on the folded name", () => {
  assert.equal(letterFilter("G", "first"), "search=like.g*");
  assert.equal(letterFilter("É", "first"), "search=like.e*");
});

test("only a checked letter reaches a pattern", () => {
  for (const bad of ["", "ab", "1", ".", "a|b", "(", "[a-z]"]) {
    assert.throws(() => letterFilter(bad), /not a letter/, bad);
    assert.throws(() => letterFilter(bad, "first"), /not a letter/, bad);
    assert.throws(() => letterFilterPlain(bad), /not a letter/, bad);
  }
});

test("without api.player_search the plain name is matched, case-insensitively, with the same meaning", () => {
  const f = letterFilterPlain("g");
  assert.ok(f.startsWith("name=imatch."));
  const re = new RegExp(decodeURIComponent(f.slice("name=imatch.".length)), "i");
  assert.deepEqual(["Wayne Gretzky", "Ken Griffey Jr.", "Jr.", "Gordie Howe"].filter((n) => re.test(n)), ["Wayne Gretzky", "Ken Griffey Jr."]);
  const jr = new RegExp(decodeURIComponent(letterFilterPlain("j").slice("name=imatch.".length)), "i");
  assert.deepEqual(["Ken Griffey Jr.", "Jr.", "Bob Jones"].filter((n) => jr.test(n)), ["Bob Jones"]);
});

test("the database function counts with the same suffixes as the filter", () => {
  const sql = readFileSync(new URL("../../db/migrations/091_player_letters.sql", import.meta.url), "utf8");
  assert.ok(sql.includes(`( (${NAME_SUFFIXES.join("|")}))+$`), "the suffix chain stripped before the last word is taken");
  assert.ok(sql.includes(`'^(${NAME_SUFFIXES.join("|")})( (${NAME_SUFFIXES.join("|")}))*$'`), "a name that is only a suffix has no letter");
  assert.match(sql, /create or replace function api\.player_letters\(/);
  assert.doesNotMatch(sql, /drop |alter |truncate |delete /i, "add-only");
});

test("the letter is wired through the page, the API and the address keys", () => {
  assert.ok((QUERY_KEYS as readonly string[]).includes("letter") && (QUERY_KEYS as readonly string[]).includes("letter_by"));
  const params = lib("listParams.ts");
  assert.match(params, /letter: z\.preprocess\(blank, z\.string\(\)\.max\(4\)\.refine\(\(v\) => readLetter\(v\) !== null, "one letter, A to Z/);
  assert.match(params, /letter_by: z\.preprocess\(blank, z\.enum\(\["last", "first"\]\)/);
  assert.match(lib("listApi.ts"), /letter: v\.letter, letterBy: v\.letter_by/);
  const index = lib("playerIndex.ts");
  assert.match(index, /letterFilter\(letter, f\.letterBy\)/);
  assert.match(index, /rows\("rpc\/player_letters"/);
  assert.match(readFileSync(new URL("../src/app/api/players/route.ts", import.meta.url), "utf8"), /letter=<a letter/);
});

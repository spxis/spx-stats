import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PHRASES } from "../src/lib/i18n/phrases.constants.ts";
import { FR } from "../src/lib/i18n/dictionaries/fr.constants.ts";
import { JA } from "../src/lib/i18n/dictionaries/ja.constants.ts";
import { READBACK, TODO_KEYS } from "./i18n-review.constants.ts";
import { SAME_AS_ENGLISH, SHEET_FILE, placeholders, scopedKeys, sheet } from "./i18n-sheet.ts";

/** Run in web/: pnpm test:i18n */
const english = PHRASES as Readonly<Record<string, string>>;
const dictionaries: Record<string, Readonly<Record<string, string | undefined>>> = { French: FR, Japanese: JA };
const { found, unreadable } = scopedKeys();
const keys = found.map((f) => f.key);

test("every say() call in the About, Terms, Privacy and footer files names its phrase as a literal", () => {
  assert.deepEqual(unreadable, []);
  assert.ok(keys.length > 60, `only ${keys.length} keys found; did the files move?`);
});

test("every key those files use is in the English source", () => {
  assert.deepEqual(keys.filter((k) => !(k in english)), []);
});

for (const [name, dictionary] of Object.entries(dictionaries)) {
  test(`${name} has every key the About, Terms, Privacy and footer files use`, () => {
    assert.deepEqual(keys.filter((k) => !dictionary[k]), []);
  });

  test(`${name} keeps the same {placeholders} as English`, () => {
    const bad = keys.filter((k) => dictionary[k] && placeholders(dictionary[k]).join() !== placeholders(english[k] as string).join());
    assert.deepEqual(bad, []);
  });

  test(`${name} is not the English copied across`, () => {
    assert.deepEqual(keys.filter((k) => dictionary[k] === english[k] && !SAME_AS_ENGLISH.has(k)), []);
  });
}

test("every Japanese line on the sheet has a reading, and no reading is left over", () => {
  const listed = new Set([...keys, ...TODO_KEYS]);
  assert.deepEqual([...listed].filter((k) => !READBACK[k]), []);
  assert.deepEqual(Object.keys(READBACK).filter((k) => !listed.has(k)), []);
});

test("every reading keeps the Japanese line's {placeholders}", () => {
  const bad = Object.keys(READBACK).filter((k) => placeholders(READBACK[k] as string).join() !== placeholders(english[k] as string).join());
  assert.deepEqual(bad, []);
});

test("the review sheet on disk is the one the code makes (pnpm i18n:review)", () => {
  assert.equal(readFileSync(new URL(`../${SHEET_FILE}`, import.meta.url), "utf8"), sheet());
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PERSON_REVIEW } from "../src/data/personReview.ts";

/** Run in web/: pnpm test:review. The admin page's list must be exactly db/seed/person_review.csv (regenerate with scripts/people/review_to_ts.py). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const csv = parseCsv(readFileSync(new URL("../../db/seed/person_review.csv", import.meta.url), "utf8"));
const [header, ...body] = csv;
const col = (name: string) => header.indexOf(name);

test("the admin list is the CSV, row for row", () => {
  assert.equal(PERSON_REVIEW.length, body.length);
  body.forEach((r, i) => {
    const p = PERSON_REVIEW[i];
    assert.equal(p.lean, r[col("lean")]);
    assert.equal(p.why, r[col("why_unsure")]);
    assert.equal(p.a.id, Number(r[col("person_id_a")]));
    assert.equal(p.b.id, Number(r[col("person_id_b")]));
    assert.equal(p.a.name, r[col("name_a")]);
    assert.equal(p.b.name, r[col("name_b")]);
    assert.equal(p.a.sources, r[col("sources_a")]);
    assert.equal(p.b.born, r[col("born_b")] || null);
  });
});

test("every pair names two different people and a league for each page link", () => {
  for (const p of PERSON_REVIEW) {
    assert.notEqual(p.a.id, p.b.id);
    assert.match(p.a.league, /^[a-z]{3}$/);
    assert.match(p.b.league, /^[a-z]{3}$/);
  }
});

test("a pair is listed once", () => {
  const keys = PERSON_REVIEW.map((p) => `${p.a.id}-${p.b.id}`);
  assert.equal(new Set(keys).size, keys.length);
});

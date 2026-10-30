import assert from "node:assert/strict";
import { test } from "node:test";
import { csvLines, csvRows } from "../src/lib/api/csv.ts";

/** Run in web/: pnpm test:csv. The reader of PostgREST's text/csv that the season's games come through. */
const K = { id: "n", name: "s", score: "n", ot: "b" } as const;

test("a line is its fields, quoted ones with commas, quotes and line breaks", () => {
  assert.deepEqual(csvLines('a,b\n1,"x, ""y""\nz"\n'), [["a", "b"], ["1", 'x, "y"\nz']]);
  assert.deepEqual(csvLines("a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(csvLines("a,b\n1,"), [["a", "b"], ["1", ""]]);
});

test("rows are typed by the header, in any column order, and an empty field is null", () => {
  const got = csvRows('ot,score,name,id\nt,3,"Washington, D.C.",7\n,,,8\nf,0,Mets,9\n', K);
  assert.deepEqual(got, [
    { id: 7, name: "Washington, D.C.", score: 3, ot: true },
    { id: 8, name: null, score: null, ot: null },
    { id: 9, name: "Mets", score: 0, ot: false },
  ]);
});

test("no text is no rows; a missing column, a short line, a bad number or boolean, an open quote fail", () => {
  assert.deepEqual(csvRows("", K), []);
  assert.deepEqual(csvRows("\n", K), []);
  assert.deepEqual(csvRows("id,name,score,ot\n", K), []);
  assert.throws(() => csvRows("id,name\n1,a\n", K), /no column score/);
  assert.throws(() => csvRows("id,name,score,ot\n1,a\n", K), /wrong number/);
  assert.throws(() => csvRows("id,name,score,ot\nx,a,1,t\n", K), /not a number/);
  assert.throws(() => csvRows("id,name,score,ot\n1,a,1,true\n", K), /not a boolean/);
  assert.throws(() => csvRows('id,name,score,ot\n1,"a,1,t\n', K), /not closed/);
});

test("a number keeps its sign and a string that looks like one stays a string", () => {
  assert.deepEqual(csvRows("id,name,score,ot\n-1,007,2,t\n", K), [{ id: -1, name: "007", score: 2, ot: true }]);
});

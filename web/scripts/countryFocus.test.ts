import assert from "node:assert/strict";
import { test } from "node:test";
import { focusColors, focused, holds, isCountryCode, sliceStates, type FocusSlice } from "../src/lib/countryFocus.ts";
import { fromRows, slicesOf } from "../src/lib/playerCountryModel.ts";

/** Run in web/: pnpm test:countryfocus. The highlight the country sections share: which countries count as focused, what the donut and the map draw for them. */

const base: Record<string, string> = { CA: "rgb(24, 79, 149)", US: "rgb(134, 182, 239)", SE: "rgb(100, 140, 200)" };
const ACCENT = "#c8102e";

test("only a two-capital code names a country: not the unknown, the others or a map's frame", () => {
  for (const ok of ["CA", "US", "SE", "GB"]) assert.ok(isCountryCode(ok), ok);
  for (const bad of ["ZZ", "other", "", null, undefined, "ca", "CAN", "1A"]) assert.ok(!isCountryCode(bad), String(bad));
  assert.deepEqual(focused("SE", "CA"), ["SE", "CA"]);
  assert.deepEqual(focused("SE", "SE"), ["SE"], "the chosen country under the pointer is one");
  assert.deepEqual(focused(null, "ZZ"), []);
});

const slices: FocusSlice[] = [
  { code: "CA" }, { code: "US" }, { code: "other", kind: "other", members: ["SE", "FI"] }, { code: "ZZ", kind: "unknown" },
];

test("a country's slice is emphasised and the rest dimmed; the other slice holds the smaller countries; the unknown one never", () => {
  assert.deepEqual(sliceStates(slices, ["CA"]), ["on", "dim", "dim", "dim"]);
  assert.deepEqual(sliceStates(slices, ["SE"]), ["dim", "dim", "on", "dim"], "a country inside Other marks the Other slice");
  assert.deepEqual(sliceStates(slices, ["CA", "FI"]), ["on", "dim", "on", "dim"], "the choice and the hover can be two slices");
  assert.ok(holds(slices[2], ["FI"]) && !holds(slices[2], ["CA"]));
  assert.ok(!holds(slices[3], ["ZZ"]));
});

test("nothing is dimmed when nothing is focused, or when the focused country is not in the chart", () => {
  assert.deepEqual(sliceStates(slices, []), ["", "", "", ""]);
  assert.deepEqual(sliceStates(slices, ["JP"]), ["", "", "", ""]);
});

test("the donut's other slice lists the countries it holds, from the shaping of the players page", () => {
  const rows = Array.from({ length: 9 }, (_, i) => ({ country: `C${i}`, n: 90 - i }));
  const s = slicesOf(fromRows(rows));
  const other = s.find((x) => x.kind === "other")!;
  assert.deepEqual(other.members, ["C6", "C7", "C8"]);
  assert.deepEqual(sliceStates(s, ["C7"]).map((x) => x), ["dim", "dim", "dim", "dim", "dim", "dim", "on"]);
});

test("the map keeps the count ramp with nothing focused; a choice is the accent and greys the others; the hover is the accent lightened", () => {
  assert.deepEqual(focusColors(base, null, null, ACCENT), base);
  assert.notEqual(focusColors(base, null, null, ACCENT), base, "a copy, not the ramp itself");
  const chosen = focusColors(base, "SE", null, ACCENT);
  assert.equal(chosen.SE, ACCENT);
  for (const c of ["CA", "US"]) assert.notEqual(chosen[c], base[c], `${c} is greyed`);
  assert.deepEqual(Object.keys(chosen).sort(), ["CA", "SE", "US"], "only countries with players are coloured");
  const hover = focusColors(base, null, "US", ACCENT);
  assert.notEqual(hover.US, ACCENT);
  assert.notEqual(hover.US, base.US);
  assert.equal(hover.CA, base.CA, "a hover alone leaves the rest as they were");
  const both = focusColors(base, "SE", "CA", ACCENT);
  assert.equal(both.SE, ACCENT);
  assert.equal(both.CA, focusColors(base, null, "CA", ACCENT).CA, "the hovered country is the lightened accent beside the choice");
  assert.deepEqual(focusColors(base, "SE", "SE", ACCENT).SE, ACCENT, "the chosen country under the pointer stays the accent");
});

test("a choice or hover with no players under the filters changes nothing on the map", () => {
  assert.deepEqual(focusColors(base, "JP", null, ACCENT), base);
  assert.deepEqual(focusColors(base, null, "JP", ACCENT), base);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { centreText, fitLength, lineWidth } from "../src/lib/donutCentre.ts";

/** Run in web/: pnpm test:donut. What a donut writes in its middle, at rest and while a slice is under the pointer or the focus. */

const fmt = (n: number) => String(n);
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const of = ({ total, pct: p }: { total: string; pct: string }) => `of ${total} · ${p}`;
const rest = { big: "15", sub: "players" };

test("at rest the middle is the whole", () => {
  assert.deepEqual(centreText(rest, null, 15, fmt, pct, of), { live: false, big: "15", lines: ["players"] });
  assert.deepEqual(centreText(rest, undefined, 15, fmt, pct, of), { live: false, big: "15", lines: ["players"] });
});

test("on a slice the middle is that slice's count, name and share of the whole", () => {
  assert.deepEqual(centreText(rest, { label: "China", n: 1 }, 15, fmt, pct, of), { live: true, big: "1", lines: ["China", "of 15 · 6.7%"] });
  assert.deepEqual(centreText(rest, { label: "United States", n: 13 }, 15, fmt, pct, of).lines, ["United States", "of 15 · 86.7%"]);
});

test("leaving the slice gives the whole back, and an empty whole never divides", () => {
  const on = centreText(rest, { label: "China", n: 1 }, 15, fmt, pct, of);
  const off = centreText(rest, null, 15, fmt, pct, of);
  assert.notDeepEqual(on, off);
  assert.deepEqual(off, centreText(rest, undefined, 15, fmt, pct, of));
  assert.equal(centreText(rest, { label: "China", n: 0 }, 0, fmt, pct, of).live, false);
});

test("the count is written the way the caller asks (grouping, innings pitched)", () => {
  const spaced = (n: number) => n.toLocaleString("fr-CA");
  assert.equal(centreText(rest, { label: "x", n: 1234 }, 5000, spaced, pct, of).big, spaced(1234));
});

test("a long name is squeezed to fit the hole, a short one is left alone, a Japanese one counts wider", () => {
  assert.equal(fitLength("China", 96), undefined);
  assert.equal(fitLength("Bosnia and Herzegovina", 96), 96);
  assert.ok(lineWidth("イギリス領ヴァージン諸島") > lineWidth("Norway"));
  assert.equal(fitLength("アメリカ合衆国", 96), undefined);
  assert.equal(fitLength("イギリス領ヴァージン諸島", 96), 96);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { clampPage, JUMP_SELECT_MAX, pageWindow } from "../src/lib/pager.ts";

/** Run in web/: pnpm test:pager. Which page numbers the pager draws, and where it puts the ellipses. */

const text = (w: (number | null)[]) => w.map((n) => (n == null ? "…" : String(n))).join(" ");

test("no pages draws nothing and one page draws just 1", () => {
  assert.equal(text(pageWindow(1, 0)), "");
  assert.equal(text(pageWindow(1, 1)), "1");
});

test("two pages and five pages show every number, with no ellipsis", () => {
  assert.equal(text(pageWindow(1, 2)), "1 2");
  assert.equal(text(pageWindow(2, 2)), "1 2");
  for (let p = 1; p <= 5; p++) assert.equal(text(pageWindow(p, 5)), "1 2 3 4 5", `page ${p}`);
});

test("seven pages: an ellipsis only where it hides two or more pages", () => {
  assert.equal(text(pageWindow(1, 7)), "1 2 3 … 7");
  assert.equal(text(pageWindow(2, 7)), "1 2 3 4 … 7");
  assert.equal(text(pageWindow(3, 7)), "1 2 3 4 5 6 7");
  assert.equal(text(pageWindow(4, 7)), "1 2 3 4 5 6 7");
  assert.equal(text(pageWindow(5, 7)), "1 2 3 4 5 6 7");
  assert.equal(text(pageWindow(7, 7)), "1 … 5 6 7");
});

test("a thousand pages: first, last, the current page and two on each side", () => {
  assert.equal(text(pageWindow(1, 1000)), "1 2 3 … 1000");
  assert.equal(text(pageWindow(2, 1000)), "1 2 3 4 … 1000");
  assert.equal(text(pageWindow(4, 1000)), "1 2 3 4 5 6 … 1000");
  assert.equal(text(pageWindow(5, 1000)), "1 2 3 4 5 6 7 … 1000");
  assert.equal(text(pageWindow(6, 1000)), "1 … 4 5 6 7 8 … 1000");
  assert.equal(text(pageWindow(500, 1000)), "1 … 498 499 500 501 502 … 1000");
  assert.equal(text(pageWindow(996, 1000)), "1 … 994 995 996 997 998 999 1000");
  assert.equal(text(pageWindow(1000, 1000)), "1 … 998 999 1000");
});

test("a gap of one page shows that page instead of an ellipsis", () => {
  assert.equal(text(pageWindow(5, 9)), "1 2 3 4 5 6 7 8 9");
  assert.equal(text(pageWindow(5, 1000)), "1 2 3 4 5 6 7 … 1000");
});

test("the phone window keeps one page on each side", () => {
  assert.equal(text(pageWindow(49, 999, 1)), "1 … 48 49 50 … 999");
  assert.equal(text(pageWindow(1, 999, 1)), "1 2 … 999");
  assert.equal(text(pageWindow(999, 999, 1)), "1 … 998 999");
  assert.equal(text(pageWindow(3, 999, 1)), "1 2 3 4 … 999");
});

test("a page outside the list is read as the nearest page", () => {
  assert.equal(text(pageWindow(0, 20)), text(pageWindow(1, 20)));
  assert.equal(text(pageWindow(99, 20)), text(pageWindow(20, 20)));
  assert.equal(text(pageWindow(Number.NaN, 20)), text(pageWindow(1, 20)));
});

test("every window holds the first, the last and the current page, in order, and an ellipsis hides at least two pages", () => {
  for (const pages of [1, 2, 3, 6, 7, 8, 9, 10, 57, 200, 1000]) {
    for (let page = 1; page <= pages; page += Math.max(1, Math.floor(pages / 40))) {
      for (const s of [1, 2]) {
        const w = pageWindow(page, pages, s);
        assert.ok(w.includes(page) && w.includes(1) && w.includes(pages), `${page}/${pages}`);
        for (let i = 1; i < w.length; i++) {
          const a = w[i - 1], b = w[i];
          assert.ok(!(a == null && b == null), "two ellipses in a row");
          if (a != null && b != null) assert.equal(b, a + 1, `${page}/${pages} skips`);
          if (a == null && b != null) assert.ok(b - (w[i - 2] as number) > 2, "an ellipsis hides at least two pages");
        }
      }
    }
  }
});

test("a typed page is kept inside the list; text that is no number is none", () => {
  assert.equal(clampPage("49", 999), 49);
  assert.equal(clampPage("0", 999), 1);
  assert.equal(clampPage("5000", 999), 999);
  assert.equal(clampPage(" 12 ", 999), 12);
  assert.equal(clampPage("7.9", 999), 7);
  assert.equal(clampPage("", 999), null);
  assert.equal(clampPage("abc", 999), null);
  assert.equal(clampPage(null, 999), null);
});

test("a select is for up to 200 pages", () => {
  assert.equal(JUMP_SELECT_MAX, 200);
});

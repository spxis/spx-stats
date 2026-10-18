import assert from "node:assert/strict";
import { test } from "node:test";
import { headingLines, headingWidth } from "../src/lib/sankeyHeadings.ts";

/** Run in web/: pnpm test:headings. Every heading must fit its column gap (the space between two column starts, less 8px). */
const titles = [
  "Season", "Playoffs", "Conference Quarterfinals", "Conference Semifinals", "Conference Finals", "Final", "Champion",
  "Saison", "Séries éliminatoires", "Quarts de finale de conférence", "Demi-finales de conférence", "Finale de conférence",
  "シーズン", "プレーオフ", "カンファレンス準々決勝", "カンファレンス準決勝", "カンファレンス決勝", "チャンピオン",
  "Quarterfinals of the Eastern Conference Playoff Bracket", "Supercalifragilisticexpialidocious",
];

test("every heading fits its column gap in at most two lines", () => {
  for (const gap of [60, 90, 120, 150, 200, 300]) {
    for (const t of titles) {
      const lines = headingLines(t, gap - 8);
      assert.ok(lines.length >= 1 && lines.length <= 2, `${t} at ${gap}: ${lines.length} lines`);
      for (const l of lines) assert.ok(headingWidth(l) <= gap - 8, `${JSON.stringify(l)} is ${headingWidth(l)}px in a ${gap - 8}px column`);
    }
  }
});

test("a heading that fits stays on one line, unchanged", () => {
  assert.deepEqual(headingLines("Season", 200), ["Season"]);
});

test("a long heading breaks at a word", () => {
  assert.deepEqual(headingLines("Conference Quarterfinals", 140), ["Conference", "Quarterfinals"]);
});

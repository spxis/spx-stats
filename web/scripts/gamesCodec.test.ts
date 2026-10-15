import assert from "node:assert/strict";
import { test } from "node:test";
import { packGames, unpackGames } from "../src/lib/gamesCodec.ts";
import type { GameTuple } from "../src/lib/season.ts";

/** Run in web/: pnpm test:seasons (the season page's games, packed for the page's data). */

const games: GameTuple[] = [
  ["2023-10-24", 58700, 107, 119, 58426, "r", "f", "wikipedia", 0, null, 4645692],
  ["1917-12-19", 12, 7, 4, 3, "r", "f", "spx", 1, 1, 9],
  ["2026-04-01", 70000, null, null, 1, "p", "s", "nflverse", 0, -1, 123456789],
  ["1969-12-31", 1, 0, 0, 2, "a", "f", "wikipedia", 0, null, 1],
  ["2024-02-29", 5, 10, 3, 6, "r", "f", "spx", 0, 0, 77],
];

test("packed games come back as they were", () => {
  assert.deepEqual(unpackGames(packGames(games)), games);
  assert.deepEqual(unpackGames(packGames([])), []);
});

test("a packed season is much shorter than its tuples", () => {
  const many = Array.from({ length: 1300 }, (_, i) => ["2023-11-0" + (1 + (i % 9)), 58000 + (i % 30), 90 + (i % 40), 95 + (i % 30), 58200 + (i % 29), "r", "f", "wikipedia", 0, null, 4645000 + i] as GameTuple);
  const packed = JSON.stringify(packGames(many)).length, plain = JSON.stringify(many).length;
  assert.ok(packed < plain * 0.6, `${packed} against ${plain}`);
});

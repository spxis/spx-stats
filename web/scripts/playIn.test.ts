import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameRow } from "../src/lib/api/types.ts";
import { buildPlayIn, findPlayInGames } from "../src/lib/nbaPlayIn.ts";
import { assignRounds, deriveSeries, type PlayoffGame } from "../src/lib/series.ts";
import { drawKnockout } from "../src/lib/bracketDraw.ts";

/** Run in web/: pnpm test:playin. The NBA's 2023-24 play-in and first two rounds, as the archive holds them (the play-in games are regular-season games). */

const ID: Record<string, number> = {};
const f = (code: string): number => (ID[code] ??= Object.keys(ID).length + 1);
let next = 1;
const game = (date: string, away: string, home: string, as: number, hs: number, phase = "regular"): GameRow => ({
  league: "nba", year: 2023, game_id: next++, game_date: date, phase, status: "final", away_id: f(away), away, away_score: as, home_id: f(home), home, home_score: hs,
  overtime: null, source: "test", checked: null, away_f: f(away), home_f: f(home),
});

// The last day of the regular season (15 games) and the play-in.
const lastDay = Array.from({ length: 15 }, (_, i) => game("2024-04-14", `A${i}`, `B${i}`, 100, 99));
const playInGames = [
  game("2024-04-16", "LAL", "NOP", 110, 106), game("2024-04-16", "GSW", "SAC", 94, 118),
  game("2024-04-17", "MIA", "PHI", 104, 105), game("2024-04-17", "ATL", "CHI", 116, 131),
  game("2024-04-19", "CHI", "MIA", 91, 112), game("2024-04-19", "SAC", "NOP", 98, 105),
];

/** A best-of-seven the better seed wins 4 games to `lost`, the games on consecutive days from `start`; the better seed has the home games 1, 2, 5 and 7. */
function series(start: number, high: string, low: string, lost: number, phase = "playoffs"): GameRow[] {
  const homeIsHigh = [true, true, false, false, true, false, true];
  const out: GameRow[] = [];
  let h = 0, l = 0;
  for (let n = 0; h < 4; n++) {
    const lowWins = l < lost && n % 2 === 1;
    if (lowWins) l++; else h++;
    const [away, home] = homeIsHigh[n] ? [low, high] : [high, low];
    const score = (team: string) => (team === high ? (lowWins ? 90 : 110) : lowWins ? 100 : 95);
    out.push(game(`2024-04-${String(start + n).padStart(2, "0")}`, away, home, score(away), score(home), phase));
  }
  return out;
}

const first = [
  ...series(20, "OKC", "NOP", 0), ...series(20, "DEN", "LAL", 1), ...series(20, "MIN", "PHX", 0), ...series(20, "LAC", "DAL", 2),
  ...series(21, "BOS", "MIA", 1), ...series(21, "NYK", "PHI", 2), ...series(21, "MIL", "IND", 2), ...series(21, "CLE", "ORL", 3),
];
const second = [
  ...series(30, "OKC", "LAC", 2), ...series(30, "DEN", "MIN", 3), ...series(30, "BOS", "CLE", 1), ...series(30, "NYK", "MIL", 3),
];

const east = new Set(["BOS", "NYK", "MIL", "CLE", "ORL", "IND", "PHI", "MIA", "CHI", "ATL"]);
const conf = (id: number) => {
  const code = Object.keys(ID).find((c) => ID[c] === id)!;
  return { name: east.has(code) ? "Eastern Conference" : "Western Conference", short: null };
};
const look = (id: number) => ({ name: Object.keys(ID).find((c) => ID[c] === id) ?? String(id) });

function build(playoff: GameRow[], playIn: GameRow[]) {
  const ser = deriveSeries("nba", 2023, playoff as PlayoffGame[]);
  const round = assignRounds(ser);
  return { ser, round, built: buildPlayIn(playIn, ser, round, conf, look) };
}

test("the play-in's games are the games after the last day of the full schedule", () => {
  const found = findPlayInGames([...lastDay, ...playInGames], "2024-04-20");
  assert.equal(found.length, 6);
  assert.deepEqual(found.map((g) => g.game_date), ["2024-04-16", "2024-04-16", "2024-04-17", "2024-04-17", "2024-04-19", "2024-04-19"]);
  assert.equal(findPlayInGames(playInGames, "2024-04-20").length, 0, "with no full day before them there is nothing to tell them from the rest");
  assert.equal(findPlayInGames([...lastDay, ...playInGames], "2024-04-17").length, 2, "games on or after the first playoff game are not the play-in's");
});

test("the play-in is drawn with the seeds the games and the first two rounds give, and each winner goes on to its first-round series", () => {
  const { ser, round, built } = build([...first, ...second], playInGames);
  assert.ok(built, "six games in the known shape make a play-in");
  const layout = built.layout;
  assert.equal(layout.ties.length, ser.length + 6);
  assert.equal(layout.playIn.length, 6);
  const seed = new Map(layout.teams.map((t) => [t.id, t.seed]));
  const seeds = (codes: string[]) => codes.map((c) => seed.get(f(c)));
  assert.deepEqual(seeds(["OKC", "DEN", "MIN", "LAC", "DAL", "PHX"]), [1, 2, 3, 4, 5, 6], "the six who needed no game, by their place in the bracket");
  assert.deepEqual(seeds(["BOS", "NYK", "MIL", "CLE", "ORL", "IND"]), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(seeds(["LAL", "NOP", "PHI", "MIA"]), [7, 8, 7, 8], "the seventh seed won the 7 v 8 game, the eighth the decider");
  const into = layout.ties.filter((t) => t.from?.some((s) => s && layout.playIn.includes(s.tie)) && !t.playIn);
  assert.equal(into.length, 4, "the four first-round series that take a play-in winner");
  const decider = layout.ties.find((t) => t.playIn && t.from);
  assert.deepEqual(decider!.from!.map((s) => s!.result).sort(), ["loser", "winner"], "the decider takes a loser and a winner");
  assert.ok(round.length === ser.length);
});

test("it draws on a desk and a phone, and draws nothing for games that are not a play-in", () => {
  const { built } = build([...first, ...second], playInGames);
  const art = drawKnockout(built!.layout, { layout: "playin", seeds: true });
  for (const svg of [art.wide, art.phone]) {
    assert.ok(svg.includes("Play-in") || svg.includes("PLAY-IN"), "the games' heading");
  }
  assert.ok(!art.phone.includes("<style>"));
  assert.equal(build([...first, ...second], playInGames.slice(0, 5)).built, null, "five games are not a play-in");
  assert.equal(build([...first, ...second], [...playInGames.slice(0, 5), game("2024-04-19", "CHI", "ORL", 1, 2)]).built, null, "games that do not lead on to each other are not either");
  assert.equal(build(first, playInGames).built, null, "while the second round is not played the seeds 3 to 6 are not known, so there is no play-in drawing yet");
});

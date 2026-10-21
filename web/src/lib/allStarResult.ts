/**
 * What an event's banner, card and list line say of its result, in one place: the two sides in the order they are drawn, the score of each, who won and how. A single game
 * is its own score; a tournament or a round robin shows the game that decided it (the final or championship); a series shows the games each side won (the goals when
 * those are level, which is how the 1987 Rendez-vous was settled). Pure.
 */
import type { AllStarEvent, AllStarGame } from "./allStarView.ts";
import { decidingGame, gameSides, gameWinner, realGames, seriesResult, shapeOf, type EventShape } from "./allStarView.ts";
import { looksOf, sidePair, type Look, type SideView } from "./allStarSides.ts";
import type { SideLook } from "./seriesLooks.ts";

export interface ResultView {
  shape: Exclude<EventShape, "none">;
  /** The game that decided the event; null for a series. */
  deciding: AllStarGame | null;
  /** The sides in the order they are drawn, with the number each is drawn with (the score; for a series the games won, the goals when those are level). */
  left: SideView;
  right: SideView;
  /** 0 for the left side, 1 for the right, null for a level game. */
  winner: 0 | 1 | null;
  /** How it was decided: overtime, a shootout, the goals of a series that was level on games. */
  by: "OT" | "SO" | "aggregate" | null;
  /** The stage of the deciding game (final, championship) as the list names it. */
  stage: string | null;
  /** The games of the event. */
  games: number;
  /** The sides' colours (lib/seriesLooks.ts). */
  looks: [SideLook, SideLook];
  /** A series' goals (or points) over all its games, in the order drawn. */
  goals: [number, number] | null;
}

export function resultOf(lg: string, look: Look, ev: AllStarEvent, all: readonly AllStarGame[]): ResultView | null {
  const shape = shapeOf(ev, all);
  if (shape === "none") return null;
  const games = realGames(all);
  const year = ev.season_year;
  if (shape === "series") {
    const r = seriesResult(games)!;
    const first = games[0];
    const { left, right } = gameSides(first, ev.host_franchise);
    const byName = new Map([[r.a.name, r.a], [r.b.name, r.b]]);
    const pick = (n: string) => (byName.get(n) ?? r.a);
    const [l, rt] = [pick(left.name), pick(right.name)];
    const goalOf = (n: string) => (n === r.a.name ? r.goals[0] : r.goals[1]);
    const level = r.by !== "games";
    const [vl, vr] = sidePair(look, year, { ...left, score: level ? goalOf(left.name) : l.score }, { ...right, score: level ? goalOf(right.name) : rt.score });
    const winner = vl.score === vr.score ? null : vl.score > vr.score ? 0 : 1;
    return { shape, deciding: null, left: vl, right: vr, winner, by: r.by === "aggregate" ? "aggregate" : null, stage: null, games: games.length, looks: looksOf(lg, vl, vr), goals: [goalOf(left.name), goalOf(right.name)] };
  }
  const g = decidingGame(games)!;
  const { left, right } = gameSides(g, ev.host_franchise);
  const [vl, vr] = sidePair(look, year, left, right);
  const w = gameWinner(g);
  const winner = w == null ? null : left.i === w ? 0 : 1;
  const by = g.decided_by === "OT" ? "OT" : g.decided_by === "SO" ? "SO" : null;
  return { shape, deciding: g, left: vl, right: vr, winner, by, stage: g.stage, games: games.length, looks: looksOf(lg, vl, vr), goals: null };
}

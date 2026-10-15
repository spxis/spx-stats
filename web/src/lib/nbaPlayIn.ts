/**
 * The NBA's play-in tournament (from the 2020-21 season), worked out from the games: the archive has its six games as regular-season games, with nothing
 * that marks them, and the playoffs' first round names no play-in either. So the games are found by where they fall, the seeds by how the games and the
 * first round went, and anything that does not fit the known shape (7 v 8 and 9 v 10, then the loser of the first against the winner of the second, in each
 * conference) draws no play-in at all: a wrong picture is worse than none. Pure (no server-only imports); drawn by Taisen Brackets' `playin` layout
 * (lib/bracketDraw.ts), joined to the playoffs' first round through `feeds`.
 */
import { layoutBracket, type BracketLayout, type Matchup, type Team } from "@johnmorrisdotca/taisen-brackets/layout";
import type { GameRow } from "./api/types";
import { matchupsOf, teamsOf, type Conf, type SideLook } from "./bracketLayout.ts";
import { seriesTies, type Series } from "./series.ts";

/** The first season (the year it starts) with a play-in. */
export const PLAY_IN_FROM = 2020;

/** A day with at least this many games is a day of the regular season's full schedule; the play-in's days have four at most. */
const FULL_DAY = 8;

/** How many days before the first playoff game the play-in's games are looked for. */
export const PLAY_IN_WINDOW_DAYS = 12;

/** The play-in's games among the regular-season games just before the playoffs began: those after the last day of the full schedule, oldest first. */
export function findPlayInGames(regular: readonly GameRow[], firstPlayoff: string): GameRow[] {
  const before = regular.filter((g) => g.status === "final" && g.game_date < firstPlayoff && g.home_f != null && g.away_f != null && g.home_score != null && g.away_score != null);
  const perDay = new Map<string, number>();
  for (const g of before) perDay.set(g.game_date, (perDay.get(g.game_date) ?? 0) + 1);
  const lastFull = [...perDay].filter(([, n]) => n >= FULL_DAY).map(([d]) => d).sort().at(-1);
  if (!lastFull) return [];
  return before.filter((g) => g.game_date > lastFull).sort((a, b) => (a.game_date < b.game_date ? -1 : a.game_date > b.game_date ? 1 : a.game_id - b.game_id));
}

export interface PlayIn {
  /** The ties of the playoffs' series (in the order of `series`), then the six play-in games. */
  layout: BracketLayout;
}

const winnerOf = (g: GameRow): number => (g.home_score! > g.away_score! ? g.home_f! : g.away_f!);
const loserOf = (g: GameRow): number => (g.home_score! > g.away_score! ? g.away_f! : g.home_f!);

/**
 * The play-in drawn with the first round it leads to: `games` from `findPlayInGames`, `series` and `round` as `loadPlayoffs` has them, `conf` the conference
 * of a franchise. Null when the games are not a play-in of the known shape, when a series the seeds depend on is not decided yet, or when no conference is known.
 */
export function buildPlayIn(games: readonly GameRow[], series: readonly Series[], round: readonly number[], conf: (f: number) => Conf | null, look: (f: number) => SideLook): PlayIn | null {
  if (games.length !== 6) return null;
  const groups = new Map<string, GameRow[]>();
  for (const g of games) {
    const a = conf(g.home_f!), b = conf(g.away_f!);
    if (!a || !b || a.name !== b.name) return null;
    groups.set(a.name, [...(groups.get(a.name) ?? []), g]);
  }
  if (groups.size !== 2 || [...groups.values()].some((l) => l.length !== 3)) return null;

  const seed = new Map<number, number>();
  const tags = new Map<number, number>();
  const played: { id: string; game: GameRow }[] = [];
  /** Where the winner of the 7 v 8 game and of the decider go on: franchise -> the id of the game they came from. */
  const came = new Map<number, string>();
  const names = [...groups.keys()];
  for (const name of names) {
    const [a, b, dec] = groups.get(name)!;
    if (a.game_date !== b.game_date || dec.game_date <= a.game_date) return null;
    const into = new Set([dec.home_f, dec.away_f]);
    let g78: GameRow, g910: GameRow;
    if (into.has(loserOf(a)) && into.has(winnerOf(b))) { g78 = a; g910 = b; }
    else if (into.has(loserOf(b)) && into.has(winnerOf(a))) { g78 = b; g910 = a; }
    else return null;
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    played.push({ id: `${key}-78`, game: g78 }, { id: `${key}-910`, game: g910 }, { id: `${key}-8`, game: dec });
    // The home side of a play-in game is the better seed.
    tags.set(g78.home_f!, 7); tags.set(g78.away_f!, 8); tags.set(g910.home_f!, 9); tags.set(g910.away_f!, 10);
    seed.set(winnerOf(g78), 7);
    seed.set(winnerOf(dec), 8);
    // The two that are out: the loser of the decider and the loser of 9 v 10, in that order.
    seed.set(loserOf(dec), 9);
    seed.set(loserOf(g910), seed.has(loserOf(g910)) ? seed.get(loserOf(g910))! : 10);
    came.set(winnerOf(g78), `${key}-78`);
    came.set(winnerOf(dec), `${key}-8`);
  }

  // The first round's seeds from who came through, and the rest from the second round (1 v 8 meets 4 v 5, 2 v 7 meets 3 v 6).
  const ties = seriesTies(series);
  const winnerF = (i: number): number | null => (series[i].winner == null ? null : series[i].sides[series[i].winner!].f);
  const homeF = (i: number): number => series[i].sides[series[i].games[0].home].f;
  const awayF = (i: number): number => series[i].sides[1 - series[i].games[0].home].f;
  for (const name of names) {
    const first = series.map((_, i) => i).filter((i) => round[i] === 1 && series[i].sides.every((s) => conf(s.f)?.name === name));
    if (first.length !== 4) return null;
    const through7 = [...came].find(([, id]) => id.endsWith("-78") && id.startsWith(name.toLowerCase().replace(/[^a-z0-9]+/g, "-")))?.[0];
    const through8 = [...came].find(([, id]) => id.endsWith("-8") && id.startsWith(name.toLowerCase().replace(/[^a-z0-9]+/g, "-")))?.[0];
    const s7 = first.find((i) => series[i].sides.some((s) => s.f === through7));
    const s8 = first.find((i) => series[i].sides.some((s) => s.f === through8));
    if (s7 == null || s8 == null || s7 === s8) return null;
    const rest = first.filter((i) => i !== s7 && i !== s8);
    for (const [s, top, low] of [[s7, 2, 7], [s8, 1, 8]] as const) {
      const [x, y] = series[s].sides.map((t) => t.f);
      const play = x === (low === 7 ? through7 : through8) ? y : x;
      seed.set(play, top);
    }
    // 1 v 8 meets the winner of 4 v 5 in the second round: find who the 1 seed's second-round opponent is.
    const won8 = winnerF(s8);
    if (won8 == null) return null;
    const second = series.map((_, i) => i).find((i) => round[i] === 2 && series[i].sides.some((t) => t.f === won8));
    if (second == null) return null;
    const meets = series[second].sides.map((t) => t.f).find((f) => f !== won8)!;
    const s45 = rest.find((i) => winnerF(i) === meets);
    const s36 = rest.find((i) => i !== s45);
    if (s45 == null || s36 == null) return null;
    seed.set(homeF(s45), 4); seed.set(awayF(s45), 5);
    seed.set(homeF(s36), 3); seed.set(awayF(s36), 6);
  }

  const { teams: base, groupOrder } = teamsOf([...ties, ...played.map((p) => ({ teams: [p.game.away_f!, p.game.home_f!] as const, winner: null, start: p.game.game_date }))], conf, look);
  const teams: Team[] = base.map((t) => ({ ...t, ...(seed.has(t.id as number) ? { seed: seed.get(t.id as number) } : {}) }));

  const tree: Matchup[] = matchupsOf(ties, round).map((m, i) => {
    const f = (m.sides as readonly number[]).findIndex((id) => came.has(id));
    if (f < 0 || round[i] !== 1) return m;
    const from = { tie: came.get((m.sides as readonly number[])[f])!, result: "winner" as const };
    return { ...m, feeds: (f === 0 ? [from, null] : [null, from]) as Matchup["feeds"] };
  });
  const playIn: Matchup[] = played.map(({ id, game }) => {
    const base: Matchup = {
      id, stage: "play-in", sides: [game.away_f!, game.home_f!], home: 1, date: game.game_date, kind: "game",
      score: [game.away_score!, game.home_score!], ...(game.overtime ? { extraTime: true } : {}),
      seeds: [tags.get(game.away_f!) ?? null, tags.get(game.home_f!) ?? null],
    };
    if (!id.endsWith("-8")) return base;
    // The decider takes the loser of the 7 v 8 game and the winner of the 9 v 10 game, in the order of its sides (visitor, home).
    const key = id.slice(0, -2);
    const loser78 = loserOf(played.find((p) => p.id === `${key}-78`)!.game);
    const sides = base.sides as readonly number[];
    const toSource = (f: number) => (f === loser78 ? { tie: `${key}-78`, result: "loser" as const } : { tie: `${key}-910`, result: "winner" as const });
    return { ...base, feeds: [toSource(sides[0]), toSource(sides[1])] as const };
  });
  const matchups = [...tree, ...playIn];
  const layout = layoutBracket({ matchups, teams }, { groupOrder });
  return { layout };
}

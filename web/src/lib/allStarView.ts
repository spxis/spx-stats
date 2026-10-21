/**
 * The All-Star Games of the five leagues and the WNBA (docs/all-star-games.md): the shapes of the api views of migration 145 and the pure helpers the pages share.
 * No server-only imports, so a node script can test it.
 *
 * The archive stores a result as the list it comes from prints it (the winner first, or the visitor first for the CFL). Which side is drawn on the left is not that order:
 * a game with a host club on one side puts the host on the right (the home side, lib/sides.ts `gameOrder`), any other game puts the western side on the left
 * (`neutralOrder`), so East and West, the American and the National League always sit the same way round. A tournament (the NHL's 3-on-3, the NBA's) is a knockout drawn
 * as a bracket, a short series a banner with its games, a single game a two-sided banner.
 */
import { z } from "zod";
import type { Tie } from "./bracketLayout.ts";
import { gameOrder, inOrder, neutralOrder, type Order } from "./sides.ts";

const nText = z.string().nullable();
const nNum = z.number().nullable();

export const allStarEventSchema = z.object({
  league: z.string(), year: z.number(), event_no: z.number(), season_year: nNum,
  status: z.enum(["played", "cancelled"]), status_reason: nText, format: nText,
  first_day: nText, last_day: nText, venue_name: nText, city_text: nText, venue_wikidata_id: nText,
  host_name: nText, host_franchise: nNum, attendance: nNum, source: z.string(),
});
export type AllStarEvent = z.infer<typeof allStarEventSchema>;

export const allStarGameSchema = z.object({
  league: z.string(), year: z.number(), event_no: z.number(), game_no: z.number(), stage: nText,
  side1_name: z.string(), side1_score: z.number(), side1_franchise: nNum,
  side2_name: z.string(), side2_score: z.number(), side2_franchise: nNum,
  decided_by: nText,
});
export type AllStarGame = z.infer<typeof allStarGameSchema>;

export const allStarMvpSchema = z.object({
  league: z.string(), year: z.number(), event_no: z.number(), seq: z.number(), kind: nText, name: z.string(), team_name: nText, person_id: nNum,
});
export type AllStarMvp = z.infer<typeof allStarMvpSchema>;

export const allStarSelectionSchema = z.object({
  league: z.string(), year: z.number(), event_no: z.number(), seq: z.number(), side: nText, role: nText, grp: nText, position: nText, name: z.string(), team_name: nText,
  person_id: nNum,
});
export type AllStarSelection = z.infer<typeof allStarSelectionSchema>;

/** Everything the archive holds about one league's All-Star Games (a hundred events at most: one small read). */
export interface AllStarLeague {
  events: AllStarEvent[];
  games: AllStarGame[];
  mvps: AllStarMvp[];
}

/** The leagues whose game is called the Pro Bowl. */
export const PRO_BOWL: ReadonlySet<string> = new Set(["nfl"]);

/** /nhl/all-star, or /nhl/all-star/2024 for the event(s) played in a calendar year. */
export const allStarPath = (lg: string, year?: number): string => (year == null ? `/${lg}/all-star` : `/${lg}/all-star/${year}`);

/** The key an event, its games and its MVPs share. */
export const eventKey = (x: { year: number; event_no: number }): string => `${x.year}:${x.event_no}`;

/** The events played in a season (a season is named by its first year, as the season pages are): the NHL's 2023 season holds the game of February 2024. */
export const eventsOfSeason = (events: readonly AllStarEvent[], seasonYear: number): AllStarEvent[] =>
  events.filter((e) => e.season_year === seasonYear).sort((a, b) => a.year - b.year || a.event_no - b.event_no);

/** The games and the MVPs of one event, in order. */
export function partsOf(data: AllStarLeague, ev: { year: number; event_no: number }): { games: AllStarGame[]; mvps: AllStarMvp[] } {
  const k = eventKey(ev);
  return {
    games: data.games.filter((g) => eventKey(g) === k).sort((a, b) => a.game_no - b.game_no),
    mvps: data.mvps.filter((m) => eventKey(m) === k).sort((a, b) => a.seq - b.seq),
  };
}

/** "East 211–186 West" for the winner-first lists; a game of equal scores keeps the order it is printed in. */
export function scoreLine(g: Pick<AllStarGame, "side1_name" | "side1_score" | "side2_name" | "side2_score">): string {
  return `${g.side1_name} ${g.side1_score}–${g.side2_score} ${g.side2_name}`;
}

/** A game's two scores are equal (the 1961 and 2002 MLB games, the NHL's ties before overtime). */
export const isTie = (g: Pick<AllStarGame, "side1_score" | "side2_score">): boolean => g.side1_score === g.side2_score;

/** Why an event was not held: the reason codes the build writes. */
export const REASONS = ["lockout", "olympics", "pandemic", "world_cup", "war", "strike", "other"] as const;
export type Reason = (typeof REASONS)[number];
export const reasonOf = (code: string | null): Reason => (REASONS as readonly string[]).includes(code ?? "") ? (code as Reason) : "other";

const ROLE_ORDER = ["starter", "reserve", "replacement", "alternate"];

/** A roster line's group, by how early it is in a roster: starters, reserves, replacements, alternates, then anything else in the order met. */
export const roleRank = (role: string | null): number => {
  if (role == null) return 99;
  const i = ROLE_ORDER.findIndex((r) => role.startsWith(r));
  return i < 0 ? 50 : i;
};

export interface RosterGroup { role: string | null; players: AllStarSelection[] }
export interface RosterSide { side: string | null; groups: RosterGroup[]; count: number }

/** The roster lines of one event as sides (in the order the article lists them), each with its groups (starters first), each group in the article's order. */
export function rosterSides(lines: readonly AllStarSelection[]): RosterSide[] {
  const sides: RosterSide[] = [];
  for (const l of [...lines].sort((a, b) => a.seq - b.seq)) {
    let s = sides.find((x) => x.side === l.side);
    if (!s) { s = { side: l.side, groups: [], count: 0 }; sides.push(s); }
    let g = s.groups.find((x) => x.role === l.role);
    if (!g) { g = { role: l.role, players: [] }; s.groups.push(g); }
    g.players.push(l);
    s.count++;
  }
  for (const s of sides) s.groups.sort((a, b) => roleRank(a.role) - roleRank(b.role));
  return sides;
}

/** The years a person was picked or was the MVP, per league: for the player page. */
export interface PersonAllStar {
  league: string;
  year: number;
  event_no: number;
  /** The person was the game's Most Valuable Player. */
  mvp: boolean;
  /** The side, role and position the roster gave him; null when only the MVP line names him. */
  side: string | null;
  role: string | null;
  position: string | null;
  team: string | null;
}

/** One row per event for a person (an MVP who is also on the roster is one row, marked MVP), newest first. */
export function personRows(selections: readonly AllStarSelection[], mvps: readonly AllStarMvp[]): PersonAllStar[] {
  const out = new Map<string, PersonAllStar>();
  for (const s of selections) {
    const k = `${s.league}:${eventKey(s)}`;
    if (!out.has(k)) out.set(k, { league: s.league, year: s.year, event_no: s.event_no, mvp: false, side: s.side, role: s.role, position: s.position, team: s.team_name });
  }
  for (const m of mvps) {
    const k = `${m.league}:${eventKey(m)}`;
    const had = out.get(k);
    if (had) had.mvp = true;
    else out.set(k, { league: m.league, year: m.year, event_no: m.event_no, mvp: true, side: null, role: null, position: null, team: m.team_name });
  }
  return [...out.values()].sort((a, b) => b.year - a.year || b.event_no - a.event_no || (a.league < b.league ? -1 : 1));
}

/* ---------- what the pages draw: sides, shapes, brackets ---------- */

/** A parsed list row that is not a game: the 1987 series' last line reads "Soviet Union wins 8, on aggregate 7". */
const AGGREGATE_ROW = /\bon aggregate\b|\bwins?$/i;
export const isAggregateRow = (g: Pick<AllStarGame, "side1_name" | "side2_name">): boolean => AGGREGATE_ROW.test(g.side1_name.trim()) || AGGREGATE_ROW.test(g.side2_name.trim());

/** The games of an event that are games, in order (the aggregate line of a series is dropped: the pages add the games up themselves). */
export const realGames = (games: readonly AllStarGame[]): AllStarGame[] => games.filter((g) => !isAggregateRow(g)).sort((a, b) => a.game_no - b.game_no);

/** The side (0 or 1) that scored more; null for a level game. */
export const gameWinner = (g: Pick<AllStarGame, "side1_score" | "side2_score">): 0 | 1 | null => (g.side1_score === g.side2_score ? null : g.side1_score > g.side2_score ? 0 : 1);

/** A side's name without the marks a list adds ("Team Giannis ‡"). */
export const cleanSide = (name: string): string => name.replace(/[\s\u2020\u2021*]+$/u, "").trim();

const KNOCKOUT = /^(semifinal|final|championship)(?:\s+\d+)?$/i;
const GAME_OF_SERIES = /^game\s+\d+$/i;

export type EventShape = "none" | "single" | "bracket" | "series" | "games";

/**
 * How an event is drawn: `bracket` when its games are the semifinals and the final of a tournament (three or more), `series` for a few games between the same two sides,
 * `single` for one game, `games` for several that are neither (a round robin before a final), `none` for an event not held or with no result.
 */
export function shapeOf(ev: Pick<AllStarEvent, "status" | "format">, games: readonly AllStarGame[]): EventShape {
  const g = realGames(games);
  if (ev.status !== "played" || !g.length) return "none";
  if (ev.format === "series" || (g.length > 1 && g.every((x) => x.stage != null && GAME_OF_SERIES.test(x.stage)))) return "series";
  if (g.filter((x) => x.stage != null && KNOCKOUT.test(x.stage)).length >= 3) return "bracket";
  return g.length === 1 ? "single" : "games";
}

/** The game that decided the event: the final or championship, else the last game. */
export function decidingGame(games: readonly AllStarGame[]): AllStarGame | null {
  const g = realGames(games);
  return [...g].reverse().find((x) => x.stage != null && /^(final|championship)$/i.test(x.stage)) ?? g.at(-1) ?? null;
}

/** The two sides of a game, left one first: the host club's on the right (it is the home side), else West before East and any other pair by name. `sides` index 0 and 1 are the list's side 1 and 2. */
export function gameSides(g: AllStarGame, hostFranchise: number | null): { order: Order; left: GameSide; right: GameSide } {
  const sides: [GameSide, GameSide] = [
    { name: cleanSide(g.side1_name), score: g.side1_score, franchise: g.side1_franchise, i: 0 },
    { name: cleanSide(g.side2_name), score: g.side2_score, franchise: g.side2_franchise, i: 1 },
  ];
  const hostAt = hostFranchise == null ? -1 : sides.findIndex((s) => s.franchise === hostFranchise);
  const order = hostAt >= 0 ? gameOrder(hostAt as 0 | 1, gameWinner(g)) : neutralOrder(sides[0].name, sides[1].name);
  const [left, right] = inOrder(order, sides);
  return { order, left, right };
}
export interface GameSide { name: string; score: number; franchise: number | null; /** 0 or 1: the side's place in the list's row. */ i: 0 | 1 }

/** The letters that stand for a side with no club mark: AL, NL, AFC, E, W, MCD for Team McDavid. */
export function monogram(name: string): string {
  const n = cleanSide(name).replace(/[\u2013\u2014-]/g, " ");
  const plain = n.normalize("NFKD").replace(/[^\p{L}\s]/gu, "").replace(/\p{M}/gu, "");
  const words = plain.split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const w0 = words[0].toLowerCase();
  if (words.length === 1 && /^(east|eastern)$/.test(w0)) return "E";
  if (words.length === 1 && /^(west|western)$/.test(w0)) return "W";
  if (words.length === 2 && /^(east|eastern|west|western)$/.test(w0) && /^(conference|division|allstars|all)$/.test(words[1].toLowerCase())) return w0.startsWith("e") ? "E" : "W";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  if (/^team$/i.test(words[0])) return words[1].slice(0, 3).toUpperCase();
  return words.map((x) => x[0]).join("").slice(0, 3).toUpperCase();
}

const KNOWN_HUES: Record<string, string> = {
  west: "c8372d", western: "c8372d", "western conference": "c8372d", "west all-stars": "c8372d", "american league": "c8372d", "american conference": "c8372d", afc: "c8372d", campbell: "c8372d",
  east: "2563b8", eastern: "2563b8", "eastern conference": "2563b8", "east all-stars": "2563b8", "national league": "2563b8", "national conference": "2563b8", nfc: "2563b8", wales: "2563b8",
  pacific: "0e8f7e", central: "d9822b", atlantic: "2563b8", metropolitan: "7a4fc2",
};
const SPARE_HUES = ["2f6fcb", "c8372d", "1f8f6b", "8a5bd1", "d9822b", "0e8f7e"];

/**
 * A colour (hex, no #) for each side of an event that has no club behind it: the ones the sites' readers know (West red, East blue, the American league red, the National blue,
 * the NHL's four divisions) and, for a made-up side (Team McDavid), the next colour of a short list not already taken. The same event always gets the same colours.
 */
export function sideColours(names: readonly string[]): string[] {
  const taken = new Set<string>();
  const out = names.map((n) => {
    const hue = KNOWN_HUES[cleanSide(n).toLowerCase()];
    if (hue) taken.add(hue);
    return hue ?? null;
  });
  return out.map((h) => h ?? SPARE_HUES.find((x) => !taken.has(x) && taken.add(x)) ?? SPARE_HUES[0]);
}

/** One game of a bracket as the package wants it: the two sides' names (the keys), who won, and the score with how it was decided. */
export interface KnockoutDrawing { ties: Tie<string>[]; round: number[]; sides: string[] }

/**
 * The semifinals and the final of a tournament as the ties of a bracket (lib/bracketLayout.ts): the stage names the round (semifinals 1, final 2), the order of the games the
 * order within a round. Null when the games do not make a bracket (a final whose sides are not the semifinals' winners), so the page shows them as a list.
 */
export function knockoutDrawing(games: readonly AllStarGame[]): KnockoutDrawing | null {
  const ko = realGames(games).filter((g) => g.stage != null && KNOCKOUT.test(g.stage));
  if (ko.length < 3) return null;
  const roundOf = (g: AllStarGame) => (/^semifinal/i.test(g.stage ?? "") ? 1 : 2);
  const ties: Tie<string>[] = ko.map((g) => {
    const w = gameWinner(g);
    const note = g.decided_by === "OT" ? "OT" : g.decided_by === "SO" ? "SO" : undefined;
    return {
      teams: [cleanSide(g.side1_name), cleanSide(g.side2_name)] as const,
      winner: w == null ? null : cleanSide(w === 0 ? g.side1_name : g.side2_name),
      start: String(g.game_no).padStart(3, "0"),
      play: { kind: "game", score: [g.side1_score, g.side2_score], ...(note ? { note } : {}) },
    };
  });
  const round = ko.map(roundOf);
  // The final's two sides must be the winners of the two semifinals, or the layout would draw a bracket that is not the tournament.
  const semis = ties.filter((_, i) => round[i] === 1), finals = ties.filter((_, i) => round[i] === 2);
  if (finals.length !== 1 || semis.length < 2 || semis.some((t) => t.winner == null)) return null;
  const through = new Set(semis.map((t) => t.winner));
  if (!finals[0].teams.every((t) => through.has(t))) return null;
  return { ties, round, sides: [...new Set(ties.flatMap((t) => t.teams))] };
}

/** An event's result in a few words for a card: the side that won, or the line of a drawn game; null when nothing was played. */
export function winnerOf(games: readonly AllStarGame[]): { name: string; franchise: number | null } | null {
  const g = decidingGame(games);
  if (!g) return null;
  const w = gameWinner(g);
  return w == null ? null : { name: cleanSide(w === 0 ? g.side1_name : g.side2_name), franchise: w === 0 ? g.side1_franchise : g.side2_franchise };
}

/** A series' result: the games each side won, else (level) the goals or points each scored over the games; `by` says which settled it. */
export function seriesResult(games: readonly AllStarGame[]): { a: GameSide; b: GameSide; by: "games" | "aggregate" | "level"; goals: [number, number] } | null {
  const g = realGames(games);
  if (!g.length) return null;
  const first = g[0];
  const key = (x: string) => cleanSide(x);
  const a: GameSide = { name: key(first.side1_name), score: 0, franchise: first.side1_franchise, i: 0 };
  const b: GameSide = { name: key(first.side2_name), score: 0, franchise: first.side2_franchise, i: 1 };
  let ga = 0, gb = 0;
  for (const x of g) {
    const [n1, n2] = [key(x.side1_name), key(x.side2_name)];
    const [sa, sb] = n1 === a.name ? [x.side1_score, x.side2_score] : n2 === a.name ? [x.side2_score, x.side1_score] : [0, 0];
    ga += sa; gb += sb;
    const w = sa === sb ? null : sa > sb ? a : b;
    if (w) w.score++;
  }
  const goals: [number, number] = [ga, gb];
  if (a.score !== b.score) return { a, b, by: "games", goals };
  if (ga !== gb) return { a, b, by: "aggregate", goals };
  return { a, b, by: "level", goals };
}

/* ---------- the list: the newest decades as cards, the older ones a page each ---------- */

/** Cards on the league's list before the older decades move to pages of their own (the page stays near 300 KB: each card carries its logos). */
export const CARD_HEAD = 24;

export const decadeOf = (year: number): number => Math.floor(year / 10) * 10;
/** /nhl/all-star/decade/1990s */
export const decadePath = (lg: string, decade: number): string => `/${lg}/all-star/decade/${decade}s`;
/** The decade an address segment names ("1990s" is 1990), or null. */
export const parseDecade = (seg: string): number | null => (/^\d{3}0s$/.test(seg) ? Number(seg.slice(0, 4)) : null);

/** The events as the list shows them: the newest decades whole until there are at least `head` events, then the older decades as links with their counts. */
export function listSplit(events: readonly AllStarEvent[], head: number = CARD_HEAD): { shown: AllStarEvent[]; older: { decade: number; count: number }[] } {
  const sorted = [...events].sort((a, b) => b.year - a.year || b.event_no - a.event_no);
  const decades = [...new Set(sorted.map((e) => decadeOf(e.year)))];
  const shownDecades = new Set<number>();
  let n = 0;
  for (const d of decades) {
    if (n >= head) break;
    shownDecades.add(d);
    n += sorted.filter((e) => decadeOf(e.year) === d).length;
  }
  return {
    shown: sorted.filter((e) => shownDecades.has(decadeOf(e.year))),
    older: decades.filter((d) => !shownDecades.has(d)).map((decade) => ({ decade, count: sorted.filter((e) => decadeOf(e.year) === decade).length })),
  };
}

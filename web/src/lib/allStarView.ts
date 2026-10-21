/**
 * The All-Star Games of the five leagues and the WNBA (docs/all-star-games.md): the shapes of the api views of migration 145 and the pure helpers the pages share.
 * No server-only imports, so a node script can test it.
 *
 * A result is shown as the list it comes from prints it (the winner first, or the visitor first for the CFL): an All-Star Game has no home side, so it is a line of
 * text, never two teams drawn on a left and a right (lib/sides.ts is for games that have a home side).
 */
import { z } from "zod";

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

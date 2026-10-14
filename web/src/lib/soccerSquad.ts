import type { Squad } from "./soccer.ts";

/**
 * One player of a squad as the squad table takes it (components/SoccerSquadTable.tsx), as a short array so a squad is a few kilobytes of JSON:
 * [person id, name, shirt number, position code, position name, played, started, goals, yellow cards, red cards].
 * No server code, so the lazily loaded squads (components/LazySquad.tsx) and the page that serves them agree on the shape.
 */
export type SquadLine = [id: number, name: string, no: number | null, pos: string | null, posName: string | null, played: number, started: number, goals: number, yellow: number, red: number];

/** The column heads of the squad table, in the reader's language. */
export interface SquadLabels { no: string; player: string; position: string; played: string; started: string; goals: string; yellow: string; red: string }

/** A squad row as a line; `posName` is the position's name in the reader's language, when known. */
export function squadLine(s: Squad, posName: (code: string) => string | null): SquadLine {
  const code = s.position_code?.trim().toUpperCase() || null;
  return [s.person_id, s.player, s.shirt_number, code, code ? posName(code) : null, s.played, s.started, s.goals, s.yellow, s.red];
}

/** The addresses of a team's squad at a tournament: the page (also the fallback of the closed list) and the rows the list loads when it is opened. */
export const squadPath = (year: number, teamSlug: string): string => `/worldcup/${year}/squad/${teamSlug}`;
export const squadRowsPath = (year: number, teamSlug: string): string => `${squadPath(year, teamSlug)}/rows`;

/** The distinct position codes a list of squad rows uses, upper case, for the page's position key. */
export const squadCodes = (squads: readonly Squad[]): string[] => [...new Set(squads.map((s) => s.position_code?.trim().toUpperCase()).filter((c): c is string => !!c))];

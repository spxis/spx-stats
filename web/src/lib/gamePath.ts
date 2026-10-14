/**
 * The address of one game: /nhl/2007-08/game/1234567-boston-bruins-at-montreal-canadiens. The number is the game's id in the archive and is the only part
 * that decides which game it is; the words after it are the two clubs as they were called that season (the names the games view gives), so the address
 * reads well and a link made with the wrong words is sent for good to the right ones. Pure (no server-only imports): the pages, the lists that link to a
 * game and the checks all build it the same way.
 */
import { seasonSeg, slugify } from "./slug.ts";

/** The segment of a game's address: its id, then the away club, "at" and the home club (just the id when either name is unknown). */
export function gameSegment(id: number, away: string | null | undefined, home: string | null | undefined): string {
  const a = away ? slugify(away) : "", h = home ? slugify(home) : "";
  return a && h ? `${id}-${a}-at-${h}` : String(id);
}

/** A game's address. `year` is the season's first year, as in the games view. */
export const gamePath = (lg: string, year: number, id: number, away: string | null | undefined, home: string | null | undefined): string =>
  `/${lg}/${seasonSeg(lg, year)}/game/${gameSegment(id, away, home)}`;

/** The game id an address segment names, or null when it names none (no number first, or one too long to be an id). */
export function parseGameSegment(seg: string): number | null {
  const m = /^([1-9]\d{0,11})(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/.exec(seg);
  return m ? Number(m[1]) : null;
}

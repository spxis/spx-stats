/**
 * Career championships on a roster. The number is api.people.championship_count (the player page's "Championships"):
 * titles won by a team the player was on that season, over the whole career, not only the season on screen.
 */

/** nflverse marks a player released before the season (CUT) or on the practice squad (DEV). The roster table leaves them off. */
const HIDDEN = new Set(["CUT", "DEV"]);

/** The players the roster table draws. Released players and the practice squad stay in the archive, not in this count. A statistics roster has no status, and every player stays. */
export function countedRoster<T>(players: readonly T[]): T[] {
  return players.filter((p) => {
    const status = (p as { status?: string | null }).status;
    return status == null || !HIDDEN.has(status);
  });
}

/** How many of these career totals are at least one championship. A missing count is not a winner. */
export function cupWinnerCount(counts: Iterable<number | null | undefined>): number {
  let n = 0;
  for (const c of counts) if (c != null && c > 0) n += 1;
  return n;
}

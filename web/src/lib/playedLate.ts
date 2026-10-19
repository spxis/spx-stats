/**
 * A game still marked "scheduled" long after it began has been played; the score just has not reached the archive yet. The pages draw
 * "Played · score to come" for it instead of "Scheduled". The server cannot know the time of the visit (a kept page is drawn once for
 * everyone), so the browser decides after mount (components/GameState.tsx).
 */
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Hours after the start (or after the end of the game's date when no start is known) before a scheduled game reads as played. */
export const PLAYED_AFTER_HOURS = 4;
/** Older than this, a game with no result is a gap in the archive, not news: the usual wording stays. */
export const PLAYED_WITHIN_DAYS = 14;
/** The last North American zone a game date ends in. */
export const DEFAULT_ZONE = "America/Los_Angeles";

const parse = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** The zone's offset from UTC, in milliseconds, at an instant. */
function offsetAt(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ms));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - Math.floor(ms / 1000) * 1000;
}

/** The instant a game date (YYYY-MM-DD) ends in a zone: midnight at the start of the next day. Null when the date or zone is not valid. */
export function dateEnd(gameDate: string, timeZone: string = DEFAULT_ZONE): number | null {
  const day = parse(`${gameDate}T00:00:00Z`);
  if (day === null) return null;
  const wall = day + DAY;
  try {
    let guess = wall - offsetAt(wall, timeZone);
    guess = wall - offsetAt(guess, timeZone);
    return guess;
  } catch {
    return null;
  }
}

/**
 * Whether a game that the archive still calls scheduled has in fact been played: more than 4 hours after its start, or after the end
 * of its date in the zone when no start is known. Postponed, cancelled, suspended and every other status are never "played".
 * `status` is the full word ("scheduled") or the tuple's initial ("s").
 */
export function playedScoreMissing(
  game: { status: string; startsAt?: string | null; gameDate: string },
  now: number,
  timeZone?: string,
): boolean {
  if (game.status !== "scheduled" && game.status !== "s") return false;
  const reference = parse(game.startsAt) ?? dateEnd(game.gameDate, timeZone);
  if (reference === null) return false;
  const age = now - reference;
  return age > PLAYED_AFTER_HOURS * HOUR && age <= PLAYED_WITHIN_DAYS * DAY;
}

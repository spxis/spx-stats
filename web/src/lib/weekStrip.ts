/**
 * Which seven days the season page's week strip shows. Pure.
 *
 * A season being played centres on today, three days either side (today is the reader's own day, so the page is drawn once for everyone and this runs in the
 * browser). Before the season starts the strip shows its first seven game days; once it is over, or when today is long past its last game, it shows the last
 * seven playoff game days, ending with the final (the last seven game days if the archive holds no playoff games).
 */

/** A day written 2026-10-14 moved by whole days (calendar arithmetic in UTC, so no daylight saving gets into it). */
const addDay = (iso: string, n: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export type WeekMode = "today" | "first" | "playoffs" | "last";

export interface Week {
  mode: WeekMode;
  /** Up to seven days, oldest first. */
  days: string[];
  /** The day shown open until the reader picks another: today, the first day, or the final's day. */
  chosen: string;
}

/** The days around one day, three either side. */
export const around = (day: string): string[] => [-3, -2, -1, 0, 1, 2, 3].map((n) => addDay(day, n));

/**
 * `games` is every game of the season (any phase) by date and phase code ("p" for a playoff game); `complete` says a champion has been crowned;
 * `today` is the reader's day, or "" before it is known. Null when the season has no games to show.
 */
export function weekOf(games: { date: string; phase: string }[], complete: boolean, today: string): Week | null {
  const dates = [...new Set(games.map((g) => g.date))].sort();
  if (!dates.length) return null;
  const first = dates[0], last = dates[dates.length - 1];
  if (!complete && today) {
    if (today >= addDay(first, -3) && today <= addDay(last, 3)) return { mode: "today", days: around(today), chosen: today };
    if (today < first) return { mode: "first", days: dates.slice(0, 7), chosen: first };
  }
  const playoff = [...new Set(games.filter((g) => g.phase === "p").map((g) => g.date))].sort();
  const pool = playoff.length ? playoff : dates;
  const days = pool.slice(-7);
  return { mode: playoff.length ? "playoffs" : "last", days, chosen: days[days.length - 1] };
}

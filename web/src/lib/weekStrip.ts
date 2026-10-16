/**
 * Calendar-week math and the season page's initial strip anchor. Pure.
 *
 * `weekOf` selects the initial anchor near today, the opening, or the latest playoff/game day. `DayStrip` then renders a fixed calendar week around that
 * anchor. Reader-local today stays in the browser, keeping pages date-independent.
 */

/** A day written 2026-10-14 moved by whole days (calendar arithmetic in UTC, so no daylight saving gets into it). */
const addDay = (iso: string, n: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export type WeekMode = "today" | "first" | "playoffs" | "last";
export type StripLayout = "fixed" | "dynamic";

export type HolidayKey = "scores.holidayNewYear" | "scores.holidayMlk" | "scores.holidayPresidents" | "scores.holidayMemorial"
  | "scores.holidayJuneteenth" | "scores.holidayIndependence" | "scores.holidayLabor" | "scores.holidayIndigenous"
  | "scores.holidayVeterans" | "scores.holidayThanksgiving" | "scores.holidayChristmas";

/** Start of the calendar week containing `day`; Sunday is zero. */
export function calendarWeekStart(day: string, weekStartsOn = 0): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDay(day, -((dow - weekStartsOn + 7) % 7));
}

export function calendarWeek(day: string, weekStartsOn = 0): string[] {
  const first = calendarWeekStart(day, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDay(first, i));
}

export function stripDates(day: string, layout: StripLayout = "fixed", weekStartsOn = 0): string[] {
  return layout === "fixed" ? calendarWeek(day, weekStartsOn) : around(day);
}

/** Small contiguous input window sufficient for either fixed or dynamic rendering. */
export function stripWindow(day: string, weekStartsOn = 0): string[] {
  const fixed = calendarWeek(day, weekStartsOn), dynamic = around(day);
  const first = fixed[0] < dynamic[0] ? fixed[0] : dynamic[0];
  const last = fixed[6] > dynamic[6] ? fixed[6] : dynamic[6];
  const length = (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000;
  return Array.from({ length: length + 1 }, (_, i) => addDay(first, i));
}

export type WeekDirection = "past" | "future" | "current" | "unknown";
export function weekDirection(day: string, today: string, weekStartsOn = 0): WeekDirection {
  if (!day || !today) return "unknown";
  const start = calendarWeekStart(day, weekStartsOn), current = calendarWeekStart(today, weekStartsOn);
  return start < current ? "past" : start > current ? "future" : "current";
}

const ymd = (year: number, month: number, date: number): string => `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
const nthWeekday = (year: number, month: number, weekday: number, nth: number): string => {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return ymd(year, month, 1 + (weekday - first + 7) % 7 + (nth - 1) * 7);
};
const lastWeekday = (year: number, month: number, weekday: number): string => {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dow = new Date(Date.UTC(year, month - 1, last)).getUTCDay();
  return ymd(year, month, last - (dow - weekday + 7) % 7);
};
const observed = (day: string): string => {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return dow === 6 ? addDay(day, -1) : dow === 0 ? addDay(day, 1) : day;
};

/** US federal holiday dates and observed weekdays, including adjacent-year dates for week edges. */
export function usHolidayDates(years: number[]): Map<string, HolidayKey> {
  const out = new Map<string, HolidayKey>();
  const fixed: [number, number, HolidayKey][] = [
    [1, 1, "scores.holidayNewYear"], [6, 19, "scores.holidayJuneteenth"], [7, 4, "scores.holidayIndependence"],
    [11, 11, "scores.holidayVeterans"], [12, 25, "scores.holidayChristmas"],
  ];
  for (const year of [...new Set(years)]) {
    for (const [month, date, key] of fixed) {
      const actual = ymd(year, month, date);
      out.set(actual, key);
      out.set(observed(actual), key);
    }
    const variable: [string, HolidayKey][] = [
      [nthWeekday(year, 1, 1, 3), "scores.holidayMlk"],
      [nthWeekday(year, 2, 1, 3), "scores.holidayPresidents"],
      [lastWeekday(year, 5, 1), "scores.holidayMemorial"],
      [nthWeekday(year, 9, 1, 1), "scores.holidayLabor"],
      [nthWeekday(year, 10, 1, 2), "scores.holidayIndigenous"],
      [nthWeekday(year, 11, 4, 4), "scores.holidayThanksgiving"],
    ];
    for (const [day, key] of variable) out.set(day, key);
  }
  return out;
}

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

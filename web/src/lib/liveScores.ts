
/**
 * The live score layer as the page sees it: provisional results the allowed sources have given before the archive settles the game
 * (written on the NAS by scripts/daily/live.py into Turso's live_score; never part of a data release). Nothing here fetches anything.
 */

/** Days a row lives (the writer deletes older ones), and how far ahead of today a day can have one. */
export const LIVE_KEEP_DAYS = 7;
export const LIVE_AHEAD_DAYS = 1;
/** The browser asks again no faster than this, and never from a hidden tab. */
export const LIVE_POLL_MS = 60_000;

/** A calendar day (YYYY-MM-DD) moved by n days. */
const addDay = (iso: string, n: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export const LIVE_STATES = ["in_progress", "final"] as const;

export interface LiveSource { s: string; h: number; a: number; at: string }
/** One live row as the route and the page hold it. The zod schema that reads it from Turso is in ./liveRowSchema.ts (zod stays out of the browser). */
export interface LiveRow {
  game_id: number;
  status: (typeof LIVE_STATES)[number];
  home_score: number | null;
  away_score: number | null;
  overtime: boolean | null;
  period: string | null;
  disputed: boolean;
  ready: boolean;
  n_sources: number;
  n_agree: number;
  confirm_agree: number;
  confirm_differ: number;
  sources: LiveSource[];
  fetched_at: string;
}

/** What the route sends: the rows of one league and day, nothing else. */
export interface LiveAnswer { rows: LiveRow[] }

/** Whether a day can have live rows at all (the writer keeps 7 days; a day further ahead has none). Outside it nobody reads Turso. */
export function inLiveWindow(day: string, today: string): boolean {
  return day >= addDay(today, -LIVE_KEEP_DAYS) && day <= addDay(today, LIVE_AHEAD_DAYS);
}

/** The games of a page that a live row could still change: the ones the archive does not hold as final. */
export function liveCandidates(games: readonly { game_id: number; status: string; home_score: number | null; away_score: number | null }[]): number[] {
  return games.filter((g) => !(g.status === "final" && g.home_score != null && g.away_score != null)).map((g) => g.game_id);
}

/** How sure the sources are: one source, all agree, a majority agrees, or the sources tie (no score is picked). */
export type Confidence = "single" | "all" | "partial" | "disputed";

export function confidence(r: Pick<LiveRow, "disputed" | "n_sources" | "n_agree">): Confidence {
  if (r.disputed) return "disputed";
  if (r.n_sources <= 1) return "single";
  return r.n_agree >= r.n_sources ? "all" : "partial";
}

/** Everything a scoreboard card needs to draw a live row. There is no control in it: a visitor gets the badge and the sources, nothing to press. */
export interface LiveView {
  state: "in_progress" | "final";
  home: number | null;
  away: number | null;
  overtime: boolean;
  confidence: Confidence;
  agree: number;
  of: number;
  differ: number;
  outsideAgree: number;
  outsideDiffer: number;
  sources: LiveSource[];
}

export function liveView(r: LiveRow): LiveView {
  return {
    state: r.status, home: r.disputed ? null : r.home_score, away: r.disputed ? null : r.away_score, overtime: r.overtime === true,
    confidence: confidence(r), agree: r.n_agree, of: r.n_sources, differ: r.n_sources - r.n_agree,
    outsideAgree: r.confirm_agree, outsideDiffer: r.confirm_differ, sources: r.sources,
  };
}

/** The rows by game id, for the games the page asked about only. */
export function byGame(rows: readonly LiveRow[], ids: readonly number[]): Map<number, LiveRow> {
  const want = new Set(ids);
  return new Map(rows.filter((r) => want.has(r.game_id)).map((r) => [r.game_id, r]));
}

/** Whether the browser should ask again: a game of the page has no final live row yet, and the day is today's or next to it. */
export function shouldPoll(ids: readonly number[], rows: ReadonlyMap<number, LiveRow>, day: string, today: string): boolean {
  if (day < addDay(today, -1) || day > addDay(today, 1)) return false;
  return ids.some((id) => rows.get(id)?.status !== "final");
}

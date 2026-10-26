/**
 * The small, dependency-free part of the admin refresh: scopes, the main five, words for a request, the progress shape and the rule for who sees the
 * controls. The scoreboard's shell imports only this file, so a visitor's page does not carry the source registry (lib/liveSources.ts) or the rules
 * that check a request (lib/liveRequest.ts); both load when an admin presses a button.
 */

export const LIVE_SCOPES = ["game", "day", "league", "main5", "all"] as const;
export type LiveScope = (typeof LIVE_SCOPES)[number];

/** The leagues the daily job and the live refresh load (scripts/daily/run.py LEAGUES). "All sports" is these until another sport has a score parser. */
export const MAIN_FIVE = ["nhl", "nba", "mlb", "nfl", "cfl"] as const;
export type MainLeague = (typeof MAIN_FIVE)[number];
export const isMainLeague = (v: unknown): v is MainLeague => typeof v === "string" && (MAIN_FIVE as readonly string[]).includes(v);

/** How often the page may ask how a request is going (never faster than 15 seconds, never from a hidden tab). */
export const PROGRESS_POLL_MS = 15_000;
/** Longest the page keeps asking for one request. */
export const PROGRESS_GIVE_UP_MS = 20 * 60_000;

/** Words for a request, in the progress line and the run log. */
export function describe(req: { scope: LiveScope; league: MainLeague | null; day: string | null; game: number | null }): string {
  switch (req.scope) {
    case "game": return `game ${req.game}`;
    case "day": return `${(req.league ?? "").toUpperCase()} games on ${req.day}`;
    case "league": return (req.league ?? "").toUpperCase();
    case "main5": return "the main five";
    default: return "all sports";
  }
}

/** Words for a request row of the dashboard (scope, league, day or game as the database holds them). */
export function describeRow(q: { scope?: string | null; league?: string | null; game_day?: string | null; game_id?: number | null }): string {
  const scope = (LIVE_SCOPES as readonly string[]).includes(q.scope ?? "") ? (q.scope as LiveScope) : null;
  if (!scope) return q.league ? q.league.toUpperCase() : "all leagues";
  return describe({ scope, league: isMainLeague(q.league) ? q.league : null, day: q.game_day ?? null, game: q.game_id ?? null });
}

/** Whether the controls are shown at all: only to a signed-in admin. The pages are kept and drawn once for everyone, so this is decided in the browser, from /api/me. */
export const showLiveControls = (account: { user: { admin: boolean } | null } | null | undefined): boolean => account?.user?.admin === true;

export type ProgressStatus = "waiting" | "running" | "done" | "nothing" | "failed";
export interface Progress {
  status: ProgressStatus;
  summary: string | null;
  /** [core game id, outcome, reason] per game asked about. */
  items: [number, string, string][];
}
export const isFinished = (s: ProgressStatus): boolean => s === "done" || s === "nothing" || s === "failed";

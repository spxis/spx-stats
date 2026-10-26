import { LIVE_SCOPES, MAIN_FIVE, type LiveScope, type MainLeague, isMainLeague } from "./liveScope.ts";
import { inLiveWindow } from "./liveScores.ts";
import { SOURCE_REGISTRY, type SourceRow } from "./liveSources.ts";

export { LIVE_SCOPES, MAIN_FIVE, PROGRESS_GIVE_UP_MS, PROGRESS_POLL_MS, describe, describeRow, isMainLeague, type LiveScope, type MainLeague } from "./liveScope.ts";

/**
 * An admin's refresh of the live score layer, as data: what can be asked, which sources may be ticked, what a request is expected to cost.
 * No fetching here and nothing server-only: the pages, the dialog and the route all use the same rules (the database and the runner check them again).
 */

/** The sources that have a score parser today (scripts/daily/run.py LIVE_SOURCES). The others in the registry cannot give a score yet. */
export const SCORE_PARSERS = ["wikipedia", "balldontlie", "nflverse"] as const;

export interface LiveRequest {
  scope: LiveScope;
  league: MainLeague | null;
  day: string | null;
  game: number | null;
  /** Source ids ticked; always explicit and sorted once parsed. */
  sources: string[];
  /** The slow path too (daily job, release; the click counts as the approval). Only for a whole league, the main five or all sports. */
  settle: boolean;
}

export type Parsed = { ok: true; value: LiveRequest } | { ok: false; error: string };

const bad = (error: string): Parsed => ({ ok: false, error });
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (v: string): boolean => DAY.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** The registry row of a source id, or undefined. */
export const sourceRow = (id: string): SourceRow | undefined => SOURCE_REGISTRY.find((s) => s.id === id);

/** Whether a source may be ticked: green or grey in the registry (the terms gate) and it has a score parser. */
export const isTickable = (s: SourceRow): boolean => s.selectable && (SCORE_PARSERS as readonly string[]).includes(s.id);

/** Whether a source reads a league's scores. A source with no league list reads any. */
export const covers = (s: SourceRow, league: string | null): boolean => league === null || s.leagues.length === 0 || s.leagues.includes(league);

/** The sources to show in the picker: the ones that can be ticked, and every other one greyed out with why. */
export function sourceChoices(): { tickable: SourceRow[]; greyed: SourceRow[] } {
  const tickable = SOURCE_REGISTRY.filter(isTickable);
  // data sources with no league (Wikidata, OpenStreetMap, Retrosheet...) give no scores and are not listed at all
  const greyed = SOURCE_REGISTRY.filter((s) => !isTickable(s) && (s.leagues.length > 0 || s.tier === "red" || s.tier === "red-confirm"));
  return { tickable, greyed };
}

/** Why a source is greyed out, in a sentence: its terms note for a red or confirm-only one, else why it cannot be read yet. */
export function whyGreyed(s: SourceRow): string {
  if (s.tier === "red-confirm") return `Confirm-only, never stored or ticked here. ${s.reason}`;
  if (s.tier === "red") return `Not allowed. ${s.reason}`;
  if (s.notes) return s.notes;
  return "No score parser for this source yet.";
}

/**
 * Check a request that came from a form or a fetch. Everything is checked as if it were forged: the scope, the league, the day (inside the days the live
 * layer keeps), the game id, and each source against the registry (only green or grey, only ones with a parser). `today` is YYYY-MM-DD in UTC.
 */
export function parseLiveRequest(raw: unknown, today: string): Parsed {
  if (typeof raw !== "object" || raw === null) return bad("That request was not valid.");
  const r = raw as Record<string, unknown>;
  const scope = r.scope;
  if (typeof scope !== "string" || !(LIVE_SCOPES as readonly string[]).includes(scope)) return bad("Choose what to refresh.");
  const settle = r.settle === true;
  let league: MainLeague | null = null;
  let day: string | null = null;
  let game: number | null = null;

  if (scope === "game") {
    const n = typeof r.game === "number" ? r.game : typeof r.game === "string" && /^\d{1,10}$/.test(r.game.trim()) ? Number(r.game.trim()) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > 2_147_483_647) return bad("Give the game number (the number in the game's address).");
    game = n;
  } else if (scope === "day" || scope === "league") {
    if (!isMainLeague(r.league)) return bad("Choose a league.");
    league = r.league;
    if (scope === "day") {
      if (typeof r.day !== "string" || !validDay(r.day)) return bad("Choose a day.");
      if (!inLiveWindow(r.day, today)) return bad("Only the last week and tomorrow can be refreshed.");
      day = r.day;
    }
  } else if (r.league != null && r.league !== "") return bad("That request was not valid.");

  if (settle && (scope === "game" || scope === "day")) return bad("The permanent record is updated a whole league at a time: choose a league, the main five or all sports.");

  const ticked = Array.isArray(r.sources) ? r.sources : null;
  if (ticked === null || ticked.length === 0 || ticked.length > 8) return bad("Tick at least one source.");
  const ids = [...new Set(ticked)];
  for (const id of ids) {
    if (typeof id !== "string" || !/^[a-z0-9_]{2,30}$/.test(id)) return bad("That request was not valid.");
    const s = sourceRow(id);
    if (!s) return bad(`${id} is not a source this site knows.`);
    if (!isTickable(s)) return bad(`${s.name} cannot be ticked: ${whyGreyed(s)}`);
  }
  return { ok: true, value: { scope: scope as LiveScope, league, day, game, sources: (ids as string[]).sort(), settle } };
}

/** The leagues a request covers. */
export const leaguesOf = (league: MainLeague | null, scope: LiveScope): readonly string[] => (scope === "league" || scope === "day" ? [league as string] : scope === "game" ? [] : MAIN_FIVE);

/** Clubs per league (the pages a league-wide refresh may need to read). Round numbers for an estimate only. */
const CLUBS: Record<MainLeague, number> = { nhl: 32, nba: 30, mlb: 30, nfl: 32, cfl: 9 };
const REV_BATCH = 50;
const CONTENT_BATCH = 10;

export interface Cost {
  source: string;
  name: string;
  /** requests at least, at most (a page is downloaded only when its revision changed). */
  min: number;
  max: number;
  /** seconds between two requests to this source. */
  spacing: number;
  /** the longest the requests take, spacing included. */
  seconds: number;
}

/**
 * What a request is expected to ask of each source it reads, before the click. `games` is the number of games the scope covers when the page knows
 * it (a day's list); a league-wide refresh reads every club's season article. It is an honest estimate, not a promise: the shared limiter keeps what
 * any run fetched in the last minute and a page that has not changed is not downloaded.
 */
export function estimate(req: Pick<LiveRequest, "scope" | "league" | "sources">, games = 1): Cost[] {
  const leagues = req.scope === "game" ? [] : leaguesOf(req.league, req.scope);
  const rows: Cost[] = [];
  for (const id of req.sources) {
    const s = sourceRow(id);
    if (!s) continue;
    const spacing = s.spacing ?? 1;
    let min = 0;
    let max = 0;
    if (id === "wikipedia") {
      const pages = req.scope === "game" ? 2 : req.scope === "day" ? Math.min(2 * Math.max(1, games), CLUBS[req.league as MainLeague]) : leagues.reduce((n, l) => n + CLUBS[l as MainLeague] + (l === "mlb" ? 1 : 0), 0);
      min = Math.ceil(pages / REV_BATCH);
      max = min + Math.ceil(pages / CONTENT_BATCH);
    } else if (id === "balldontlie") {
      const n = req.scope === "game" ? 1 : leagues.filter((l) => covers(s, l)).length;
      min = n === 0 ? 0 : n;
      max = n === 0 ? 0 : n * 3;
    } else if (id === "nflverse") {
      const n = req.scope === "game" || leagues.includes("nfl") ? 1 : 0;
      min = n;
      max = n;
    }
    if (max > 0) rows.push({ source: id, name: s.name, min, max, spacing, seconds: Math.round(max * spacing) });
  }
  return rows;
}

/** One sentence for the dialog: the slowest source decides, and the runner looks for requests once a minute. */
export function estimateText(costs: Cost[]): string {
  if (costs.length === 0) return "No request to any source is expected.";
  const slowest = Math.max(...costs.map((c) => c.seconds));
  const lines = costs.map((c) => `${c.name}: ${c.min === c.max ? c.min : `${c.min} to ${c.max}`} request${c.max === 1 ? "" : "s"}, ${c.spacing} s apart`);
  const minutes = Math.max(1, Math.ceil(slowest / 60));
  return `${lines.join("; ")}. Up to about ${minutes} minute${minutes === 1 ? "" : "s"} of fetching after the runner picks it up (it looks once a minute).`;
}

/** The choices of the scores update dialog on the data page, as the request the form means. `today` is YYYY-MM-DD in UTC. */
export function rawFromForm(form: { get(name: string): unknown; getAll(name: string): unknown[] }, today: string): unknown {
  const pick = form.get("granularity");
  const league = typeof form.get("league") === "string" ? form.get("league") : null;
  const sources = form.getAll("sources");
  switch (pick) {
    case "all": return { scope: "all", sources, settle: true };
    case "main5": return { scope: "main5", sources, settle: true };
    case "league": return { scope: "league", league, sources, settle: true };
    case "day": return { scope: "day", league, day: today, sources, settle: false };
    case "game": return { scope: "game", game: form.get("game"), sources, settle: false };
    default: return null;
  }
}

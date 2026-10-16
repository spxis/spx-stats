/** One franchise's season as its own games: each game from the team's side, with the running record of its part of the season. */
import type { GameRow, StandingRow } from "./api/types";
import type { ClubTeam, GameTuple, Phase } from "./season";

export type Result = "W" | "L" | "T" | "OTL" | "";

export interface TeamGame {
  id: number;
  date: string;
  ph: Phase;
  loc: "Home" | "Away";
  oppF: number | null;
  oppName: string | null;
  mine: number | null;
  theirs: number | null;
  /** "" for a game with no result. */
  res: Result;
  ot: boolean;
  /** Points for minus against; null with no result. */
  margin: number | null;
  src: string;
  v: number | null;
  /** The record after this game within its part of the season: 12–7, 12–7–1, 12–7–1–3. */
  rec: string;
  recPct: number | null;
  /** The game as the season page's calendar and game list draw it. */
  tuple: GameTuple;
  /** The NHL's numeric game id, when the row carries one. */
  nhlId: number | null;
  /** The nflverse week, when the row carries one. */
  nflWeek: number | null;
  /** Retrosheet home code and game number, when the row carries one. */
  retroBox: string | null;
  /** core.game status, so game notes can wait until the game has started. */
  status: string;
  /** Scheduled start, UTC, when a source recorded one. */
  startsAt: string | null;
}

const PHASE: Record<string, Phase> = { regular: "r", playoffs: "p", preseason: "s", all_star: "a" };

/**
 * `games` are in the order the page asks to show them; the running records are worked out in the order played.
 * An overtime loss is only told apart from a loss in a league whose standings count them (`standings.otl`).
 */
export function deriveTeamGames(games: GameRow[], franchise: number, standing: StandingRow | null): TeamGame[] {
  const chrono = [...games].sort((a, b) => (a.game_date < b.game_date ? -1 : a.game_date > b.game_date ? 1 : a.game_id - b.game_id));
  const tally: Record<string, { w: number; l: number; t: number; o: number }> = {};
  const out = new Map<GameRow, TeamGame>();
  for (const g of chrono) {
    const home = g.home_f === franchise;
    const fin = g.status === "final";
    const mine = home ? g.home_score : g.away_score, theirs = home ? g.away_score : g.home_score;
    let res: Result = "";
    if (fin && mine != null && theirs != null) res = mine > theirs ? "W" : mine < theirs ? (g.overtime && standing?.otl ? "OTL" : "L") : "T";
    const c = (tally[g.phase] ??= { w: 0, l: 0, t: 0, o: 0 });
    if (res === "W") c.w++; else if (res === "L") c.l++; else if (res === "T") c.t++; else if (res === "OTL") c.o++;
    const played = c.w + c.l + c.t + c.o;
    const ph = PHASE[g.phase] || "r";
    out.set(g, {
      id: g.game_id, date: g.game_date, ph, loc: home ? "Home" : "Away",
      oppF: home ? g.away_f : g.home_f, oppName: home ? g.away : g.home,
      mine, theirs, res, ot: !!g.overtime, margin: res && mine != null && theirs != null ? mine - theirs : null,
      src: g.source, v: g.checked,
      rec: res ? `${c.w}–${c.l}${standing?.t || c.t ? `–${c.t}` : ""}${standing?.otl || c.o ? `–${c.o}` : ""}` : "",
      recPct: res && played ? (c.w + c.t / 2) / played : null,
      tuple: [g.game_date, g.away_id, g.away_score, g.home_score, g.home_id, ph, g.status[0] ?? "", g.source, g.overtime ? 1 : 0, g.checked, g.game_id],
      nhlId: g.nhl_id ?? null,
      nflWeek: g.nfl_week ?? null,
      retroBox: g.retro_box ?? null,
      status: g.status,
      startsAt: g.starts_at ?? null,
    });
  }
  return games.map((g) => out.get(g)!);
}

/** The teams in a list of games, for the game list's team links. */
export function teamsIn(games: GameRow[]): ClubTeam[] {
  const m = new Map<number, ClubTeam>();
  for (const g of games) {
    m.set(g.home_id, { id: g.home_id, f: g.home_f, name: g.home });
    m.set(g.away_id, { id: g.away_id, f: g.away_f, name: g.away });
  }
  return [...m.values()];
}

export interface RecordTotals { w: number; l: number; t: number; otl: number }

/** The regular-season record: the standings' own when they hold one, else counted from the games. */
export function seasonRecord(games: TeamGame[], standing: StandingRow | null): RecordTotals {
  if (standing && standing.w != null) return { w: standing.w, l: standing.l ?? 0, t: standing.t ?? 0, otl: standing.otl ?? 0 };
  const reg = games.filter((g) => g.ph === "r");
  const n = (r: Result) => reg.filter((g) => g.res === r).length;
  return { w: n("W"), l: n("L"), t: n("T"), otl: n("OTL") };
}

/** The games with a result in the order played: the order the running line and the game numbers count them. */
export function playedInOrder(games: TeamGame[]): TeamGame[] {
  return games.filter((g) => g.res !== "").sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
}

/** The columns of the games table, in order: the keys a ?sort= may name. */
export const TEAM_GAME_SORT_KEYS = ["n", "date", "loc", "opp", "score", "res", "ot", "rec", "src"] as const;

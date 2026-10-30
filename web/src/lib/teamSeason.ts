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
  /** The NHL's numeric game id, when the row carries one (left out of the page otherwise). */
  nhlId?: number;
  /** The nflverse week, when the row carries one. */
  nflWeek?: number;
  /** Retrosheet home code and game number, when the row carries one. */
  retroBox?: string;
  /** core.game status, so game notes can wait until the game has started. */
  status: string;
  /** Scheduled start, UTC, when a source recorded one. */
  startsAt?: string;
}

const PHASE: Record<string, Phase> = { regular: "r", playoffs: "p", preseason: "s", all_star: "a" };

/**
 * A game of one club's season as it travels to the page: [date, away id, away score, home score, home id, phase, status, source, overtime 0|1, checked, game id,
 * then the NHL's game id, the nflverse week, the Retrosheet box and the scheduled start], the last four left out when a game has none after them.
 * The page works the rest out (which side is the club's, the result, the running record) with `teamGamesFromLines`.
 */
export type TeamLine = [
  date: string, away: number, awayScore: number | null, homeScore: number | null, home: number, phase: Phase, status: string, source: string,
  overtime: 0 | 1, checked: number | null, id: number, nhlId?: number | null, nflWeek?: number | null, retroBox?: string | null, startsAt?: string | null,
];

/** A game row as a line. */
export function gameLine(g: GameRow): TeamLine {
  const tail = [g.nhl_id ?? null, g.nfl_week ?? null, g.retro_box || null, g.starts_at || null];
  while (tail.length && tail[tail.length - 1] == null) tail.pop();
  return [g.game_date, g.away_id, g.away_score, g.home_score, g.home_id, PHASE[g.phase] || "r", g.status, g.source, g.overtime ? 1 : 0, g.checked, g.game_id, ...tail] as TeamLine;
}

/**
 * The club's games from their lines, in the order the lines come; the running records are worked out in the order played. `f` is the club's franchise and `teams`
 * name every team id that appears in a line. An overtime loss is only told apart from a loss in a league whose standings count them (`otl`); `tie` says the standings hold ties.
 */
export function teamGamesFromLines(lines: readonly TeamLine[], o: { f: number; teams: ReadonlyMap<number, ClubTeam>; otl: boolean; tie: boolean }): TeamGame[] {
  const chrono = [...lines].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[10] - b[10]));
  const tally: Record<string, { w: number; l: number; t: number; o: number }> = {};
  const out = new Map<TeamLine, TeamGame>();
  for (const l of chrono) {
    const [date, awayId, awayScore, homeScore, homeId, ph, status, source, overtime, checked, id, nhlId, nflWeek, retroBox, startsAt] = l;
    const home = o.teams.get(homeId)?.f === o.f;
    const opp = o.teams.get(home ? awayId : homeId);
    const fin = status === "final";
    const mine = home ? homeScore : awayScore, theirs = home ? awayScore : homeScore;
    let res: Result = "";
    if (fin && mine != null && theirs != null) res = mine > theirs ? "W" : mine < theirs ? (overtime && o.otl ? "OTL" : "L") : "T";
    const c = (tally[ph] ??= { w: 0, l: 0, t: 0, o: 0 });
    if (res === "W") c.w++; else if (res === "L") c.l++; else if (res === "T") c.t++; else if (res === "OTL") c.o++;
    const played = c.w + c.l + c.t + c.o;
    out.set(l, {
      id, date, ph, loc: home ? "Home" : "Away",
      oppF: opp?.f ?? null, oppName: opp?.name ?? null,
      mine, theirs, res, ot: !!overtime, margin: res && mine != null && theirs != null ? mine - theirs : null,
      src: source, v: checked,
      rec: res ? `${c.w}–${c.l}${o.tie || c.t ? `–${c.t}` : ""}${o.otl || c.o ? `–${c.o}` : ""}` : "",
      recPct: res && played ? (c.w + c.t / 2) / played : null,
      tuple: [date, awayId, awayScore, homeScore, homeId, ph, status[0] ?? "", source, overtime, checked, id],
      ...(nhlId != null ? { nhlId } : {}),
      ...(nflWeek != null ? { nflWeek } : {}),
      ...(retroBox ? { retroBox } : {}),
      status,
      ...(startsAt ? { startsAt } : {}),
    });
  }
  return lines.map((l) => out.get(l)!);
}

/**
 * `games` are in the order the page asks to show them; the running records are worked out in the order played.
 * An overtime loss is only told apart from a loss in a league whose standings count them (`standings.otl`).
 */
export function deriveTeamGames(games: GameRow[], franchise: number, standing: StandingRow | null): TeamGame[] {
  return teamGamesFromLines(games.map(gameLine), { f: franchise, teams: new Map(teamsIn(games).map((t) => [t.id, t])), otl: !!standing?.otl, tie: !!standing?.t });
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

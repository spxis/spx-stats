/**
 * The record-against-each-opponent heat map on a team page: the data it is sent and the sums it shows. Pure (no server or browser code), so the
 * page, the JSON route and the tests share it. A cell is one club-opponent-season-phase row of `api.team_opponent_season` (migration 125).
 */

/** One opponent: a franchise in a league, with the address of its page and of the pair's head-to-head page (no season). `name` is null when the archive has none. */
export interface HeatOpp { f: number; lg: string; name: string | null; href: string; pair: string }

/** [opponent index, season year, phase (0 regular, 1 playoffs), games, wins, losses, ties, overtime losses, for, against] */
export type HeatCell = [number, number, 0 | 1, number, number, number, number, number, number, number];

export interface OpponentHeatView {
  /** The page's league. */
  lg: string;
  /** Every league the club has rows in, the page's first. */
  leagues: string[];
  opps: HeatOpp[];
  cells: HeatCell[];
}

export type HeatPhase = "all" | "regular" | "playoffs";
export type HeatSort = "pct" | "games" | "name";
export type HeatDir = "asc" | "desc";

export interface Rec { gp: number; w: number; l: number; t: number; otl: number; pf: number; pa: number }
export const emptyRec = (): Rec => ({ gp: 0, w: 0, l: 0, t: 0, otl: 0, pf: 0, pa: 0 });

/** The share of games won, a tie counting half and an overtime loss as a loss; null when no games. */
export const winShare = (r: Rec): number | null => (r.gp ? (r.w + r.t / 2) / r.gp : null);

function addCell(r: Rec, c: HeatCell): void {
  r.gp += c[3]; r.w += c[4]; r.l += c[5]; r.t += c[6]; r.otl += c[7]; r.pf += c[8]; r.pa += c[9];
}

export interface HeatRow {
  opp: HeatOpp;
  /** The opponent's index in the view (its stable key). */
  key: number;
  life: Rec;
  /** The record in each season it was met, by year. */
  by: Map<number, Rec>;
}

export interface HeatGrid {
  rows: HeatRow[];
  /** Every season (year) from the first meeting to the last, so a gap in the years is a gap in the chart. */
  years: number[];
}

/** The rows and seasons for a choice of part of the season and league (null = every league). Opponents with no game in the choice are left out. */
export function buildGrid(view: OpponentHeatView, phase: HeatPhase, league: string | null): HeatGrid {
  const rows = new Map<number, HeatRow>();
  let y0 = Infinity, y1 = -Infinity;
  for (const c of view.cells) {
    if (phase === "regular" && c[2] !== 0) continue;
    if (phase === "playoffs" && c[2] !== 1) continue;
    const opp = view.opps[c[0]];
    if (!opp || (league && opp.lg !== league) || c[3] <= 0) continue;
    let row = rows.get(c[0]);
    if (!row) rows.set(c[0], (row = { opp, key: c[0], life: emptyRec(), by: new Map() }));
    let r = row.by.get(c[1]);
    if (!r) row.by.set(c[1], (r = emptyRec()));
    addCell(r, c);
    addCell(row.life, c);
    if (c[1] < y0) y0 = c[1];
    if (c[1] > y1) y1 = c[1];
  }
  const years: number[] = [];
  for (let y = y0; y <= y1; y++) years.push(y);
  return { rows: [...rows.values()], years };
}

/** The usual way round for each sort: best record first, most games first, A to Z. */
export const defaultDir = (s: HeatSort): HeatDir => (s === "name" ? "asc" : "desc");

/** Rows ordered by lifetime win share, games played or name; ties fall back to games then name so the order never jumps. */
export function sortRows(rows: readonly HeatRow[], sort: HeatSort, dir: HeatDir, fallback: (opp: HeatOpp) => string): HeatRow[] {
  const nameOf = (r: HeatRow) => r.opp.name ?? fallback(r.opp);
  const sign = dir === "asc" ? 1 : -1;
  const byName = (a: HeatRow, b: HeatRow) => nameOf(a).localeCompare(nameOf(b), "en");
  return [...rows].sort((a, b) => {
    const c = sort === "name" ? byName(a, b)
      : sort === "games" ? a.life.gp - b.life.gp
        : (winShare(a.life) ?? 0) - (winShare(b.life) ?? 0);
    return sign * c || b.life.gp - a.life.gp || byName(a, b) || a.key - b.key;
  });
}

/** The least games against an opponent that each choice of the "fewest games" control asks for. */
export const MIN_GAMES = [0, 5, 10, 25, 50] as const;

/** The state the toggles keep in the address (?hphase=&hsort=&hdir=&hlg=&hmin=); a default is left out. */
export interface HeatChoice { phase: HeatPhase; sort: HeatSort; dir: HeatDir; league: string | null; min: number }

const PHASE_CODE: Record<HeatPhase, string | null> = { all: null, regular: "r", playoffs: "p" };

export function readChoice(search: string, leagues: readonly string[], page: string): HeatChoice {
  const q = new URLSearchParams(search);
  const ph = q.get("hphase");
  const phase: HeatPhase = ph === "r" ? "regular" : ph === "p" ? "playoffs" : "all";
  const s = q.get("hsort");
  const sort: HeatSort = s === "games" || s === "name" ? s : "pct";
  const d = q.get("hdir");
  const dir: HeatDir = d === "asc" || d === "desc" ? d : defaultDir(sort);
  const lg = q.get("hlg");
  const league = lg === "all" ? null : lg && leagues.includes(lg) ? lg : page;
  const m = Number(q.get("hmin"));
  const min = (MIN_GAMES as readonly number[]).includes(m) ? m : 0;
  return { phase, sort, dir, league, min };
}

/** The address changes that write a choice (null removes a key). */
export function choiceQuery(c: HeatChoice, page: string): Record<string, string | null> {
  return {
    hphase: PHASE_CODE[c.phase],
    hsort: c.sort === "pct" ? null : c.sort,
    hdir: c.dir === defaultDir(c.sort) ? null : c.dir,
    hlg: c.league === page ? null : c.league ?? "all",
    hmin: c.min ? String(c.min) : null,
  };
}

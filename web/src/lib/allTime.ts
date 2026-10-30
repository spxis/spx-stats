/**
 * A league's all-time table, worked out from its team seasons (api.standings) and playoff games.
 * Pure: the page fetches, this adds up. A franchise is the unit, as on the team page.
 */

export type AllTimePhase = "r" | "p" | "all";

export interface Line { gp: number; w: number; l: number; t: number; otl: number; pf: number; pa: number }

export const emptyLine = (): Line => ({ gp: 0, w: 0, l: 0, t: 0, otl: 0, pf: 0, pa: 0 });

export function addLines(a: Line, b: Line): Line {
  return { gp: a.gp + b.gp, w: a.w + b.w, l: a.l + b.l, t: a.t + b.t, otl: a.otl + b.otl, pf: a.pf + b.pf, pa: a.pa + b.pa };
}

/** Winning share: a tie counts half a win, an overtime loss is a loss (the definition of the team page). */
export function share(r: { w: number; l: number; t: number; otl: number }): number | null {
  const n = r.w + r.l + r.t + r.otl;
  return n ? (r.w + r.t / 2) / n : null;
}

export interface SeasonMark {
  year: number;
  gp: number; w: number; l: number; t: number; otl: number;
  share: number | null;
  champion: boolean;
  /** Played a full-enough schedule to be a candidate for best or worst season. */
  eligible: boolean;
}

export interface Franchise {
  f: number;
  name: string;
  former: string[];
  abbr: string;
  first: number;
  last: number;
  active: boolean;
  seasons: number;
  reg: Line;
  po: Line;
  playoffs: number;
  titles: number[];
  years: SeasonMark[];
  best: SeasonMark | null;
  worst: SeasonMark | null;
}

export const lineOf = (t: Franchise, phase: AllTimePhase): Line => (phase === "r" ? t.reg : phase === "p" ? t.po : addLines(t.reg, t.po));

export interface StandLine { year: number; franchise_id: number; team: string | null; gp: number | null; w: number | null; l: number | null; t: number | null; otl: number | null; pf: number | null; pa: number | null }
export interface PlayoffGame { year: number; away_f: number | null; home_f: number | null; away_score: number | null; home_score: number | null }
export interface NameLine { franchise_id: number; name: string }

/** A franchise's playoff record: the sums api.playoff_franchise_pack holds (migration 188), or `playoffTotals` of the games. */
export interface PlayoffTotals { f: number; gp: number; w: number; l: number; t: number; pf: number; pa: number; years: number }

export interface Inputs {
  stand: StandLine[];
  playoffs: PlayoffTotals[];
  champs: { year: number; franchise_id: number }[];
  /** In the order of the team page: oldest first, so the last is the current name. */
  names: NameLine[];
  abbr: (f: number, year: number, name: string) => string;
}

/** The same row twice (a few 1938 MLB clubs are in the view twice) counts once. */
function distinct(rows: StandLine[]): StandLine[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = [r.year, r.franchise_id, r.gp, r.w, r.l, r.t, r.otl, r.pf, r.pa].join("|");
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

/** Each franchise's playoff games, wins, losses, ties, for, against and seasons played, added up from the games (a game with no score is not counted). */
export function playoffTotals(games: PlayoffGame[]): PlayoffTotals[] {
  const po = new Map<number, { line: Line; years: Set<number> }>();
  const bump = (f: number | null, year: number, mine: number, theirs: number) => {
    if (f == null) return;
    const e = po.get(f) ?? { line: emptyLine(), years: new Set<number>() };
    e.years.add(year);
    e.line.gp += 1; e.line.pf += mine; e.line.pa += theirs;
    if (mine > theirs) e.line.w += 1; else if (mine < theirs) e.line.l += 1; else e.line.t += 1;
    po.set(f, e);
  };
  for (const g of games) {
    if (g.away_score == null || g.home_score == null) continue;
    bump(g.away_f, g.year, g.away_score, g.home_score);
    bump(g.home_f, g.year, g.home_score, g.away_score);
  }
  return [...po].map(([f, e]) => ({ f, gp: e.line.gp, w: e.line.w, l: e.line.l, t: e.line.t, pf: e.line.pf, pa: e.line.pa, years: e.years.size }));
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

export function buildAllTime(inp: Inputs): { franchises: Franchise[]; first: number; last: number; seasons: number } {
  const stand = distinct(inp.stand).filter((r) => (r.gp ?? 0) > 0 || (r.w ?? 0) + (r.l ?? 0) > 0);
  const years = [...new Set(stand.map((r) => r.year))].sort((a, b) => a - b);
  const first = years[0] ?? 0, last = years.at(-1) ?? 0;

  const yearMax = new Map<number, number>(), teamsIn = new Map<number, number>();
  for (const r of stand) {
    yearMax.set(r.year, Math.max(yearMax.get(r.year) ?? 0, r.gp ?? 0));
    teamsIn.set(r.year, (teamsIn.get(r.year) ?? 0) + 1);
  }
  // The season still being played has a few games per team: it counts in the totals but is no candidate for best or worst.
  const prevMax = yearMax.get(last - 1) ?? median([...yearMax.values()]);
  const underway = (yearMax.get(last) ?? 0) < 0.8 * prevMax;
  const prevTeams = teamsIn.get(last - 1) ?? 0;
  const lastActive = (teamsIn.get(last) ?? 0) < 0.8 * prevTeams ? last - 1 : last;

  const names = new Map<number, string[]>();
  for (const n of inp.names) {
    const list = names.get(n.franchise_id) ?? [];
    if (!list.includes(n.name)) list.push(n.name);
    names.set(n.franchise_id, list);
  }
  const titles = new Map<number, Set<number>>();
  for (const c of inp.champs) titles.set(c.franchise_id, (titles.get(c.franchise_id) ?? new Set()).add(c.year));

  const po = new Map<number, PlayoffTotals>();
  for (const p of inp.playoffs) po.set(p.f, p);

  const by = new Map<number, StandLine[]>();
  for (const r of stand) by.set(r.franchise_id, [...(by.get(r.franchise_id) ?? []), r]);

  const franchises: Franchise[] = [];
  for (const [f, list] of by) {
    const perYear = new Map<number, Line & { name: string | null }>();
    for (const r of list) {
      const w = r.w ?? 0, l = r.l ?? 0, t = r.t ?? 0, otl = r.otl ?? 0;
      const e = perYear.get(r.year) ?? { ...emptyLine(), name: r.team };
      e.gp += r.gp ?? w + l + t + otl; e.w += w; e.l += l; e.t += t; e.otl += otl; e.pf += r.pf ?? 0; e.pa += r.pa ?? 0;
      perYear.set(r.year, e);
    }
    const won = titles.get(f) ?? new Set<number>();
    const marks: SeasonMark[] = [...perYear].sort((a, b) => a[0] - b[0]).map(([year, e]) => {
      const top = yearMax.get(year) ?? 0;
      return {
        year, gp: e.gp, w: e.w, l: e.l, t: e.t, otl: e.otl, share: share(e), champion: won.has(year),
        eligible: !(year === last && underway) && e.gp >= 0.5 * top,
      };
    });
    const reg = marks.reduce((a, m) => ({ ...a, gp: a.gp + m.gp, w: a.w + m.w, l: a.l + m.l, t: a.t + m.t, otl: a.otl + m.otl }), emptyLine());
    for (const e of perYear.values()) { reg.pf += e.pf; reg.pa += e.pa; }
    const cand = marks.filter((m) => m.eligible && m.share != null);
    const order = (a: SeasonMark, b: SeasonMark) => (b.share ?? 0) - (a.share ?? 0) || b.w - a.w || b.year - a.year;
    const sorted = [...cand].sort(order);
    const lastYear = marks.at(-1)!.year;
    const all = names.get(f) ?? [];
    const now = all.at(-1) ?? [...perYear].at(-1)![1].name ?? String(f);
    const p = po.get(f);
    franchises.push({
      f, name: now, former: all.filter((n) => n !== now), abbr: inp.abbr(f, lastYear, now),
      first: marks[0].year, last: lastYear, active: lastYear >= lastActive,
      seasons: marks.length, reg, po: p ? { gp: p.gp, w: p.w, l: p.l, t: p.t, otl: 0, pf: p.pf, pa: p.pa } : emptyLine(), playoffs: p?.years ?? 0, titles: [...won].sort((a, b) => a - b),
      years: marks, best: sorted[0] ?? null, worst: sorted.at(-1) ?? null,
    });
  }
  return { franchises, first, last, seasons: years.length };
}

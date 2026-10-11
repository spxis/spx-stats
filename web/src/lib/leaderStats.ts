/**
 * Season leaders worked out from standings rows: the team statistics, each season's leader, and how a season's leader
 * ranks against every other season's. Pure, so the page and the checks share it.
 */
import type { LeaderStanding } from "./api/leaders";
import type { PhraseKey } from "./i18n/phrases.constants";
import { seasonPath } from "./slug";

/** The address of a season's leaders: /nhl/2022-23/leaders. */
export const leadersPath = (lg: string, y: number): string => `${seasonPath(lg, y)}/leaders`;

export type TeamStatId = "w" | "pct" | "pts" | "pf" | "pa" | "diff";
export type Unit = "goals" | "runs" | "points";
/** How a value is written: a whole number, a share (.793), a per-game figure (3.72) or a signed per-game figure (+1.56). */
export type TeamKind = "int" | "share" | "rate" | "signed";

/** What a league's score is counted in. */
export const UNIT_OF: Record<string, Unit> = { nhl: "goals", mlb: "runs", nba: "points", nfl: "points", cfl: "points" };

const EPS = 1e-9;

export interface TeamStat {
  id: TeamStatId;
  better: "high" | "low";
  kind: TeamKind;
  /** The figure a team is ranked by, or null when its row cannot give one. */
  get: (r: LeaderStanding) => number | null;
  label: (unit: Unit) => PhraseKey;
}

const played = (r: LeaderStanding): r is LeaderStanding & { gp: number } => r.gp != null && r.gp > 0;

const ALL: TeamStat[] = [
  { id: "w", better: "high", kind: "int", get: (r) => (played(r) && r.w != null ? r.w : null), label: () => "leaders.team.w" },
  { id: "pct", better: "high", kind: "share", get: (r) => (played(r) && r.w != null ? (r.w + (r.t ?? 0) / 2) / r.gp : null), label: () => "leaders.team.pct" },
  { id: "pts", better: "high", kind: "int", get: (r) => (played(r) ? r.pts : null), label: () => "leaders.team.pts" },
  { id: "pf", better: "high", kind: "rate", get: (r) => (played(r) && r.pf != null ? r.pf / r.gp : null), label: (u) => `leaders.team.for.${u}` },
  { id: "pa", better: "low", kind: "rate", get: (r) => (played(r) && r.pa != null ? r.pa / r.gp : null), label: (u) => `leaders.team.against.${u}` },
  { id: "diff", better: "high", kind: "signed", get: (r) => (played(r) && r.pf != null && r.pa != null ? (r.pf - r.pa) / r.gp : null), label: (u) => `leaders.team.diff.${u}` },
];

/** The statistics a league's standings can rank: points only where the standings carry them. */
export function teamStatsFor(rows: readonly LeaderStanding[]): TeamStat[] {
  const hasPts = rows.some((r) => r.pts != null);
  return ALL.filter((s) => s.id !== "pts" || hasPts);
}

export const isTeamStatId = (v: unknown): v is TeamStatId => ALL.some((s) => s.id === v);

export const beats = (stat: Pick<TeamStat, "better">, a: number, b: number): boolean => (stat.better === "high" ? a > b + EPS : a < b - EPS);
const same = (a: number, b: number): boolean => Math.abs(a - b) <= EPS;

export type SeasonIssue = "progress" | "gaps";

/**
 * Drops the rows of clubs that played far fewer games than their league that season (folded clubs, or a season whose
 * published table lost most of its teams), and marks the seasons that cannot be ranked: still being played, or with a
 * fifth or more of their clubs short.
 */
export function cleanSeasons(rows: readonly LeaderStanding[], unfinished: ReadonlySet<number>): { rows: LeaderStanding[]; issues: Map<number, SeasonIssue> } {
  const by = new Map<number, LeaderStanding[]>();
  for (const r of rows) {
    const list = by.get(r.year);
    if (list) list.push(r); else by.set(r.year, [r]);
  }
  const out: LeaderStanding[] = [];
  const issues = new Map<number, SeasonIssue>();
  for (const [year, list] of by) {
    const gp = list.map((r) => r.gp ?? 0).filter((g) => g > 0).sort((a, b) => a - b);
    const mid = gp.length ? gp[Math.floor(gp.length / 2)] : 0;
    const keep = list.filter((r) => (r.gp ?? 0) >= 0.5 * mid);
    out.push(...keep);
    if (unfinished.has(year)) issues.set(year, "progress");
    else if (list.length - keep.length >= 0.2 * list.length) issues.set(year, "gaps");
  }
  return { rows: out, issues };
}

export interface ScoredTeam { row: LeaderStanding; value: number }

/** Every team of a season with a figure, best first (ties keep the order of the rows). */
export function scoreTeams(rows: readonly LeaderStanding[], stat: TeamStat): ScoredTeam[] {
  const out: ScoredTeam[] = [];
  for (const row of rows) {
    const value = stat.get(row);
    if (value != null && Number.isFinite(value)) out.push({ row, value });
  }
  return out.sort((a, b) => (stat.better === "high" ? b.value - a.value : a.value - b.value));
}

export interface YearLead {
  year: number;
  /** The leading figure of the season, and every team that has it. */
  value: number;
  teams: LeaderStanding[];
  /** The poorest team's figure and the average of all, for the band and the dashed line. */
  worst: number;
  mean: number;
  n: number;
}

/** The leader of every season of a league, oldest first. A season in which no team has a figure is left out. */
export function yearLeads(rows: readonly LeaderStanding[], stat: TeamStat): YearLead[] {
  const by = new Map<number, LeaderStanding[]>();
  for (const r of rows) {
    const list = by.get(r.year);
    if (list) list.push(r); else by.set(r.year, [r]);
  }
  const out: YearLead[] = [];
  for (const [year, list] of by) {
    const scored = scoreTeams(list, stat);
    if (!scored.length) continue;
    const best = scored[0].value;
    out.push({
      year, value: best, teams: scored.filter((s) => same(s.value, best)).map((s) => s.row),
      worst: scored[scored.length - 1].value, mean: scored.reduce((a, s) => a + s.value, 0) / scored.length, n: scored.length,
    });
  }
  return out.sort((a, b) => a.year - b.year);
}

export interface SeasonContext {
  lead: YearLead;
  /** The season is still being played: it is not ranked, so the three places below are 0. */
  partial: boolean;
  /** 1 is the best leading figure of any season; `of` is how many seasons have one. */
  rank: number;
  of: number;
  /** Share of the other seasons whose leader this season's leader beat, 0 to 100. */
  ahead: number;
  /** The leader's place among every team-season of the league, and how many there are. */
  teamRank: number;
  teamOf: number;
  /** The best figure any team-season ever had. */
  record: { value: number; row: LeaderStanding };
  /** How far the leader is clear of the next team this season; null with no other team. */
  margin: number | null;
}

/**
 * How a season's leader stands against every finished season of the league (`finished` holds those rows, `history` their
 * leaders, `mine` this season's rows). A season still being played has no place; null when the season has no leader.
 */
export function seasonContext(
  finished: readonly LeaderStanding[], stat: TeamStat, year: number, history: readonly YearLead[], mine: readonly LeaderStanding[],
): SeasonContext | null {
  const done = history.find((h) => h.year === year);
  const lead = done ?? yearLeads(mine, stat)[0];
  if (!lead) return null;
  const all = finished.map((r) => stat.get(r)).filter((v): v is number => v != null && Number.isFinite(v));
  let record: SeasonContext["record"] | null = null;
  for (const r of finished) {
    const v = stat.get(r);
    if (v != null && Number.isFinite(v) && (!record || beats(stat, v, record.value))) record = { value: v, row: r };
  }
  const next = scoreTeams(mine, stat).find((s) => !same(s.value, lead.value));
  const base = { lead, record: record ?? { value: lead.value, row: lead.teams[0] }, margin: next ? Math.abs(lead.value - next.value) : null };
  if (!done) return { ...base, partial: true, rank: 0, of: history.length, ahead: 0, teamRank: 0, teamOf: all.length };
  const better = history.filter((h) => beats(stat, h.value, lead.value)).length;
  const worse = history.filter((h) => beats(stat, lead.value, h.value)).length;
  return {
    ...base, partial: false, rank: better + 1, of: history.length, ahead: history.length > 1 ? Math.round((100 * worse) / (history.length - 1)) : 100,
    teamRank: all.filter((v) => beats(stat, v, lead.value)).length + 1, teamOf: all.length,
  };
}

/** How far a figure is above (+) or below (−) another, to the precision of its kind. */
export function showDelta(kind: TeamKind, v: number): string {
  const digits = kind === "share" ? 3 : kind === "int" ? 1 : 2;
  const t = Math.abs(v).toFixed(digits);
  return Number(t) === 0 ? t : `${v > 0 ? "+" : "−"}${t}`;
}

/** A team figure as it is written. */
export function showTeam(kind: TeamKind, v: number | null | undefined, fmt: (n: number) => string): string {
  if (v == null || Number.isNaN(v)) return "";
  if (kind === "int") return fmt(v);
  if (kind === "share") return v.toFixed(3);
  if (kind === "signed") return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;
  return v.toFixed(2);
}

/**
 * The arithmetic behind a player's statistics board: which seasons count (the range, the phase, the clubs), totals and per-game rates for
 * them, a season's rank in the league, a percentile against the league's players, milestones on a career line and the best run of seasons.
 * Pure and free of React, so the board draws from it and a node script tests it (scripts/player.test.ts). Nothing is guessed: a figure
 * that cannot be worked out from the numbers we hold is null, and the board leaves it out.
 */
import type { StatNumbers } from "./api/player.ts";
import { STAT_GROUPS, type StatCol, type StatKind } from "./playerStats.ts";
import { rangePresets, type RangePreset } from "./yearRange.ts";

export type Phase = "regular" | "playoffs";

/** One club-season of one stat group, as the board holds it. */
export interface StatRow { league: string; year: number; ts: number; f: number; team: string | null; phase: Phase; group: string; stats: StatNumbers }

export interface Span { from: number; to: number }

/** The league around a player in one season (api.stat_reference, migration 064), trimmed to what the board reads. */
export interface RefRow {
  /** stat group */ g: string;
  /** phase */ p: Phase;
  /** metric */ m: string;
  /** year */ y: number;
  /** players counted */ n: number;
  /** average of the players who played enough (rate metrics) */ a?: number;
  /** the 11 values at 0, 10 ... 100 per cent (rate metrics) */ q?: number[];
  /** the best season totals, best first (total metrics) */ t?: number[];
}

/** A RefRow as the page sends it (a list, no names, figures to three places): group, phase (r or p), metric, year, players, average, the 11 points, the best totals. */
export type RefPack = [string, "r" | "p", string, number, number, number | null, number[] | null, number[] | null];

const r3 = (x: number) => Math.round(x * 1000) / 1000;
export const packRef = (r: RefRow): RefPack => [r.g, r.p === "playoffs" ? "p" : "r", r.m, r.y, r.n, r.a == null ? null : r3(r.a), r.q ? r.q.map(r3) : null, r.t ?? null];
export const unpackRef = ([g, p, m, y, n, a, q, t]: RefPack): RefRow => ({ g, p: p === "p" ? "playoffs" : "regular", m, y, n, ...(a != null ? { a } : {}), ...(q ? { q } : {}), ...(t ? { t } : {}) });

export type RefIndex = Map<string, RefRow>;
export const refKey = (g: string, p: string, m: string, y: number) => `${g}|${p}|${m}|${y}`;
export const indexRefs = (rows: readonly RefRow[]): RefIndex => new Map(rows.map((r) => [refKey(r.g, r.p, r.m, r.y), r]));

const num = (s: StatNumbers, k: string): number | null => (typeof s[k] === "number" && Number.isFinite(s[k]) ? s[k] : null);
const div = (a: number | null, b: number | null): number | null => (a == null || b == null || b === 0 ? null : a / b);

/** A figure per game (or per nine innings) worked out from the counting numbers. */
export interface Per { unit: "game" | "nine"; get: (s: StatNumbers) => number | null }

export interface Metric {
  id: string;
  /** Phrase keys of the short and long name. */
  label: string;
  title: string;
  kind: StatKind;
  get: (s: StatNumbers) => number | null;
  /** A counting number: seasons add up, so it can be a bar total and a career line. Rates are not summable. */
  sum: boolean;
  per?: Per;
  /** Its metric in api.stat_reference: the per-game figure's (counting) or its own (rate). */
  ref?: string;
  /** Lower is better (ERA, goals against). */
  low?: boolean;
}

export interface RadarAxis { ref: string; label: string; low?: boolean; get: (s: StatNumbers) => number | null }

export interface Mark { id: string; marks: number[] }

export interface GroupDef {
  id: string;
  title: string;
  /** Games played in the numbers of this group. */
  games: (s: StatNumbers) => number | null;
  metrics: Metric[];
  /** The hero cards, in order. A `record` card is wins and losses as one. */
  hero: { id: string; record?: boolean }[];
  /** The stats the season bars can show, first is the default. */
  bars: string[];
  /** The headline stat: peak seasons and the team donut count it. */
  main: string;
  /** Milestones by stat. */
  milestones: Mark[];
  radar: RadarAxis[];
  /** The stat the second donut splits: shares of these numbers. */
  split: { id: string; label: string; parts: { key: string; label: string; get: (s: StatNumbers) => number | null }[] };
}

const col = (group: string, key: string): StatCol => {
  const c = STAT_GROUPS[group].cols.find((x) => x.key === key);
  if (!c) throw new Error(`no column ${group}.${key}`);
  return c;
};

/** A counting column as a metric. */
const count = (group: string, key: string, extra: Partial<Metric> = {}): Metric => {
  const c = col(group, key);
  return { id: key, label: c.label, title: c.title, kind: c.kind, get: c.get, sum: true, ...extra };
};
/** A rate column as a metric. */
const rate = (group: string, key: string, extra: Partial<Metric> = {}): Metric => {
  const c = col(group, key);
  return { id: key, label: c.label, title: c.title, kind: c.kind, get: c.get, sum: false, ...extra };
};

const perGame = (top: string, games: (s: StatNumbers) => number | null): Per => ({ unit: "game", get: (s) => div(num(s, top), games(s)) });
const gp = (s: StatNumbers) => num(s, "gp");
const g = (s: StatNumbers) => num(s, "g");

const skaterGames = gp;
const SKATER: GroupDef = {
  id: "skater", title: "statgroup.skater", games: skaterGames,
  metrics: [
    count("skater", "gp"), count("skater", "g", { per: perGame("g", skaterGames), ref: "g_pg" }), count("skater", "a", { per: perGame("a", skaterGames), ref: "a_pg" }),
    count("skater", "pts", { per: perGame("pts", skaterGames), ref: "pts_pg" }), count("skater", "pim", { per: perGame("pim", skaterGames) }),
    count("skater", "pm", { per: perGame("pm", skaterGames), ref: "pm_pg" }),
  ],
  hero: [{ id: "gp" }, { id: "g" }, { id: "a" }, { id: "pts" }, { id: "pm" }, { id: "pim" }],
  bars: ["pts", "g", "a", "pm", "pim", "gp"],
  main: "pts",
  milestones: [{ id: "g", marks: [100, 200, 300, 400, 500, 600, 700, 800] }, { id: "a", marks: [250, 500, 750, 1000] }, { id: "pts", marks: [500, 1000, 1500, 2000] },
    { id: "gp", marks: [500, 1000, 1500] }],
  radar: [
    { ref: "g_pg", label: "radar.g_pg", get: (s) => div(num(s, "g"), gp(s)) }, { ref: "a_pg", label: "radar.a_pg", get: (s) => div(num(s, "a"), gp(s)) },
    { ref: "pts_pg", label: "radar.pts_pg", get: (s) => div(num(s, "pts"), gp(s)) }, { ref: "sog_pg", label: "radar.sog_pg", get: (s) => div(num(s, "sog"), gp(s)) },
    { ref: "pm_pg", label: "radar.pm_pg", get: (s) => div(num(s, "pm"), gp(s)) },
  ],
  split: { id: "ga", label: "split.ga", parts: [{ key: "g", label: "stat.g.name", get: (s) => num(s, "g") }, { key: "a", label: "stat.a.name", get: (s) => num(s, "a") }] },
};

const GOALIE: GroupDef = {
  id: "goalie", title: "statgroup.goalie", games: gp,
  metrics: [
    count("goalie", "gp"), count("goalie", "gs"), count("goalie", "w", { per: perGame("w", gp), ref: "w_pg" }), count("goalie", "l"), count("goalie", "t"), count("goalie", "otl"),
    count("goalie", "so", { per: perGame("so", gp), ref: "so_pg" }),
    rate("goalie", "gaa", { ref: "gaa", low: true }), rate("goalie", "svp", { ref: "svp" }),
  ],
  hero: [{ id: "gp" }, { id: "w" }, { id: "gaa" }, { id: "svp" }, { id: "so" }],
  bars: ["w", "so", "gp", "gaa", "svp"],
  main: "w",
  milestones: [{ id: "w", marks: [100, 200, 300, 400, 500] }, { id: "so", marks: [25, 50, 75, 100] }, { id: "gp", marks: [500, 750, 1000] }],
  radar: [
    { ref: "svp", label: "radar.svp", get: (s) => div(num(s, "sv"), num(s, "sa")) },
    { ref: "gaa", label: "radar.gaa", low: true, get: (s) => { const q = div(num(s, "ga"), num(s, "toi")); return q == null ? null : q * 3600; } },
    { ref: "w_pg", label: "radar.w_pg", get: (s) => div(num(s, "w"), gp(s)) }, { ref: "so_pg", label: "radar.so_pg", get: (s) => div(num(s, "so"), gp(s)) },
  ],
  split: { id: "wl", label: "split.wl", parts: [{ key: "w", label: "stat.w.name", get: (s) => num(s, "w") }, { key: "l", label: "stat.l.name", get: (s) => num(s, "l") },
    { key: "t", label: "stat.t.name", get: (s) => num(s, "t") }, { key: "otl", label: "stat.otl.name", get: (s) => num(s, "otl") }] },
};

const BATTING: GroupDef = {
  id: "batting", title: "statgroup.batting", games: g,
  metrics: [
    count("batting", "g"), count("batting", "ab"), count("batting", "r", { per: perGame("r", g), ref: "r_pg" }), count("batting", "h"), count("batting", "2b"), count("batting", "3b"),
    count("batting", "hr", { per: perGame("hr", g), ref: "hr_pg" }), count("batting", "rbi", { per: perGame("rbi", g), ref: "rbi_pg" }), count("batting", "sb", { per: perGame("sb", g), ref: "sb_pg" }),
    count("batting", "bb"), count("batting", "so"),
    rate("batting", "avg", { ref: "avg" }), rate("batting", "obp", { ref: "obp" }), rate("batting", "slg", { ref: "slg" }),
  ],
  hero: [{ id: "g" }, { id: "h" }, { id: "hr" }, { id: "rbi" }, { id: "avg" }, { id: "obp" }, { id: "slg" }],
  bars: ["hr", "h", "rbi", "r", "sb", "bb", "avg", "obp", "slg"],
  main: "hr",
  milestones: [{ id: "h", marks: [1000, 2000, 3000] }, { id: "hr", marks: [100, 200, 300, 400, 500, 600, 700] }, { id: "rbi", marks: [500, 1000, 1500, 2000] },
    { id: "r", marks: [1000, 1500, 2000] }, { id: "sb", marks: [100, 300, 500] }, { id: "g", marks: [1000, 2000, 3000] }],
  radar: [
    { ref: "avg", label: "radar.avg", get: (s) => col("batting", "avg").get(s) }, { ref: "obp", label: "radar.obp", get: (s) => col("batting", "obp").get(s) },
    { ref: "slg", label: "radar.slg", get: (s) => col("batting", "slg").get(s) }, { ref: "hr_pg", label: "radar.hr_pg", get: (s) => div(num(s, "hr"), g(s)) },
    { ref: "rbi_pg", label: "radar.rbi_pg", get: (s) => div(num(s, "rbi"), g(s)) }, { ref: "r_pg", label: "radar.r_pg", get: (s) => div(num(s, "r"), g(s)) },
    { ref: "sb_pg", label: "radar.sb_pg", get: (s) => div(num(s, "sb"), g(s)) },
  ],
  split: { id: "hits", label: "split.hits", parts: [
    { key: "1b", label: "split.single", get: (s) => { const h = num(s, "h"); return h == null ? null : h - (num(s, "2b") ?? 0) - (num(s, "3b") ?? 0) - (num(s, "hr") ?? 0); } },
    { key: "2b", label: "stat.dbl.name", get: (s) => num(s, "2b") }, { key: "3b", label: "stat.tpl.name", get: (s) => num(s, "3b") }, { key: "hr", label: "stat.hr.name", get: (s) => num(s, "hr") }] },
};

const per9 = (top: string): Per => ({ unit: "nine", get: (s) => { const q = div(num(s, top), num(s, "ipouts")); return q == null ? null : q * 27; } });
const PITCHING: GroupDef = {
  id: "pitching", title: "statgroup.pitching", games: g,
  metrics: [
    count("pitching", "w"), count("pitching", "l"), count("pitching", "g"), count("pitching", "gs"), count("pitching", "sv"),
    count("pitching", "ip"), count("pitching", "so", { per: per9("so"), ref: "k9" }), count("pitching", "bb", { per: per9("bb"), ref: "bb9" }),
    rate("pitching", "era", { ref: "era", low: true }), rate("pitching", "whip", { ref: "whip", low: true }),
  ],
  hero: [{ id: "w", record: true }, { id: "era" }, { id: "so" }, { id: "ip" }, { id: "whip" }, { id: "sv" }],
  bars: ["w", "so", "sv", "ip", "era", "whip"],
  main: "w",
  milestones: [{ id: "w", marks: [100, 200, 300] }, { id: "so", marks: [1000, 2000, 3000] }, { id: "sv", marks: [100, 200, 300, 400] }],
  radar: [
    { ref: "era", label: "radar.era", low: true, get: (s) => col("pitching", "era").get(s) }, { ref: "whip", label: "radar.whip", low: true, get: (s) => col("pitching", "whip").get(s) },
    { ref: "k9", label: "radar.k9", get: (s) => { const q = div(num(s, "so"), num(s, "ipouts")); return q == null ? null : q * 27; } },
    { ref: "bb9", label: "radar.bb9", low: true, get: (s) => { const q = div(num(s, "bb"), num(s, "ipouts")); return q == null ? null : q * 27; } },
    { ref: "hr9", label: "radar.hr9", low: true, get: (s) => { const q = div(num(s, "hr"), num(s, "ipouts")); return q == null ? null : q * 27; } },
  ],
  split: { id: "wl", label: "split.wl", parts: [{ key: "w", label: "stat.w.name", get: (s) => num(s, "w") }, { key: "l", label: "stat.l.name", get: (s) => num(s, "l") }] },
};

export const GROUPS: Record<string, GroupDef> = { skater: SKATER, goalie: GOALIE, batting: BATTING, pitching: PITCHING };
export const GROUP_ORDER = ["skater", "goalie", "batting", "pitching"] as const;

export const metricOf = (group: GroupDef, id: string): Metric => group.metrics.find((m) => m.id === id) ?? group.metrics[0];

/** The innings column holds outs (3 to an inning); its milestones and bars are in outs too, drawn as innings by the board. */
export const isInnings = (m: Metric) => m.id === "ip" && m.kind === "ip";

// ---- rows in range --------------------------------------------------------------------------------------------------------------------

/** The clubs a filter keeps, as "league:franchise" keys; an empty set keeps every club. */
export const clubKey = (r: { league: string; f: number }) => `${r.league}:${r.f}`;

export function inRange<T extends { year: number; phase?: string; league?: string; f?: number }>(rows: readonly T[], span: Span, phase: Phase | null, clubs?: ReadonlySet<string>): T[] {
  return rows.filter((r) => r.year >= span.from && r.year <= span.to && (phase == null || r.phase === phase) && (!clubs || clubs.size === 0 || clubs.has(`${r.league}:${r.f}`)));
}

/** The counting numbers of rows added up. A number a row lacks adds nothing, and a key no row holds stays absent (so a rate that needs it is null, not zero). */
export function sumStats(rows: readonly { stats: StatNumbers }[]): StatNumbers {
  const out: StatNumbers = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.stats)) if (typeof v === "number" && Number.isFinite(v)) out[k] = (out[k] ?? 0) + v;
  return out;
}

export interface SeasonTotal { league: string; year: number; stats: StatNumbers; parts: StatRow[] }

/** One entry per season (clubs of a season added together, kept as parts), oldest first. */
export function bySeason(rows: readonly StatRow[]): SeasonTotal[] {
  const by = new Map<string, StatRow[]>();
  for (const r of rows) {
    const k = `${r.league}|${r.year}`;
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  return [...by.values()].map((parts) => ({ league: parts[0].league, year: parts[0].year, stats: sumStats(parts), parts: [...parts].sort((a, b) => a.ts - b.ts) }))
    .sort((a, b) => a.year - b.year || a.league.localeCompare(b.league));
}

/** A rate per game (or per nine) over summed numbers; null when the number or the games are missing. */
export const perOf = (m: Metric, s: StatNumbers): number | null => m.per?.get(s) ?? null;

/** One stat group of the board for the seasons, phase and clubs chosen. */
export interface GroupView {
  def: GroupDef;
  league: string;
  /** In the range, the phase and the clubs chosen. */
  rows: StatRow[];
  /** In the range and the clubs, both phases (for regular season against playoffs). */
  both: StatRow[];
  /** The phase and the clubs chosen, every season of the career (the career line starts from what came before the range). */
  all: StatRow[];
  total: StatNumbers;
  seasons: SeasonTotal[];
}

/** The groups the player has statistics in (skaters, then goalies, hitters, pitchers; a pitcher's pitching first), each cut to the range, phase and clubs. */
export function groupViews(stats: readonly StatRow[], span: Span, phase: Phase, clubs: ReadonlySet<string>, position?: string | null): GroupView[] {
  const order = position === "P" ? ["pitching", ...GROUP_ORDER.filter((x) => x !== "pitching")] : GROUP_ORDER;
  return order.flatMap((id) => {
    const mine = stats.filter((s) => s.group === id);
    if (!mine.length) return [];
    const rows = inRange(mine, span, phase, clubs);
    return [{ def: GROUPS[id], league: mine[0].league, rows, both: inRange(mine, span, null, clubs), all: inRange(mine, { from: -Infinity, to: Infinity }, phase, clubs), total: sumStats(rows), seasons: bySeason(rows) }];
  });
}

// ---- league rank and percentiles ---------------------------------------------------------------------------------------------------------

/**
 * The rank of a season total among everyone that season, from the best totals we hold (a list, best first). 1 is the league's best (ties share
 * it). A total below the last one held has a rank we cannot know, so null; so is a total of nothing.
 */
export function rankIn(top: readonly number[] | undefined, v: number | null): number | null {
  if (!top || !top.length || v == null || !(v > 0)) return null;
  const ahead = top.filter((t) => t > v).length;
  if (top.length >= 20 && v < top[top.length - 1]) return null;
  return ahead + 1;
}

/** The share (0..1) of a distribution given by its 11 points at 0, 10 ... 100 per cent that lies at or below v; linear between the points. */
export function cdfAt(q: readonly number[], v: number): number {
  if (q.length < 2) return NaN;
  if (v <= q[0]) return q[0] === q[q.length - 1] ? 0.5 : 0;
  if (v >= q[q.length - 1]) return 1;
  const steps = q.length - 1;
  for (let i = 0; i < steps; i++) {
    if (v >= q[i] && v < q[i + 1]) return (i + (v - q[i]) / (q[i + 1] - q[i])) / steps;
  }
  return 1;
}

/**
 * How a value stands among the players of several seasons together: the seasons' distributions are pooled by the number of players in each, and
 * the answer is the share of that crowd the value beats (0..1, higher is better, so a lower-is-better figure is turned round). Null when no
 * season has a distribution.
 */
export function pooledPercentile(seasons: readonly { n: number; q: readonly number[] }[], v: number | null, low = false): number | null {
  if (v == null || !seasons.length) return null;
  let w = 0, acc = 0;
  for (const s of seasons) {
    const c = cdfAt(s.q, v);
    if (Number.isNaN(c) || !(s.n > 0)) continue;
    acc += s.n * c;
    w += s.n;
  }
  if (!w) return null;
  const p = acc / w;
  return low ? 1 - p : p;
}

/** "Top 6%" as a whole number of per cent from a percentile (0..1, higher is better); never "top 0%". */
export const topPercent = (p: number): number => Math.min(100, Math.max(1, Math.round((1 - p) * 100)));

export interface RadarPoint { ref: string; label: string; value: number | null; pct: number | null; low: boolean }

/**
 * The player's figures in the seasons they played, one per axis, each with the share of the league's players (of the same kind, in those
 * same seasons) it beats. `rows` are the player's rows of one group and phase already in range.
 */
export function radarOf(group: GroupDef, rows: readonly StatRow[], refs: RefIndex, phase: Phase): RadarPoint[] {
  const total = sumStats(rows);
  const years = [...new Set(rows.map((r) => r.year))];
  return group.radar.map((ax) => {
    const value = ax.get(total);
    const seasons = years.flatMap((y) => {
      const r = refs.get(refKey(group.id, phase, ax.ref, y));
      return r?.q && r.q.length === 11 ? [{ n: r.n, q: r.q }] : [];
    });
    return { ref: ax.ref, label: ax.label, value, pct: pooledPercentile(seasons, value, ax.low), low: !!ax.low };
  });
}

/** The league's average for a season of a metric (players who played enough), or null when we hold none. */
export const leagueAvg = (refs: RefIndex, group: string, phase: Phase, ref: string | undefined, year: number): number | null =>
  (ref ? refs.get(refKey(group, phase, ref, year))?.a : undefined) ?? null;

/**
 * How many of the seasons in `seasons` the player led the league in a stat, and how many they were in its best ten. `ref` is the stat's own
 * (total) metric. A season whose rank we cannot know counts for neither.
 */
export function leagueFinishes(seasons: readonly SeasonTotal[], metric: Metric, refs: RefIndex, group: string, phase: Phase): { led: number; top10: number; known: number } {
  let led = 0, top10 = 0, known = 0;
  for (const s of seasons) {
    const top = refs.get(refKey(group, phase, metric.id, s.year))?.t;
    if (!top) continue;
    known++;
    const rank = rankIn(top, metric.get(s.stats));
    if (rank === 1) led++;
    if (rank != null && rank <= 10) top10++;
  }
  return { led, top10, known };
}

// ---- the career line ------------------------------------------------------------------------------------------------------------------

export interface CareerPoint { year: number; value: number; added: number }

/** Running total of a counting stat over every season of the career (oldest first); each point carries the season's own addition. */
export function cumulative(seasons: readonly SeasonTotal[], get: (s: StatNumbers) => number | null): CareerPoint[] {
  let run = 0;
  const out: CareerPoint[] = [];
  for (const s of seasons) {
    const add = get(s.stats);
    if (add == null) continue;
    run += add;
    out.push({ year: s.year, value: run, added: add });
  }
  return out;
}

export interface Milestone { mark: number; year: number; value: number }

/** The first season whose running total reached each mark (a mark never reached is left out). */
export function milestonesOf(points: readonly CareerPoint[], marks: readonly number[]): Milestone[] {
  const out: Milestone[] = [];
  for (const mark of [...marks].sort((a, b) => a - b)) {
    const p = points.find((x) => x.value >= mark);
    if (p) out.push({ mark, year: p.year, value: p.value });
  }
  return out;
}

/** The best run of `width` calendar years (from..from+width-1) by the sum of `value`, over the years that have one; the whole span when there are not that many. */
export function peakRun(values: readonly { year: number; v: number }[], width = 5): Span | null {
  if (!values.length) return null;
  const years = values.map((x) => x.year);
  const lo = Math.min(...years), hi = Math.max(...years);
  if (hi - lo + 1 <= width) return { from: lo, to: hi };
  const by = new Map(values.map((x) => [x.year, x.v]));
  let best = -Infinity, at = lo;
  for (let y = lo; y + width - 1 <= hi; y++) {
    let s = 0;
    for (let k = 0; k < width; k++) s += by.get(y + k) ?? 0;
    if (s > best) { best = s; at = y; }
  }
  return { from: at, to: at + width - 1 };
}

/** The season with the highest value, the earliest on a tie; null when there is none above nothing. */
export function peakSeason(values: readonly { year: number; v: number }[]): number | null {
  let best: { year: number; v: number } | null = null;
  for (const x of values) if (x.v > 0 && (!best || x.v > best.v)) best = x;
  return best?.year ?? null;
}

// ---- shares ---------------------------------------------------------------------------------------------------------------------------

export interface Slice { key: string; value: number }

/** Slices that count (above nothing), with each one's share of the whole. */
export function shares(slices: readonly Slice[]): (Slice & { share: number })[] {
  const kept = slices.filter((s) => s.value > 0);
  const total = kept.reduce((a, s) => a + s.value, 0);
  return total > 0 ? kept.map((s) => ({ ...s, share: s.value / total })) : [];
}

// ---- small text helpers ---------------------------------------------------------------------------------------------------------------

const NOISE = new Set(["award", "trophy", "memorial", "major", "league", "baseball", "nba", "nfl", "nhl", "cfl", "cfl's", "ap", "rawlings", "the", "of", "year", "player", "william", "m.", "j.", "bill", "maurice", "frank", "james", "john", "ted", "lady", "king", "conn"]);

/** A short mark for an award badge: "Most Valuable Player" is MVP, otherwise the initials of the words that name it ("Art Ross Trophy" is AR). */
export function awardBadge(name: string): string {
  if (/most valuable player/i.test(name)) return "MVP";
  if (/rookie of the year|calder/i.test(name)) return "ROY";
  const words = name.replace(/["“”]/g, "").split(/\s+/).filter((w) => w && !NOISE.has(w.toLowerCase()));
  const letters = words.slice(0, 3).map((w) => w[0].toUpperCase()).join("");
  return letters || name.slice(0, 2).toUpperCase();
}

/** 1st, 2nd, 3rd ... in English; other languages draw the number plainly (the board passes a formatter). */
export const ordinalEn = (n: number): string => {
  const r = n % 100;
  if (r >= 11 && r <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10]}`;
};

/** The player's position bucket in api.stat_reference: F (C, LW, RW), D, or all when the position is not one of those. */
export function bucketOf(group: string, position: string | null | undefined): "F" | "D" | "all" {
  if (group !== "skater") return "all";
  if (position === "D") return "D";
  return position === "C" || position === "LW" || position === "RW" || position === "F" ? "F" : "all";
}

/** The range kept inside lo..hi with from <= to; a missing end takes the edge. */
export function clampSpan(span: Partial<Span> | null | undefined, lo: number, hi: number): Span {
  const f = Math.min(hi, Math.max(lo, span?.from ?? lo)), t = Math.min(hi, Math.max(lo, span?.to ?? hi));
  return { from: Math.min(f, t), to: Math.max(f, t) };
}

/** The one-tap ranges of a player page: all seasons, the last ten, and the best five in a row when the career is longer than five. */
export function playerPresets(min: number, max: number, peak: Span | null): RangePreset[] {
  const out = rangePresets(min, max).filter((p) => p.id === "all" || p.id === "last10");
  if (peak && (peak.from > min || peak.to < max) && !out.some((p) => p.from === peak.from && p.to === peak.to)) out.push({ id: "peak", from: peak.from, to: peak.to });
  return out;
}

/** Innings from outs, as written in a table: 123.1. */
export const inningsText = (outs: number): string => `${Math.floor(outs / 3)}.${outs % 3}`;

// ---- what the page hands the board -----------------------------------------------------------------------------------------------------

/** How a club looked in a season: its name then, the logo of that era (none when no logo era covers it) and a colour that reads on the page in both themes. */
export interface ClubInfo { team: string | null; logo: string | null; tone: string }
export const clubInfoKey = (league: string, f: number, year: number) => `${league}|${f}|${year}`;

/** A club-season the player is known to have been on (from stats or a roster). */
export interface SeasonInfo { league: string; year: number; label: string; f: number; team: string | null; reg: boolean; po: boolean; teamPo: boolean; champ: boolean }

export interface BoardData {
  name: string;
  /** The seasons the slider spans. */
  min: number;
  max: number;
  /** Position bucket of the league figures the player is compared with. */
  bucket: "F" | "D" | "all";
  /** The player's main position code, which decides the group shown first (a pitcher's pitching before his batting). */
  position: string | null;
  stats: StatRow[];
  seasons: SeasonInfo[];
  clubs: Record<string, ClubInfo>;
  titles: { league: string; year: number; team: string | null }[];
  awards: { league: string; year: number; award: string; team: string | null }[];
  refs: RefPack[];
  /** Seasons the site holds games for, to tell "the league did not play" from "the club did not play" in the seasons table. */
  held: string[];
}

// ---- how much is enough to compare -----------------------------------------------------------------------------------------------------

/** The least a player must have played in the range before the board says how they compare with the league: games, at bats or outs. */
const ENOUGH: Record<string, { regular: number; playoffs: number; key: string }> = {
  skater: { regular: 20, playoffs: 5, key: "gp" },
  goalie: { regular: 15, playoffs: 5, key: "gp" },
  batting: { regular: 100, playoffs: 20, key: "ab" },
  pitching: { regular: 90, playoffs: 30, key: "ipouts" },
};

export function enoughPlayed(group: string, phase: Phase, total: StatNumbers): boolean {
  const e = ENOUGH[group];
  return !!e && (num(total, e.key) ?? 0) >= e[phase];
}

/** A metric's figure for the board's cards and its percentile among the league's players of the seasons played; null parts are left out. */
export function heroFigure(group: GroupDef, m: Metric, rows: readonly StatRow[], refs: RefIndex, phase: Phase): { value: number | null; per: number | null; pct: number | null } {
  const total = sumStats(rows);
  const value = m.get(total);
  const per = m.per ? m.per.get(total) : null;
  let pct: number | null = null;
  if (m.ref && enoughPlayed(group.id, phase, total)) {
    const figure = m.sum ? per : value;
    const seasons = [...new Set(rows.map((r) => r.year))].flatMap((y) => {
      const r = refs.get(refKey(group.id, phase, m.ref!, y));
      return r?.q && r.q.length === 11 ? [{ n: r.n, q: r.q }] : [];
    });
    pct = pooledPercentile(seasons, figure, m.low);
  }
  return { value, per, pct };
}

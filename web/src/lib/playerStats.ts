/**
 * The columns of a player's statistics, by stat group. The database holds counting numbers only (migration 032); every rate
 * (batting average, ERA, GAA, save percentage) is worked out here from them, for a season and for a career alike.
 */
import type { StatNumbers } from "./api/player";

export type StatKind = "int" | "rate3" | "rate2" | "ip";

export interface StatCol {
  key: string;
  /** Phrase key of the column heading (an abbreviation). */
  label: string;
  /** Phrase key of the longer name, shown as a tooltip. */
  title: string;
  kind: StatKind;
  /** The value from a season's (or career's) counting stats, or null when it cannot be worked out. */
  get: (s: StatNumbers) => number | null;
}

const n = (s: StatNumbers, k: string): number | null => (typeof s[k] === "number" ? s[k] : null);
const div = (a: number | null, b: number | null): number | null => (a == null || b == null || b === 0 ? null : a / b);
const raw = (key: string, label: string, title: string = label): StatCol => ({ key, label: `stat.${label}`, title: `stat.${title}.name`, kind: "int", get: (s) => n(s, key) });

export interface StatGroup {
  id: string;
  /** Phrase key of the group's heading. */
  title: string;
  cols: StatCol[];
  /** The stat the season chart draws. */
  main: StatCol;
}

const PTS = raw("pts", "pts");
const WINS = raw("w", "w");
const HR = raw("hr", "hr");

export const STAT_GROUPS: Record<string, StatGroup> = {
  skater: {
    id: "skater", title: "statgroup.skater",
    cols: [raw("gp", "gp"), raw("g", "g"), raw("a", "a"), PTS, raw("pim", "pim"), raw("pm", "pm")],
    main: PTS,
  },
  goalie: {
    id: "goalie", title: "statgroup.goalie",
    cols: [
      raw("gp", "gp"), raw("gs", "gs"), WINS, raw("l", "l"), raw("t", "t"), raw("otl", "otl"),
      { key: "gaa", label: "stat.gaa", title: "stat.gaa.name", kind: "rate2", get: (s) => { const q = div(n(s, "ga"), n(s, "toi")); return q == null ? null : q * 3600; } },
      { key: "svp", label: "stat.svp", title: "stat.svp.name", kind: "rate3", get: (s) => div(n(s, "sv"), n(s, "sa")) },
      raw("so", "so"),
    ],
    main: WINS,
  },
  batting: {
    id: "batting", title: "statgroup.batting",
    cols: [
      raw("g", "gp", "gp"), raw("ab", "ab"), raw("r", "r"), raw("h", "h"), raw("2b", "dbl", "dbl"), raw("3b", "tpl", "tpl"), HR, raw("rbi", "rbi"),
      raw("sb", "sb"), raw("bb", "bb"), raw("so", "k", "k"),
      { key: "avg", label: "stat.avg", title: "stat.avg.name", kind: "rate3", get: (s) => div(n(s, "h"), n(s, "ab")) },
      { key: "obp", label: "stat.obp", title: "stat.obp.name", kind: "rate3", get: (s) => div((n(s, "h") ?? 0) + (n(s, "bb") ?? 0) + (n(s, "hbp") ?? 0), (n(s, "ab") ?? 0) + (n(s, "bb") ?? 0) + (n(s, "hbp") ?? 0) + (n(s, "sf") ?? 0)) },
      { key: "slg", label: "stat.slg", title: "stat.slg.name", kind: "rate3", get: (s) => {
        const h = n(s, "h"), ab = n(s, "ab");
        if (h == null || ab == null || ab === 0) return null;
        const d = n(s, "2b") ?? 0, t = n(s, "3b") ?? 0, r = n(s, "hr") ?? 0;
        return (h + d + 2 * t + 3 * r) / ab;
      } },
    ],
    main: HR,
  },
  pitching: {
    id: "pitching", title: "statgroup.pitching",
    cols: [
      WINS, raw("l", "l"), raw("g", "gp", "gp"), raw("gs", "gs"), raw("sv", "sv"),
      { key: "ip", label: "stat.ip", title: "stat.ip.name", kind: "ip", get: (s) => n(s, "ipouts") },
      { key: "era", label: "stat.era", title: "stat.era.name", kind: "rate2", get: (s) => { const q = div(n(s, "er"), n(s, "ipouts")); return q == null ? null : q * 27; } },
      raw("so", "k", "k"), raw("bb", "bb"),
      { key: "whip", label: "stat.whip", title: "stat.whip.name", kind: "rate2", get: (s) => { const q = div((n(s, "bb") ?? 0) + (n(s, "h") ?? 0), n(s, "ipouts")); return q == null ? null : q * 3; } },
    ],
    main: WINS,
  },
};

/** Groups in the order a page lists them. */
export const STAT_GROUP_ORDER = ["skater", "goalie", "batting", "pitching"] as const;

/** A value as it is written in a table: .298, 2.87, 123.1 (innings: whole, then the thirds as 1 or 2), or a grouped whole number. */
export function showStat(kind: StatKind, v: number | null, fmtInt: (n: number) => string): string {
  if (v == null || Number.isNaN(v)) return "";
  if (kind === "int") return fmtInt(v);
  if (kind === "rate2") return v.toFixed(2);
  if (kind === "ip") return `${Math.floor(v / 3)}.${v % 3}`;
  const t = v.toFixed(3);
  return v < 1 ? t.slice(1) : t;
}

/** The value a column sorts by: innings sort by outs. */
export const sortStat = (v: number | null): number | null => v;

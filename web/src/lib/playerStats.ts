/**
 * The columns of a player's statistics, by stat group. The database holds counting numbers only (migration 032); every rate
 * (batting average, ERA, GAA, save percentage) is worked out here from them, for a season and for a career alike.
 */
import type { StatNumbers } from "./api/player";

/** int: a whole number; rate1, rate2, rate3: that many decimals (rate3 drops the leading zero: .298); pct: a share 0..1 written as a percentage (64.2); ip: innings from outs. */
export type StatKind = "int" | "rate3" | "rate2" | "rate1" | "pct" | "ip";

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

/** A column worked out from counting numbers. */
const calc = (key: string, label: string, kind: StatKind, get: (s: StatNumbers) => number | null): StatCol => ({ key, label: `stat.${label}`, title: `stat.${label}.name`, kind, get });
const per = (top: string, games: string = "gp") => (s: StatNumbers) => div(n(s, top), n(s, games));
/** The NFL passer rating (0 to 158.3) from completions, attempts, yards, touchdowns and interceptions. */
const passerRating = (s: StatNumbers): number | null => {
  const att = n(s, "att"), cmp = n(s, "cmp"), yds = n(s, "yds");
  if (att == null || att <= 0 || cmp == null || yds == null) return null;
  const c = (x: number) => Math.min(2.375, Math.max(0, x));
  return ((c((cmp / att - 0.3) * 5) + c((yds / att - 3) * 0.25) + c(((n(s, "td") ?? 0) / att) * 20) + c(2.375 - ((n(s, "int") ?? 0) / att) * 25)) / 6) * 100;
};
/** Combined tackles: solo and assisted. */
const tackles = (s: StatNumbers): number | null => { const a = n(s, "tkl"), b = n(s, "ast"); return a == null && b == null ? null : (a ?? 0) + (b ?? 0); };
/** Field goals of 50 yards or more. */
const fg50plus = (s: StatNumbers): number | null => { const a = n(s, "fg50"), b = n(s, "fg60"); return a == null && b == null ? null : (a ?? 0) + (b ?? 0); };

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
const YDS = raw("yds", "yds");
const TD = raw("td", "td");

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
  basketball: {
    id: "basketball", title: "statgroup.basketball",
    cols: [
      raw("gp", "gp"), raw("gs", "gs"), calc("mpg", "mpg", "rate1", per("min")), PTS, calc("ppg", "ppg", "rate1", per("pts")),
      raw("reb", "reb"), calc("rpg", "rpg", "rate1", per("reb")), raw("ast", "ast"), calc("apg", "apg", "rate1", per("ast")), raw("stl", "stl"), raw("blk", "blk"),
    ],
    main: PTS,
  },
  passing: {
    id: "passing", title: "statgroup.passing",
    cols: [
      raw("gp", "gp"), raw("cmp", "cmp"), raw("att", "att"), calc("cmppct", "cmppct", "pct", (s) => div(n(s, "cmp"), n(s, "att"))), YDS,
      calc("ypa", "ypa", "rate1", (s) => div(n(s, "yds"), n(s, "att"))), TD, raw("int", "int"), raw("sck", "sck"), calc("rtg", "rtg", "rate1", passerRating),
    ],
    main: YDS,
  },
  rushing: {
    id: "rushing", title: "statgroup.rushing",
    cols: [raw("gp", "gp"), raw("att", "att"), YDS, calc("ypc", "ypc", "rate1", (s) => div(n(s, "yds"), n(s, "att"))), TD, raw("fum", "fum")],
    main: YDS,
  },
  receiving: {
    id: "receiving", title: "statgroup.receiving",
    cols: [raw("gp", "gp"), raw("tgt", "tgt"), raw("rec", "rec"), YDS, calc("ypr", "ypr", "rate1", (s) => div(n(s, "yds"), n(s, "rec"))), TD],
    main: YDS,
  },
  defense: {
    id: "defense", title: "statgroup.defense",
    cols: [
      raw("gp", "gp"), calc("cmb", "cmb", "int", tackles), raw("tkl", "tkl"), raw("ast", "tka"), raw("tfl", "tfl"), raw("sck", "dsck"), raw("int", "dint"),
      raw("pd", "pd"), raw("ff", "ff"), raw("fr", "fr"), TD,
    ],
    main: calc("cmb", "cmb", "int", tackles),
  },
  kicking: {
    id: "kicking", title: "statgroup.kicking",
    cols: [
      raw("gp", "gp"), raw("fgm", "fgm"), raw("fga", "fga"), calc("fgpct", "fgpct", "pct", (s) => div(n(s, "fgm"), n(s, "fga"))), calc("fg50", "fg50", "int", fg50plus),
      raw("xpm", "xpm"), raw("xpa", "xpa"),
    ],
    main: raw("fgm", "fgm"),
  },
  punting: {
    id: "punting", title: "statgroup.punting",
    cols: [raw("gp", "gp"), raw("punts", "punts"), YDS, calc("ypp", "ypp", "rate1", (s) => div(n(s, "yds"), n(s, "punts"))), raw("in20", "in20"), raw("tb", "tb")],
    main: raw("punts", "punts"),
  },
};

/** Groups in the order a page lists them. */
export const STAT_GROUP_ORDER = ["skater", "goalie", "batting", "pitching"] as const;

/** A value as it is written in a table: .298, 2.87, 123.1 (innings: whole, then the thirds as 1 or 2), or a grouped whole number. */
export function showStat(kind: StatKind, v: number | null, fmtInt: (n: number) => string): string {
  if (v == null || Number.isNaN(v)) return "";
  if (kind === "int") return fmtInt(v);
  if (kind === "rate2") return v.toFixed(2);
  if (kind === "rate1") return v.toFixed(1);
  if (kind === "pct") return (v * 100).toFixed(1);
  if (kind === "ip") return `${Math.floor(v / 3)}.${v % 3}`;
  const t = v.toFixed(3);
  return v < 1 ? t.slice(1) : t;
}

/** The value a column sorts by: innings sort by outs. */
export const sortStat = (v: number | null): number | null => v;

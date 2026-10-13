/**
 * The country pages' numbers, worked out from the lists the database gives (no server code here, so a node script can test it):
 * api.country_team_season, api.country_season, api.country_league and api.country_franchise (migration 065), and the roster of one club's season.
 * A player's country is his birth country, else his nationality; the code ZZ stands for "unknown" and is never counted as a country.
 */
import type { PhraseKey } from "./i18n/phrases.constants.ts";
import { STAT_GROUPS, type StatKind } from "./playerStats.ts";

export const UNKNOWN = "ZZ";
export const isKnown = (code: string | null | undefined): code is string => !!code && code !== UNKNOWN;

export interface Count { code: string; n: number }

/** Counts per country, the known ones best first (ties by code), with the unknown ones apart. */
export function tally(counts: Iterable<[string, number]>): { list: Count[]; unknown: number; known: number; total: number } {
  const sum = new Map<string, number>();
  for (const [code, n] of counts) sum.set(code, (sum.get(code) ?? 0) + n);
  const unknown = sum.get(UNKNOWN) ?? 0;
  const list = [...sum].filter(([c, n]) => c !== UNKNOWN && n > 0).map(([code, n]) => ({ code, n })).sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));
  const known = list.reduce((a, c) => a + c.n, 0);
  return { list, unknown, known, total: known + unknown };
}

/** The `keep` biggest and the sum of the rest. */
export function withOther(list: Count[], keep: number): { top: Count[]; other: number } {
  return { top: list.slice(0, keep), other: list.slice(keep).reduce((a, c) => a + c.n, 0) };
}

export const share = (n: number, of: number): number => (of > 0 ? n / of : 0);

export const decadeOf = (year: number): number => Math.floor(year / 10) * 10;

/* ---------- rows as the database gives them ---------- */

export interface TeamSeasonCount { league: string; year: number; franchise_id: number; team_season_id: number; country: string; players: number }
export interface SeasonCount { league: string; year: number; country: string; players: number; season_players: number; season_known: number }
export interface LeagueCount {
  league: string; country: string; players: number; first_year: number; last_year: number;
  first_person_id: number | null; first_name: string | null; league_players: number; league_known: number;
}
export interface FranchiseCount { league: string; franchise_id: number; stat_group: string; country: string; players: number; seasons: number; stats: Record<string, number> }

/* ---------- a country over the seasons ---------- */

export interface SharePoint { x: number; n: number; of: number; share: number }

/** A country's share of the players whose country is known, season by season (`by` "season") or decade by decade (each season counted, so a decade is the average of its seasons weighted by roster size). */
export function shareSeries(rows: SeasonCount[], league: string, country: string, by: "season" | "decade"): SharePoint[] {
  const seasons = new Map<number, { n: number; of: number }>();
  for (const r of rows) {
    if (r.league !== league) continue;
    const cur = seasons.get(r.year) ?? { n: 0, of: r.season_known };
    if (r.country === country) cur.n += r.players;
    seasons.set(r.year, cur);
  }
  const out = new Map<number, { n: number; of: number }>();
  for (const [year, v] of seasons) {
    const x = by === "season" ? year : decadeOf(year);
    const cur = out.get(x) ?? { n: 0, of: 0 };
    cur.n += v.n; cur.of += v.of;
    out.set(x, cur);
  }
  return [...out].sort((a, b) => a[0] - b[0]).filter(([, v]) => v.of > 0).map(([x, v]) => ({ x, n: v.n, of: v.of, share: share(v.n, v.of) }));
}

/** The countries of one league's seasons in a range: player-seasons per country (a player on a roster two years running counts twice). */
export function rangeTally(rows: SeasonCount[], league: string, from: number, to: number): ReturnType<typeof tally> {
  const per = new Map<string, number>();
  for (const r of rows) if (r.league === league && r.year >= from && r.year <= to) per.set(r.country, (per.get(r.country) ?? 0) + r.players);
  return tally(per);
}

/** Layers for a stacked chart: for each year the players of the `keep` countries, then the other known ones and the unknown ones. */
export interface Stack { years: number[]; keep: string[]; counts: Record<string, number[]>; other: number[]; unknown: number[] }
export function stackSeries(rows: { year: number; country: string; players: number }[], keep: string[]): Stack {
  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
  const at = new Map(years.map((y, i) => [y, i]));
  const counts = Object.fromEntries(keep.map((c) => [c, years.map(() => 0)])) as Record<string, number[]>;
  const other = years.map(() => 0), unknown = years.map(() => 0);
  for (const r of rows) {
    const i = at.get(r.year)!;
    if (r.country === UNKNOWN) unknown[i] += r.players;
    else if (counts[r.country]) counts[r.country][i] += r.players;
    else other[i] += r.players;
  }
  return { years, keep, counts, other, unknown };
}

/* ---------- the country ranker: who did better for a club ---------- */

export type RankKind = "skater" | "goalie" | "batting" | "pitching";
type Sums = Record<string, number>;

export interface RankCol {
  key: string;
  label: PhraseKey;
  title: PhraseKey;
  kind: StatKind;
  /** Lower is better (goals against, earned runs). */
  lower?: boolean;
  get: (s: Sums) => number | null;
}

const n = (s: Sums, k: string): number | null => (typeof s[k] === "number" ? s[k] : null);
const div = (a: number | null, b: number | null): number | null => (a == null || b == null || b === 0 ? null : a / b);
const col = (kind: RankKind, key: string): RankCol => {
  const c = STAT_GROUPS[kind].cols.find((x) => x.key === key)!;
  return { key: c.key, label: c.label as PhraseKey, title: c.title as PhraseKey, kind: c.kind, get: c.get, lower: key === "gaa" || key === "era" || key === "whip" };
};
const perGame = (key: string, label: PhraseKey, title: PhraseKey): RankCol => ({ key: `${key}pg`, label, title, kind: "rate2", get: (s) => div(n(s, key), n(s, "gp")) });

/** The columns of each kind's ranker, and the one the countries are ranked by. A country is ranked only with at least `players` players and `volume` of the counting stat. */
export const RANKER: Record<RankKind, { cols: RankCol[]; main: string; volumeKey: string; volume: number }> = {
  skater: {
    cols: [col("skater", "gp"), perGame("g", "cstat.gpg", "cstat.gpg.name"), perGame("a", "cstat.apg", "cstat.apg.name"), perGame("pts", "cstat.ppg", "cstat.ppg.name")],
    main: "ptspg", volumeKey: "gp", volume: 100,
  },
  goalie: {
    cols: [col("goalie", "gp"), col("goalie", "w"), col("goalie", "svp"), col("goalie", "gaa")],
    main: "svp", volumeKey: "gp", volume: 30,
  },
  batting: {
    cols: [
      col("batting", "ab"), col("batting", "avg"), col("batting", "obp"), col("batting", "slg"),
      { key: "ops", label: "stat.ops", title: "stat.ops.name", kind: "rate3", get: (s) => { const o = col("batting", "obp").get(s), g = col("batting", "slg").get(s); return o == null || g == null ? null : o + g; } },
    ],
    main: "ops", volumeKey: "ab", volume: 300,
  },
  pitching: {
    cols: [
      col("pitching", "ip"), col("pitching", "era"), col("pitching", "whip"),
      { key: "k9", label: "cstat.k9", title: "cstat.k9.name", kind: "rate2", get: (s) => { const q = div(n(s, "so"), n(s, "ipouts")); return q == null ? null : q * 27; } },
    ],
    main: "era", volumeKey: "ipouts", volume: 150,
  },
};

export const MIN_PLAYERS = 3;

export function sumStats(list: Sums[]): Sums {
  const out: Sums = {};
  for (const s of list) for (const [k, v] of Object.entries(s)) if (typeof v === "number") out[k] = (out[k] ?? 0) + v;
  return out;
}

export interface RankRow { code: string; players: number; stats: Sums; values: Record<string, number | null>; ranked: boolean }

/** One row for each country with its pooled numbers (the counting stats of its players added up first, then the rates worked out from the sums, so a player with few games weighs little). */
export function rankCountries(kind: RankKind, groups: { code: string; players: number; stats: Sums }[], minPlayers = MIN_PLAYERS): { rows: RankRow[]; best: Record<string, string>; small: { countries: number; players: number } } {
  const spec = RANKER[kind];
  const rows: RankRow[] = groups.filter((g) => isKnown(g.code)).map((g) => {
    const values = Object.fromEntries(spec.cols.map((c) => [c.key, c.get(g.stats)])) as Record<string, number | null>;
    const volume = g.stats[spec.volumeKey] ?? 0;
    return { code: g.code, players: g.players, stats: g.stats, values, ranked: g.players >= minPlayers && volume >= spec.volume };
  });
  const best: Record<string, string> = {};
  for (const c of spec.cols) {
    if (c.kind === "int" || c.kind === "ip") continue; // a count is not a measure of how well they did
    const cand = rows.filter((r) => r.ranked && r.values[c.key] != null);
    if (cand.length < 2) continue;
    const pick = cand.reduce((a, b) => (c.lower ? (b.values[c.key]! < a.values[c.key]! ? b : a) : (b.values[c.key]! > a.values[c.key]! ? b : a)));
    best[c.key] = pick.code;
  }
  const small = rows.filter((r) => !r.ranked);
  const dir = spec.cols.find((c) => c.key === spec.main)!.lower ? 1 : -1;
  const ranked = rows.filter((r) => r.ranked).sort((a, b) => dir * ((a.values[spec.main] ?? 0) - (b.values[spec.main] ?? 0)) || b.players - a.players);
  return { rows: ranked, best, small: { countries: small.length, players: small.reduce((a, r) => a + r.players, 0) } };
}

/* ---------- cool-stat cards ---------- */

export interface Card { id: string; league: string; country: string | null; value: string; year?: number; of?: string }

/**
 * A few curious facts, each from the numbers above and each naming where it comes from. Pure: `known` is how many players of the league have a country,
 * and a league whose country is known for fewer than `MIN_COVERAGE` of its players is left out of the share cards (its shares would be a guess).
 */
export const MIN_COVERAGE = 0.5;
/** And at least this many players with a known country, so a league with a handful of players is not set against the rest. */
export const MIN_KNOWN = 500;

export function coolCards(season: SeasonCount[], league: LeagueCount[]): Card[] {
  const cards: Card[] = [];
  const covered = (lg: string) => {
    const r = league.find((x) => x.league === lg);
    return !!r && r.league_players > 0 && r.league_known >= MIN_KNOWN && r.league_known / r.league_players >= MIN_COVERAGE;
  };
  const leagues = [...new Set(league.map((r) => r.league))].filter(covered);
  const rows = league.filter((r) => leagues.includes(r.league));
  // the season with the most countries
  const per = new Map<string, Set<string>>();
  for (const r of season) if (isKnown(r.country) && leagues.includes(r.league)) { const k = `${r.league}|${r.year}`; (per.get(k) ?? per.set(k, new Set()).get(k)!).add(r.country); }
  let best: { k: string; n: number } | null = null;
  for (const [k, s] of per) if (!best || s.size > best.n) best = { k, n: s.size };
  if (best) { const [lg, y] = best.k.split("|"); cards.push({ id: "mostCountries", league: lg, country: null, value: String(best.n), year: Number(y) }); }
  // the league with the most countries
  const widest = leagues.map((lg) => ({ lg, n: rows.filter((r) => r.league === lg && isKnown(r.country)).length })).sort((a, b) => b.n - a.n)[0];
  if (widest && widest.n > 0) cards.push({ id: "widest", league: widest.lg, country: null, value: String(widest.n) });
  // the league whose biggest country has the smallest share (it takes another league to be the most of)
  const mixed = leagues.length < 2 ? undefined : leagues.map((lg) => {
    const top = rows.filter((r) => r.league === lg && isKnown(r.country)).sort((a, b) => b.players - a.players)[0];
    return { lg, top, s: share(top?.players ?? 0, top?.league_known ?? 0) };
  }).filter((x) => x.top).sort((a, b) => a.s - b.s)[0];
  if (mixed) cards.push({ id: "mixed", league: mixed.lg, country: mixed.top.country, value: String(Math.round(mixed.s * 1000) / 10) });
  // the country that rose most between a league's first decade with it and its latest
  let rise: { lg: string; c: string; d: number } | null = null;
  for (const lg of leagues) {
    for (const r of rows.filter((x) => x.league === lg && isKnown(x.country) && x.players >= 50)) {
      const s = shareSeries(season, lg, r.country, "decade");
      if (s.length < 3) continue;
      const d = s[s.length - 1].share - s[0].share;
      if (!rise || d > rise.d) rise = { lg, c: r.country, d };
    }
  }
  if (rise && rise.d > 0) cards.push({ id: "rise", league: rise.lg, country: rise.c, value: String(Math.round(rise.d * 1000) / 10) });
  // countries with exactly one player in a league
  const single = leagues.map((lg) => ({ lg, n: rows.filter((r) => r.league === lg && isKnown(r.country) && r.players === 1).length })).sort((a, b) => b.n - a.n)[0];
  if (single && single.n > 0) cards.push({ id: "single", league: single.lg, country: null, value: String(single.n) });
  // the newest country: the one whose first player came last
  const newest = rows.filter((r) => isKnown(r.country)).sort((a, b) => b.first_year - a.first_year || a.country.localeCompare(b.country))[0];
  if (newest) cards.push({ id: "newest", league: newest.league, country: newest.country, value: String(newest.first_year), year: newest.first_year });
  return cards;
}

/* ---------- the league-against-league table ---------- */

export interface Versus { code: string; byLeague: Record<string, { n: number; share: number }>; total: number }

/** For each country the players in each league, and the share of that league's players whose country is known. */
export function versus(league: LeagueCount[]): Versus[] {
  const codes = [...new Set(league.filter((r) => isKnown(r.country)).map((r) => r.country))];
  return codes.map((code) => {
    const byLeague: Versus["byLeague"] = {};
    let total = 0;
    for (const r of league) if (r.country === code) { byLeague[r.league] = { n: r.players, share: share(r.players, r.league_known) }; total += r.players; }
    return { code, byLeague, total };
  }).sort((a, b) => b.total - a.total || a.code.localeCompare(b.code));
}

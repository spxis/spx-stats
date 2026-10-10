import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import {
  awardSchema, awardSourceSchema, franchiseNameSchema, gameSchema, gamesBySourceSchema, qualitySchema,
  seasonSummarySchema, sourceSchema, standingSchema, teamBrandSchema, teamSeasonSchema, totalsSchema,
} from "./api/schemas";
import type { AwardRow, SeasonSummaryRow, StandingRow, TotalsRow } from "./api/types";
import { groupBrands, type BrandMap } from "./brand";
import { isSpx } from "./leagues";
import type { ClubTeam, GameTuple, Phase } from "./season";

/* ---------- home, leagues -------------------------------------------------------------- */

export const getSummary = cache(async (): Promise<{ seasons: SeasonSummaryRow[]; totals: TotalsRow }> => {
  const [seasons, totals] = await Promise.all([
    rows("season_summary", "select=*&order=league,year", seasonSummarySchema),
    rows("totals", "select=*", totalsSchema),
  ]);
  if (!totals[0]) throw new Error("totals: no row");
  return { seasons, totals: totals[0] };
});

/** Every brand era of every franchise. A missing or empty view just means no logos or colours yet. */
export const getBrands = cache(async (): Promise<BrandMap> => {
  const all = await rows("team_brand", "select=*&order=franchise_id,brand_from.nullsfirst", teamBrandSchema).catch(() => []);
  return groupBrands(all);
});

/* ---------- a season ------------------------------------------------------------------- */

const PHASE: Record<string, Phase> = { regular: "r", playoffs: "p", preseason: "s", all_star: "a" };

export interface SeasonData {
  league: string;
  year: number;
  label: string;
  teams: ClubTeam[];
  standings: StandingRow[];
  awards: AwardRow[];
  games: GameTuple[];
}

export const getSeason = cache(async (lg: string, y: number): Promise<SeasonData | null> => {
  const q = `league=eq.${lg}&year=eq.${y}`;
  const [summary, games, standings, awards] = await Promise.all([
    rows("season_summary", `${q}&select=*`, seasonSummarySchema),
    rows("games", `${q}&select=*&order=game_date,game_id`, gameSchema),
    rows("standings", `${q}&select=*`, standingSchema),
    rows("awards", `${q}&select=*`, awardSchema),
  ]);
  if (!summary[0]) return null;
  const teams = new Map<number, ClubTeam>();
  for (const g of games) {
    teams.set(g.home_id, { id: g.home_id, f: g.home_f, name: g.home });
    teams.set(g.away_id, { id: g.away_id, f: g.away_f, name: g.away });
  }
  for (const s of standings) teams.set(s.team_id, { id: s.team_id, f: s.franchise_id, name: s.team });
  return {
    league: lg,
    year: y,
    label: summary[0].label,
    teams: [...teams.values()].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    standings: standings.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || (b.w ?? 0) - (a.w ?? 0)),
    awards: awards.sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0)),
    games: games.map((g): GameTuple => [
      g.game_date, g.away_id, g.away_score, g.home_score, g.home_id, PHASE[g.phase] || "r", g.status[0] ?? "", g.source,
      g.overtime ? 1 : 0, g.checked,
    ]),
  };
});

/** Every team of a league's season with the franchise it belongs to, for the map of that season. */
export const getClubs = cache(async (lg: string, y: number) => {
  const st = await rows("standings", `league=eq.${lg}&year=eq.${y}&select=*`, standingSchema).catch(() => []);
  return st.map((s) => ({ franchise_id: s.franchise_id, team: s.team }));
});

/* ---------- a team --------------------------------------------------------------------- */

export interface TeamData {
  f: number;
  names: { name: string; from: string | null; to: string | null }[];
  /** [year, w, l, t, otl] for each season with a record. */
  seasons: [number, number, number | null, number | null, number | null][];
  titles: number[];
}

export const getTeam = cache(async (lg: string, f: number): Promise<TeamData | null> => {
  const q = `league=eq.${lg}&franchise_id=eq.${f}`;
  const [ts, names] = await Promise.all([
    rows("team_seasons", `${q}&select=*&order=year`, teamSeasonSchema),
    rows("franchise_names", `${q}&select=*&order=name_from`, franchiseNameSchema),
  ]);
  if (!ts.length && !names.length) return null;
  const t: TeamData = { f, names: names.map((n) => ({ name: n.name, from: n.name_from, to: n.name_to })), seasons: [], titles: [] };
  let last: string | null = null;
  for (const s of ts) {
    if (s.w != null) t.seasons.push([s.year, s.w, s.l, s.t, s.otl]);
    if (s.champion) t.titles.push(s.year);
    if (!t.names.length) last = s.team;
  }
  if (!t.names.length && last) t.names.push({ name: last, from: null, to: null });
  return t;
});

export const getTeamStandings = cache(async (lg: string, f: number): Promise<StandingRow[]> =>
  rows("standings", `franchise_id=eq.${f}&league=eq.${lg}&select=*&order=year.desc`, standingSchema).catch(() => []));

/** Every (league, franchise) with a page, for the sitemap (franchise_names is far cheaper to page than team_seasons). */
export const getTeamIndex = cache(async (): Promise<{ league: string; franchise_id: number }[]> => {
  const all = await rows("franchise_names", "select=league,franchise_id&order=league,franchise_id", z.object({ league: z.string(), franchise_id: z.number() }));
  const seen = new Set<string>();
  return all.filter((t) => { const k = `${t.league}|${t.franchise_id}`; return seen.has(k) ? false : (seen.add(k), true); });
});

/* ---------- sources, quality ----------------------------------------------------------- */

/** SPX's own databases, scraper store and published files are one source: SPX. */
const one = (c: string): string => (isSpx(c) ? "spx" : c);
const SPX_SOURCE = {
  name: "SPX (SportsInteractive.com)", licence: "Owned by SPX", attribution: "SPX (SportsInteractive.com), 1997–2013",
  url: null, notes: "SPX's own databases, scraper store and published files.",
};

export const getSources = cache(async () => {
  const [src, by, aw] = await Promise.all([
    rows("sources", "select=*", sourceSchema),
    rows("games_by_source", "select=*", gamesBySourceSchema),
    rows("awards", "select=source", awardSourceSchema),
  ]);
  const games = (c: string) => by.filter((b) => one(b.source) === c).reduce((a, b) => a + b.games, 0);
  const winners = (c: string) => aw.filter((w) => one(w.source) === c).length;
  const list = src.filter((s) => one(s.code) !== "spx");
  list.unshift({ ...SPX_SOURCE, code: "spx" });
  return list.map((s) => ({ ...s, games: games(s.code), award_winners: winners(s.code) }));
});

function sum<T extends { n: number }>(list: T[], key: (x: T) => string): T[] {
  const m = new Map<string, T>();
  for (const x of list) {
    const k = key(x);
    const had = m.get(k);
    m.set(k, had ? { ...had, n: had.n + x.n } : x);
  }
  return [...m.values()];
}

export const getQuality = cache(async () => {
  const [q, by] = await Promise.all([
    rows("quality", "select=*&order=n.desc", qualitySchema),
    rows("games_by_source", "select=*&order=league,games.desc", gamesBySourceSchema),
  ]);
  const checks = sum(
    q.filter((x) => x.kind === "check").map((x) => ({ source: one(x.source), kind: x.entity, status: x.what, n: x.n })),
    (x) => [x.source, x.kind, x.status].join("|"),
  );
  const issues = sum(
    q.filter((x) => x.kind === "issue").map((x) => ({
      source: one(x.source), kind: x.entity, issue: x.what, resolution: (x.resolution || "").replace(/\d+/g, "#"), n: x.n,
    })),
    (x) => [x.source, x.kind, x.issue, x.resolution].join("|"),
  );
  const games = sum(by.map((b) => ({ league: b.league, source: one(b.source), n: b.games })), (x) => `${x.league}|${x.source}`);
  const desc = (a: { n: number }, b: { n: number }) => b.n - a.n;
  return {
    checks: checks.sort(desc),
    issues: issues.sort(desc).slice(0, 60),
    games_by_source: games.sort((a, b) => a.league.localeCompare(b.league) || b.n - a.n),
  };
});

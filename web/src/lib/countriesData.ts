import "server-only";
import { cache } from "react";
import { getLeagueCounts, getSeasonCounts } from "./countryData";
import { buildFirstsWire, buildVersusWire, type FirstsWire, type MixBar, type VersusWire } from "./countryLines";
import { isKnown, shareSeries, tally, type LeagueCount, type SeasonCount } from "./countryModel";
import { flagCodes } from "./flagCodes";
import { LEAGUE_CODES } from "./leagues";
import { playerPath } from "./playerPath";
import { getPlayerPaths } from "./playerLinks";
import type { ShareSeries } from "@/components/ShareLines";

/** The countries drawn in the mix bars and the countries the trend lets the reader pick. */
export const BAR_COUNTRIES = 7;
export const TREND_COUNTRIES = 14;

export interface CountriesData {
  leagueRows: LeagueCount[];
  seasonRows: SeasonCount[];
  leagues: string[];
  cover: { league: string; all: number; known: number; countries: number }[];
  overall: ReturnType<typeof tally>;
  flags: Record<string, true>;
  bars: MixBar[];
  barCodes: string[];
}

/** What every part of /countries is worked out from: null while the country views are missing. */
export const getCountriesData = cache(async (): Promise<CountriesData | null> => {
  const [leagueRows, seasonRows] = await Promise.all([getLeagueCounts(), getSeasonCounts()]);
  if (!leagueRows?.length || !seasonRows?.length) return null;
  const leagues = LEAGUE_CODES.filter((l) => leagueRows.some((r) => r.league === l));
  const cover = leagues.map((l) => { const r = leagueRows.find((x) => x.league === l)!; return { league: l, all: r.league_players, known: r.league_known, countries: leagueRows.filter((x) => x.league === l && isKnown(x.country)).length }; });
  const overall = tally(leagueRows.map((r) => [r.country, r.players] as [string, number]));
  const barCodes = overall.list.slice(0, BAR_COUNTRIES).map((c) => c.code);
  const bars = cover.map((c) => ({ ...c, ns: barCodes.map((code) => leagueRows.find((r) => r.league === c.league && r.country === code)?.players ?? 0) }));
  return { leagueRows, seasonRows, leagues, cover, overall, flags: flagCodes(overall.list.map((c) => c.code)), bars, barCodes };
});

export const versusWire = (d: CountriesData): VersusWire => buildVersusWire(d.leagueRows, d.leagues);

export async function firstsWire(d: CountriesData): Promise<FirstsWire> {
  const paths = await getPlayerPaths();
  return buildFirstsWire(d.leagueRows, paths, (id, name, league) => playerPath(league, id, name));
}

/** The countries the trend offers, and each one's share by decade in every league it played in. */
export function trendData(d: CountriesData): Record<string, ShareSeries[]> {
  const out: Record<string, ShareSeries[]> = {};
  for (const c of d.overall.list.slice(0, TREND_COUNTRIES)) {
    out[c.code] = d.leagues.map((l) => ({ league: l, points: shareSeries(d.seasonRows, l, c.code, "decade") })).filter((s) => s.points.length);
  }
  return out;
}

/** The country the trend opens on: the biggest that is not the United States. */
export const trendInitial = (d: CountriesData): string => (d.overall.list.find((c) => c.code !== "US") ?? d.overall.list[0]).code;

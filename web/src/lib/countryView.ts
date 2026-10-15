import type { Slice } from "@/components/CountryDonut";
import type { RankKind, Stack } from "./countryModel";

/** One country of a ranker: its players and the figures worked out for the columns (the pooled counting stats are not sent). */
export interface RankedRow { code: string; players: number; values: Record<string, number | null> }
/** A ranker as the browser draws it (components/CountryRanker.tsx). */
export interface RankedView { rows: RankedRow[]; best: Record<string, string>; small: { countries: number; players: number } }

/**
 * Everything a franchise's "Where the players come from" section draws below its first sentence, as plain data (no server code): the donut, the map,
 * the countries over the seasons and the rankers. The franchise page's route `rows/countries` serves it and the section fetches it when the reader
 * gets near (components/FranchiseCountriesLazy.tsx); it is worked out in lib/franchiseCountryData.ts.
 */
export interface FranchiseCountryView {
  /** The club's current name. */
  name: string;
  total: number;
  known: number;
  unknown: number;
  countries: number;
  /** Too few of the players have a known country for shares and comparisons. */
  limited: boolean;
  slices: Slice[];
  /** The countries that have a flag. */
  flags: Record<string, true>;
  counts: Record<string, number>;
  stack: Stack;
  ranked: { k: RankKind; result: RankedView }[];
}

/** The address of the section's data, from the franchise page's address. */
export const countriesRestPath = (teamPath: string): string => `${teamPath}/rows/countries`;

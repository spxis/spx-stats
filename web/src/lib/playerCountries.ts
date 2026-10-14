import "server-only";
import { z } from "zod";
import { rows } from "./api/client";
import { getLeagueCounts } from "./countryData";
import { countryArgs, fromLeagueRows, fromRows, isPlainLeague, referenceOf, type CountryFilters, type Tally } from "./playerCountryModel";

const countrySchema = z.object({ country: z.string().nullable(), n: z.number() });

/**
 * The players of the list by country under the same choices (league, years, letter, position, search; not the country itself).
 * Asked of api.player_countries (migration 096); where the database lacks it, a league on its own (or none) is answered from the all-time country
 * views (api.country_league), and every other choice gives null, which the page takes as "leave the section out".
 */
export async function getPlayerCountries(f: CountryFilters): Promise<Tally | null> {
  try {
    return fromRows(await rows("rpc/player_countries", countryArgs(f), countrySchema));
  } catch {
    if (!isPlainLeague(f)) return null;
    const all = await getLeagueCounts(f.league || undefined).catch(() => null);
    return all?.length ? fromLeagueRows(all, f.league ?? "") : null;
  }
}

/** The mix the bars are set against (see referenceOf): every league's players, or the chosen league's, all time; null where the views are missing. */
export async function getReferenceCountries(f: CountryFilters): Promise<Tally | null> {
  const kind = referenceOf(f);
  if (!kind) return null;
  const all = await getLeagueCounts(kind === "league" ? f.league : undefined).catch(() => null);
  return all?.length ? fromLeagueRows(all, kind === "league" ? f.league : "") : null;
}

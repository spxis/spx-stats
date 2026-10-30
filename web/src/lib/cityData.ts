import "server-only";
import { cache } from "react";
import { z } from "zod";
import { ApiError, rows, rowsSlice, viewMissing } from "./api/client";
import { teamSeasonRows } from "./api/teamSeasons";
import { buildStays, staysFromRows, unitOf, type CityRef, type ClubSeason, type Placement, type Stay } from "./cityModel";
import { withCupTitles } from "./cup";
import { getCupFinalists, getCupTitles } from "./cupData";
import { getBrands } from "./data";
import { LEAGUE_CODES } from "./leagues";
import type { Speaker } from "./i18n/i18n";
import type { TeamPaths } from "./slug";
import type { CountryOnly } from "./teamHome";
import { getVenueTeams } from "./venueMap";
import type { Pin } from "@/components/mapDraw";

const cityRow = z.object({
  slug: z.string(), name: z.string(), name_fr: z.string().nullable(), region: z.string(), country_code: z.string(),
  latitude: z.number().nullable(), longitude: z.number().nullable(), metro_slug: z.string().nullable(), metro_name: z.string().nullable(), metro_name_fr: z.string().nullable(),
});
const placementRow = z.object({
  league: z.string(), year: z.number(), franchise_id: z.number(), city_slug: z.string(), basis: z.string(),
  latitude: z.number().nullable(), longitude: z.number().nullable(), venue_city_slug: z.string().nullable(),
});
const seasonRow = z.object({
  league: z.string(), year: z.number(), franchise_id: z.number(), team: z.string().nullable(),
  w: z.number().nullable(), l: z.number().nullable(), t: z.number().nullable(), otl: z.number().nullable(), champion: z.boolean().nullable(),
});

export interface CityData {
  cities: CityRef[];
  byslug: Map<string, CityRef>;
  stays: Stay[];
}

const stayRow = z.object({
  league: z.string(), franchise_id: z.number(), city_slug: z.string(), name: z.string(), names: z.array(z.string()), first_year: z.number(), last_year: z.number(), active: z.boolean(),
  runs: z.array(z.tuple([z.number(), z.number()])), rows: z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()])), title_teams: z.array(z.string()),
});

/**
 * The clubs of every city with their seasons there (api.city_stay, migration 168: one request). While the view is a 404 they are added up here from every
 * placement and every club season (about thirty requests), as the city pages did before.
 */
const getCityStays = cache(async (): Promise<Stay[]> => {
  try {
    return staysFromRows(await rows("city_stay", "select=league,franchise_id,city_slug,name,names,first_year,last_year,active,runs,rows,title_teams&order=league,franchise_id,city_slug", stayRow));
  } catch (e) {
    if (!(e instanceof ApiError) || !e.message.endsWith(": 404")) throw e;
    const [placements, seasons] = await Promise.all([
      getPlacements(),
      teamSeasonRows("select=league,year,franchise_id,team,w,l,t,otl,champion&order=league,year,franchise_id", seasonRow),
    ]);
    const club: ClubSeason[] = seasons.map((s) => ({ league: s.league, year: s.year, f: s.franchise_id, team: s.team, w: s.w, l: s.l, t: s.t, otl: s.otl, champion: !!s.champion }));
    return buildStays(placements, club);
  }
});

/**
 * Every city, the city of every club season and the stays they add up to. The views come with migration 062; until it is on the server,
 * or if a read fails, this throws and the pages show their inline "Couldn't load" note (or no city link).
 */
/** Every city (api.city). The teams list reads this and the placements without the club seasons, so it asks for exactly what the city pages ask for and shares their cached reads. */
export const getCities = cache(async (): Promise<CityRef[]> =>
  (await rows("city", "select=slug,name,name_fr,region,country_code,latitude,longitude,metro_slug,metro_name,metro_name_fr&order=slug", cityRow)).map((c) => ({
    slug: c.slug, name: c.name, nameFr: c.name_fr, region: c.region, country: c.country_code, lat: c.latitude, lon: c.longitude,
    metro: c.metro_slug, metroName: c.metro_name, metroNameFr: c.metro_name_fr,
  })));

/** The city of every club season (api.team_season_city). */
export const getPlacements = cache(async (): Promise<Placement[]> =>
  (await rows("team_season_city", "select=league,year,franchise_id,city_slug,basis,latitude,longitude,venue_city_slug&order=league,year,franchise_id", placementRow)).map((p) => ({
    league: p.league, year: p.year, f: p.franchise_id, city: p.city_slug, basis: p.basis, venueLat: p.latitude, venueLon: p.longitude, venueCity: p.venue_city_slug,
  })));

/**
 * The city of each club's newest season (api.team_home_city, migration 180: about 700 rows, one request), which is all the teams list takes from the placements.
 * While the view is a 404 every placement is read (api.team_season_city, twelve requests).
 */
export const getLatestPlacements = cache(async (): Promise<Placement[]> => {
  try {
    return (await rows("team_home_city", "select=league,year,franchise_id,city_slug,basis,latitude,longitude,venue_city_slug&order=league,franchise_id", placementRow)).map((p) => ({
      league: p.league, year: p.year, f: p.franchise_id, city: p.city_slug, basis: p.basis, venueLat: p.latitude, venueLon: p.longitude, venueCity: p.venue_city_slug,
    }));
  } catch (e) {
    if (!viewMissing(e)) throw e;
    return getPlacements();
  }
});

/** The city of each club season in some cities (api.team_season_city read by city: one request for a city and its metro area, not the whole list). */
const getPlacementsIn = async (slugs: string[]): Promise<Placement[]> =>
  slugs.length
    ? (await rows("team_season_city", `city_slug=in.(${slugs.map(encodeURIComponent).join(",")})&select=league,year,franchise_id,city_slug,basis,latitude,longitude,venue_city_slug&order=league,year,franchise_id`, placementRow)).map((p) => ({
      league: p.league, year: p.year, f: p.franchise_id, city: p.city_slug, basis: p.basis, venueLat: p.latitude, venueLon: p.longitude, venueCity: p.venue_city_slug,
    }))
    : [];

const venueCityRow = z.object({ latitude: z.number(), longitude: z.number(), venue_city_slug: z.string() });

/** The key of a point on the venue map: coordinates to five places, as the database holds them. */
export const placeKey = (lat: number, lon: number): string => `${lat.toFixed(5)}|${lon.toFixed(5)}`;

/**
 * The city page of each venue, by the venue's coordinates (placeKey): the city the database placed club seasons at for that point. The venue
 * list needs this and nothing else of the city data. api.venue_city (migration 166) holds one row for each point, about 260 in all; until it is on
 * the server the answer is a 404 and the placements of every club season are read (twelve requests) and reduced here.
 */
export const getVenueCityAt = cache(async (): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  try {
    for (const v of await rows("venue_city", "select=latitude,longitude,venue_city_slug&order=latitude,longitude,venue_city_slug", venueCityRow)) out.set(placeKey(v.latitude, v.longitude), v.venue_city_slug);
  } catch (e) {
    if (!(e instanceof ApiError) || !e.message.endsWith(": 404")) throw e;
    for (const p of await getPlacements()) if (p.venueLat != null && p.venueLon != null && p.venueCity) out.set(placeKey(p.venueLat, p.venueLon), p.venueCity);
  }
  return out;
});

const countryRow = z.object({ league: z.string(), year: z.number(), franchise_id: z.number(), country_code: z.string() });

/** The country of every club season that has no city (api.team_season_country, migration 138). Throws until that view is on the server. */
export const getCountryOnly = cache(async (): Promise<CountryOnly[]> =>
  (await rows("team_season_country", "select=league,year,franchise_id,country_code&order=league,year,franchise_id", countryRow)).map((c) => ({
    league: c.league, year: c.year, f: c.franchise_id, cc: c.country_code,
  })));

export const getCityData = cache(async (): Promise<CityData> => {
  const [cities, stays, cup, finalists] = await Promise.all([getCities(), getCityStays(), getCupTitles(), getCupFinalists()]);
  return { cities, byslug: new Map(cities.map((c) => [c.slug, c])), stays: withCupTitles(stays, cup, finalists) };
});

const at5 = (n: number) => n.toFixed(5);

/**
 * The map dots of a set of stays: one for each venue a club used while it was in those cities, with the venue's name, place, address and
 * Wikipedia page as the team pages' maps give them (the same venue list, filtered to the venues the database placed those seasons at).
 * With `focus` (a city's slug), the venues in that city are marked `me`, so the small map on its page frames them and not the metro area round it.
 */
export async function getCityPins(stays: Stay[], cities: Map<string, CityRef>, paths: TeamPaths, say: Speaker["say"], focus?: string): Promise<Pin[]> {
  const [brands, placements] = await Promise.all([getBrands(), getPlacementsIn([...new Set(stays.map((s) => s.city))])]);
  const unit = (slug: string | null) => { const c = slug ? cities.get(slug) : null; return c ? unitOf(c) : null; };
  const wanted = new Map<string, { years: number[]; stay: Stay }>();
  const mine = new Map(stays.map((s) => [`${s.league}|${s.f}|${s.city}`, s]));
  for (const p of placements) {
    const stay = mine.get(`${p.league}|${p.f}|${p.city}`);
    if (!stay || p.venueLat == null || p.venueLon == null) continue;
    // A venue in another metro area than the city is a mistake in the venue years (the Celtics at Hartford): not drawn.
    if (p.venueCity && unit(p.venueCity) !== unit(p.city)) continue;
    const k = `${p.league}|${p.f}|${at5(p.venueLat)}|${at5(p.venueLon)}`;
    const w = wanted.get(k) ?? { years: [], stay };
    w.years.push(p.year);
    wanted.set(k, w);
  }
  const leagues = LEAGUE_CODES.filter((lg) => stays.some((s) => s.league === lg));
  const teams = (await Promise.all(leagues.map(async (lg) => (await getVenueTeams(lg, brands, paths, say, new Set(stays.filter((s) => s.league === lg).map((s) => s.f))).catch(() => [])).map((t) => ({ lg, t })))))
    .flat();
  const pins: Pin[] = [];
  for (const { lg, t } of teams) {
    for (const v of t.venues) {
      const w = wanted.get(`${lg}|${t.f}|${at5(v.lat)}|${at5(v.lon)}`);
      if (!w) continue;
      const a = Math.min(...w.years), b = Math.max(...w.years);
      pins.push({
        f: pins.length, name: w.stay.name || t.name, venue: `${v.venue} · ${a === b ? a : `${a}–${b}`}`, lat: v.lat, lon: v.lon, cc: v.cc,
        place: v.place, wiki: v.wiki, href: t.href, extra: v.extra, address: v.address, abbr: lg.toUpperCase(), me: focus != null && w.stay.city === focus,
      });
    }
  }
  return pins;
}

const clubCityRow = z.object({ city_slug: z.string() });

/**
 * The city a club plays in now (or played in last), for the link on its team page; null when the cities are not readable or the club has none.
 * It is the city of the club's latest placed season (what the city model's newest stay of the club is), so one row of api.team_season_city, not the whole list.
 */
export async function getClubCity(league: string, f: number): Promise<CityRef | null> {
  try {
    const [last, cities] = await Promise.all([
      rowsSlice("team_season_city", `league=eq.${encodeURIComponent(league)}&franchise_id=eq.${f}&select=city_slug&order=year.desc,league,franchise_id`, 0, 1, clubCityRow),
      getCities(),
    ]);
    const slug = last[0]?.city_slug;
    return slug ? cities.find((c) => c.slug === slug) ?? null : null;
  } catch {
    return null;
  }
}

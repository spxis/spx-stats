import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import { teamSeasonRows } from "./api/teamSeasons";
import { buildStays, unitOf, type CityRef, type ClubSeason, type Placement, type Stay } from "./cityModel";
import { withCupTitles } from "./cup";
import { getCupFinalists, getCupTitles } from "./cupData";
import { getBrands } from "./data";
import { LEAGUE_CODES } from "./leagues";
import type { Speaker } from "./i18n/i18n";
import type { TeamPaths } from "./slug";
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
  placements: Placement[];
  stays: Stay[];
}

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

export const getCityData = cache(async (): Promise<CityData> => {
  const [cities, placements, seasons, cup, finalists] = await Promise.all([
    getCities(),
    getPlacements(),
    teamSeasonRows("select=league,year,franchise_id,team,w,l,t,otl,champion&order=league,year,franchise_id", seasonRow),
    getCupTitles(),
    getCupFinalists(),
  ]);
  const club: ClubSeason[] = seasons.map((s) => ({ league: s.league, year: s.year, f: s.franchise_id, team: s.team, w: s.w, l: s.l, t: s.t, otl: s.otl, champion: !!s.champion }));
  return { cities, byslug: new Map(cities.map((c) => [c.slug, c])), placements, stays: withCupTitles(buildStays(placements, club), cup, finalists) };
});

/** The city of each club now (or last): "league|franchise" to the slug of the city of its latest season, for the team page's link. */
export async function getClubCities(): Promise<Map<string, string>> {
  const { stays } = await getCityData();
  const out = new Map<string, { last: number; city: string }>();
  for (const s of stays) {
    const k = `${s.league}|${s.f}`;
    const had = out.get(k);
    if (!had || s.last > had.last) out.set(k, { last: s.last, city: s.city });
  }
  return new Map([...out].map(([k, v]) => [k, v.city]));
}

const at5 = (n: number) => n.toFixed(5);

/**
 * The map dots of a set of stays: one for each venue a club used while it was in those cities, with the venue's name, place, address and
 * Wikipedia page as the team pages' maps give them (the same venue list, filtered to the venues the database placed those seasons at).
 * With `focus` (a city's slug), the venues in that city are marked `me`, so the small map on its page frames them and not the metro area round it.
 */
export async function getCityPins(stays: Stay[], placements: Placement[], cities: Map<string, CityRef>, paths: TeamPaths, say: Speaker["say"], focus?: string): Promise<Pin[]> {
  const brands = await getBrands();
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
  const teams = (await Promise.all(leagues.map(async (lg) => (await getVenueTeams(lg, brands, paths, say).catch(() => [])).map((t) => ({ lg, t })))))
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

/** The city a club plays in now (or played in last), for the link on its team page; null when the cities are not readable or the club has none. */
export async function getClubCity(league: string, f: number): Promise<CityRef | null> {
  try {
    const [data, clubs] = await Promise.all([getCityData(), getClubCities()]);
    const slug = clubs.get(`${league}|${f}`);
    return slug ? data.byslug.get(slug) ?? null : null;
  } catch {
    return null;
  }
}

import "server-only";
import { z } from "zod";
import { rows, rowsSlice } from "./api/client";
import { alignmentSchema } from "./alignment";
import { getCityData } from "./cityData";
import { countryAt } from "./country";
import { logoFor } from "./brand";
import { getBrands } from "./data";
import { LEAGUE_CODES } from "./leagues";
import type { Speaker } from "./i18n/i18n";
import type { Locale } from "./locale";
import { getPaths } from "./teamSlugs";
import { getNames, getVenueTeams } from "./venueMap";
import { formatVenueAddress, venueMapsUrl } from "./venueAddress";
import { venueCountryName } from "./venueCountry";
import type { VenueDetail } from "./venueDataset";
import type { VenueClub, VenueRow } from "./venueModel";
import { venueSlugs, venueSlugsAfter } from "./venueSlug";
import { getSoccerVenues } from "./venueSoccer";
import { SOCCER_LEAGUES, soccerRows, type SoccerVenue } from "./venueSoccerRows";
import { venueKey } from "./venueVisits";
import { finishRow } from "./venueWire";
import { factsLine, getVenueFacts, getVenueNames, namesLine } from "./venueName";
import { getGameTotals, getTenancies } from "./venueHome";
import { getFutureVenues, getSpringParks } from "./venueLayers";
import { futureLeagues, futureRows, springRows, type LayerContext } from "./venueLayerRows";

export interface VenueList {
  rows: VenueRow[];
  /** The leagues that have venues (home, or a venue planned for one of their clubs), in the order the page lists them. */
  leagues: string[];
  /** What the open dataset adds to a row (by row id): Wikidata id, city, ISO 3166-2 region and every name with its years. */
  detail: Map<string, VenueDetail>;
  /** Every world soccer stadium (a home venue's included), by Wikidata id in upper case: what its page adds. */
  soccer: Map<string, SoccerVenue>;
  /** The soccer stadiums the archive has no coordinates for: they have a page (their detail is in `detail`) but are not rows of the list or of the dataset. */
  unplaced: VenueRow[];
}

const at5 = (n: number) => n.toFixed(5);
const year = (d: string | null) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);
const BY = (a: string, b: string) => a.localeCompare(b, "en");

/** The conference and division each club sits in now: "league|franchise" to its latest alignment row. Empty if the view cannot be read. */
async function currentAlignment(): Promise<Map<string, { conf: string; div: string }>> {
  const out = new Map<string, { conf: string; div: string; year: number }>();
  try {
    const [latest] = await rowsSlice("alignment", "select=year&order=year.desc", 0, 1, z.object({ year: z.number() }));
    if (!latest) return new Map();
    for (const r of await rows("alignment", `year=gte.${latest.year - 1}&select=*`, alignmentSchema)) {
      const k = `${r.league}|${r.franchise_id}`;
      const had = out.get(k);
      if (!had || r.year > had.year) out.set(k, { conf: r.conference_short ?? r.conference ?? "", div: r.division_short ?? r.division ?? "", year: r.year });
    }
  } catch {
    out.clear();
  }
  return new Map([...out].map(([k, v]) => [k, { conf: v.conf, div: v.div }]));
}

/**
 * Every home venue of every league on record, one row each (a venue shared by several clubs or leagues is one row), with its clubs,
 * names, facts and place. Built from the same views the team pages' venue maps use, so the two always agree. Which leagues there are comes
 * from the data: a league added later shows up here with no change.
 */
export async function getVenueList(paths: Awaited<ReturnType<typeof getPaths>>, say: Speaker["say"], locale: Locale = "en"): Promise<VenueList> {
  const [brands, futureList, soccerList] = await Promise.all([getBrands(), getFutureVenues(), getSoccerVenues()]);
  const seen = new Set<string>();
  for (const eras of Object.values(brands)) for (const b of eras) if (b.home_venue && b.latitude != null && b.longitude != null) seen.add(b.league);
  // the leagues the site already knows keep their usual order; any other league follows, by code
  const soccerLeagues = SOCCER_LEAGUES.filter((l) => soccerList.some((v) => v.spans.some((x) => x.lg === l)));
  const known: readonly string[] = [...LEAGUE_CODES, ...SOCCER_LEAGUES];
  const rank = (l: string) => { const i = known.indexOf(l); return i < 0 ? known.length : i; };
  const order = (set: Iterable<string>) => [...set].sort((a, b) => rank(a) - rank(b) || BY(a, b));
  const leagues = order(seen);
  // A league whose only venue is one planned for a club still gets its chip: the league list is the home leagues and those of the future venues.
  const chips = order(new Set([...seen, ...futureLeagues(futureList), ...soccerLeagues]));
  const [byLeague, spans, facts, align, cityData, tenancies, totals, springList] = await Promise.all([
    Promise.all(leagues.map(async (lg) => ({ lg, teams: await getVenueTeams(lg, brands, paths, say).catch(() => []) }))),
    getVenueNames(), getVenueFacts(), currentAlignment(), getCityData().catch(() => null), getTenancies(), getGameTotals(), getSpringParks(),
  ]);

  // The city page of a venue is the one the database placed club seasons at, for those coordinates.
  const cityAt = new Map<string, string>();
  for (const p of cityData?.placements ?? []) if (p.venueLat != null && p.venueLon != null && p.venueCity) cityAt.set(`${at5(p.venueLat)}|${at5(p.venueLon)}`, p.venueCity);

  const byVenue = new Map<string, { row: VenueRow; label: string }>();
  const detail = new Map<string, VenueDetail>();
  for (const { lg, teams } of byLeague) {
    for (const t of teams) {
      for (const v of t.venues) {
        const id = v.wid ?? `${at5(v.lat)}|${at5(v.lon)}`;
        let acc = byVenue.get(id);
        if (!acc) {
          const f = v.wid ? facts.get(v.wid) : undefined;
          const sp = v.wid ? spans.get(v.wid) : undefined;
          const name = sp?.find((s) => s.current)?.name ?? sp?.at(-1)?.name ?? v.venue;
          acc = {
            label: v.venue,
            row: {
              id, key: venueKey(v.wid, v.lat, v.lon), slug: "", name, former: namesLine(sp), lat: v.lat, lon: v.lon, cc: v.cc, place: v.place, citySlug: cityAt.get(`${at5(v.lat)}|${at5(v.lon)}`) ?? null,
              wiki: v.wiki, address: v.address, addressHref: v.addressHref, leagues: [], clubs: [],
              opened: f?.opened ?? null, closed: f?.closed ?? null, state: f?.state ?? null, capacity: f?.capacity ?? null, roof: f?.roof ?? null, surface: f?.surface ?? null, owner: f?.owner ?? null,
              from: null, to: null, current: false, al: [],
              extra: [namesLine(sp), factsLine(f, say)].filter((x): x is string => !!x), kind: "home", tag: null, planned: null, games: v.wid ? totals.get(v.wid.toUpperCase()) ?? null : null,
            },
          };
          byVenue.set(id, acc);
          detail.set(id, { wid: v.wid, city: v.city, iso: v.iso, names: (sp ?? []).map((s) => ({ name: s.name, from: s.from, until: s.until })), surfaceRaw: f?.surfaceRaw ?? null });
        }
        const r = acc.row;
        if (!r.leagues.includes(lg)) r.leagues.push(lg);
        const club: VenueClub = { lg, f: t.f, name: t.name, href: t.href, from: year(v.from), to: v.to ? year(v.to) : null, logo: null };
        const had = r.clubs.find((c) => c.lg === lg && c.f === t.f);
        if (had) {
          had.from = had.from == null || club.from == null ? null : Math.min(had.from, club.from);
          had.to = had.to == null || club.to == null ? null : Math.max(had.to, club.to);
        } else {
          r.clubs.push(club);
        }
      }
    }
  }

  // Who played at each venue, from the home-venue periods: they hold clubs the brand layer's logo eras miss (the Blue Jays at Exhibition Stadium), with their years.
  const franchiseNames = new Map<string, string>();
  if (tenancies.size) {
    await Promise.all(leagues.map(async (lg) => { for (const n of await getNames(lg)) franchiseNames.set(`${lg}|${n.franchise_id}`, n.name); }));
  }
  for (const { row: r } of byVenue.values()) {
    const wid = detail.get(r.id)?.wid;
    for (const t of (wid ? tenancies.get(wid.toUpperCase()) : undefined) ?? []) {
      if (!leagues.includes(t.lg)) continue;
      const had = r.clubs.find((c) => c.lg === t.lg && c.f === t.f);
      if (had) { had.from = t.from; had.to = t.to; continue; }
      const name = franchiseNames.get(`${t.lg}|${t.f}`);
      if (name) r.clubs.push({ lg: t.lg, f: t.f, name, href: paths.team(t.lg, t.f), from: t.from, to: t.to, logo: null });
    }
  }

  const out: VenueRow[] = [];
  for (const { row: r } of byVenue.values()) {
    r.clubs.sort((a, b) => (a.from ?? -1) - (b.from ?? -1) || BY(a.name, b.name));
    // The logo a club wore in its last season here (a venue era ends on the first day of the year it left, hence the year before).
    for (const c of r.clubs) c.logo = logoFor(brands, c.f, c.to == null ? undefined : c.to - 1);
    finishRow(r, chips);
    for (const c of r.clubs) {
      if (c.to != null) continue;
      const a = align.get(`${c.lg}|${c.f}`);
      if (a && (a.conf || a.div)) r.al.push(`${c.lg}|${a.conf}|${a.div}`);
    }
    r.al = [...new Set(r.al)];
    out.push(r);
  }
  out.sort((a, b) => BY(a.name, b.name));
  const slugs = venueSlugs(out.map((r) => ({ id: r.id, name: r.name, wid: detail.get(r.id)?.wid ?? null, city: r.citySlug ?? detail.get(r.id)?.city ?? r.place })));
  for (const r of out) r.slug = slugs.get(r.id) ?? r.id;

  // The spring training parks and the future venues follow the home venues: they are drawn on the same map and listed in the same table, behind their own filter.
  const ctx: LayerContext = {
    leagues: chips, href: (lg, f) => paths.team(lg, f), logo: (f, year) => logoFor(brands, f, year),
    country: (lat, lon) => countryAt(lat, lon), say,
  };
  for (const layer of [springRows(springList, ctx), futureRows(futureList, ctx)]) {
    layer.rows.sort((a, b) => BY(a.name, b.name));
    for (const r of layer.rows) { finishRow(r, chips); out.push(r); detail.set(r.id, layer.detail.get(r.id)!); }
  }

  // The world soccer stadiums: one that is also a home venue keeps its home row (its page adds the soccer); the others are rows of their own, the ones the archive
  // has no coordinates for kept apart (a page, but no dot).
  const homeWids = new Set(out.flatMap((r) => (r.kind === "home" ? [detail.get(r.id)?.wid?.toUpperCase() ?? ""] : [])).filter(Boolean));
  const soccer = new Map(soccerList.map((v) => [v.wid.toUpperCase(), v]));
  const who = { say, locale };
  const world = soccerRows(soccerList, homeWids, {
    say, country: (lat, lon) => countryAt(lat, lon),
    address: (v) => {
      const a = formatVenueAddress({
        street: v.address, city: v.city, region: v.cc === "US" || v.cc === "CA" ? v.region?.split("-")[1] : null, postal: v.postal, countryCode: v.cc, country: v.cc ? venueCountryName(v.cc, who) : null,
      });
      return a?.street ? { text: a.text, href: venueMapsUrl(a, v.lat, v.lon) } : null;
    },
  });
  const all = [...world.rows, ...world.unplaced];
  const taken = new Set(out.flatMap((r) => (r.slug ? [r.slug] : [])));
  const worldSlugs = venueSlugsAfter(all.map((r) => ({ id: r.id, name: r.name, wid: world.detail.get(r.id)?.wid ?? null, city: world.detail.get(r.id)?.city ?? r.place })), taken);
  for (const r of all) { r.slug = worldSlugs.get(r.id) ?? r.id; finishRow(r, chips); detail.set(r.id, world.detail.get(r.id)!); }
  world.rows.sort((a, b) => BY(a.name, b.name));
  out.push(...world.rows);
  return { rows: out, leagues: chips, detail, soccer, unplaced: world.unplaced };
}

import "server-only";
import { z } from "zod";
import { rows, rowsSlice } from "./api/client";
import { alignmentSchema } from "./alignment";
import { getCityData } from "./cityData";
import { getBrands } from "./data";
import { LEAGUE_CODES } from "./leagues";
import type { Speaker } from "./i18n/i18n";
import { getPaths } from "./teamSlugs";
import { getVenueTeams } from "./venueMap";
import type { VenueClub, VenueRow } from "./venueModel";
import { finishRow } from "./venueWire";
import { factsLine, getVenueFacts, getVenueNames, namesLine } from "./venueName";

export interface VenueList {
  rows: VenueRow[];
  /** The leagues that have venues, in the order the page lists them. */
  leagues: string[];
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
export async function getVenueList(paths: Awaited<ReturnType<typeof getPaths>>, say: Speaker["say"]): Promise<VenueList> {
  const brands = await getBrands();
  const seen = new Set<string>();
  for (const eras of Object.values(brands)) for (const b of eras) if (b.home_venue && b.latitude != null && b.longitude != null) seen.add(b.league);
  // the leagues the site already knows keep their usual order; any other league follows, by code
  const rank = (l: string) => { const i = (LEAGUE_CODES as readonly string[]).indexOf(l); return i < 0 ? LEAGUE_CODES.length : i; };
  const leagues = [...seen].sort((a, b) => rank(a) - rank(b) || BY(a, b));
  const [byLeague, spans, facts, align, cityData] = await Promise.all([
    Promise.all(leagues.map(async (lg) => ({ lg, teams: await getVenueTeams(lg, brands, paths, say).catch(() => []) }))),
    getVenueNames(), getVenueFacts(), currentAlignment(), getCityData().catch(() => null),
  ]);

  // The city page of a venue is the one the database placed club seasons at, for those coordinates.
  const cityAt = new Map<string, string>();
  for (const p of cityData?.placements ?? []) if (p.venueLat != null && p.venueLon != null && p.venueCity) cityAt.set(`${at5(p.venueLat)}|${at5(p.venueLon)}`, p.venueCity);

  const byVenue = new Map<string, { row: VenueRow; label: string }>();
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
              id, name, former: namesLine(sp), lat: v.lat, lon: v.lon, cc: v.cc, place: v.place, citySlug: cityAt.get(`${at5(v.lat)}|${at5(v.lon)}`) ?? null,
              wiki: v.wiki, address: v.address, addressHref: v.addressHref, leagues: [], clubs: [],
              opened: f?.opened ?? null, closed: f?.closed ?? null, capacity: f?.capacity ?? null, roof: f?.roof ?? null, surface: f?.surface ?? null, owner: f?.owner ?? null,
              from: null, to: null, current: false, al: [],
              extra: [namesLine(sp), factsLine(f, say)].filter((x): x is string => !!x),
            },
          };
          byVenue.set(id, acc);
        }
        const r = acc.row;
        if (!r.leagues.includes(lg)) r.leagues.push(lg);
        const club: VenueClub = { lg, f: t.f, name: t.name, href: t.href, from: year(v.from), to: v.to ? year(v.to) : null };
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

  const out: VenueRow[] = [];
  for (const { row: r } of byVenue.values()) {
    r.clubs.sort((a, b) => (a.from ?? -1) - (b.from ?? -1) || BY(a.name, b.name));
    finishRow(r, leagues);
    for (const c of r.clubs) {
      if (c.to != null) continue;
      const a = align.get(`${c.lg}|${c.f}`);
      if (a && (a.conf || a.div)) r.al.push(`${c.lg}|${a.conf}|${a.div}`);
    }
    r.al = [...new Set(r.al)];
    out.push(r);
  }
  out.sort((a, b) => BY(a.name, b.name));
  return { rows: out, leagues };
}

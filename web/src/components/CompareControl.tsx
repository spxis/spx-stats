import { CompareMenu, type CompareClub, type CompareGroup } from "@/components/CompareMenu";
import { sameConference, sameDivision, compareHref, comparePath } from "@/lib/compare";
import { logoFor } from "@/lib/brand";
import { getBrands, getSeasonStandings, getTeamStandings } from "@/lib/data";
import { seasonLabel } from "@/lib/leagues";
import { getLeagueClubs, getPaths } from "@/lib/teamSlugs";

async function load(lg: string, f: number, year: number | null | undefined) {
  const own = year == null ? await getTeamStandings(lg, f) : [];
  const groupYear = year ?? (own.length ? Math.max(...own.map((r) => r.year)) : null);
  if (groupYear == null) return null;
  const [rows, paths, clubs, brands] = await Promise.all([getSeasonStandings(lg, groupYear), getPaths(), getLeagueClubs(lg), getBrands()]);
  const me = rows.find((r) => r.franchise_id === f);
  if (!me) return null;
  const inConf = sameConference(me), inDiv = sameDivision(me);
  const list: CompareClub[] = clubs.filter((c) => c.f !== f).map((c) => {
    const row = rows.find((r) => r.franchise_id === c.f);
    const group: CompareGroup = !row ? "none" : inDiv(row) ? "division" : inConf(row) ? "conference" : me.conference && row.conference ? "other" : "league";
    const season = year != null && row ? seasonLabel(lg, year) : "all";
    return { f: c.f, name: c.name, alt: c.alt.slice(0, 6), first: c.first, last: c.last, active: c.active, logo: logoFor(brands, c.f, groupYear), group, href: compareHref(comparePath(paths, lg, f, c.f).path, season) };
  });
  return { season: seasonLabel(lg, groupYear), list, labels: { division: me.division_short ?? me.division ?? null, conference: me.conference_short ?? me.conference ?? null } };
}

/**
 * The Compare button of a team page. `year` is the season being viewed (the comparison opens on it); without one (the
 * franchise page) the groups are those of the club's latest season and the comparison opens all-time.
 * The button is an extra: when its data cannot be fetched the page simply goes without it.
 */
export async function CompareControl({ lg, f, name, year }: { lg: string; f: number; name: string; year?: number | null }) {
  const d = await load(lg, f, year).catch(() => null);
  return d ? <CompareMenu name={name} season={d.season} clubs={d.list} labels={d.labels} /> : null;
}

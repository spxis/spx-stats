import "server-only";
import { rows } from "./api/client";
import { franchiseNameSchema } from "./api/schemas";
import { teamIndexSchema } from "./api/teams";
import { getAlignment } from "./alignmentData";
import { getCities, getPlacements } from "./cityData";
import { getBrands } from "./data";
import { logoFor } from "./brand";
import { LEAGUE_CODES, PARENT } from "./leagues";
import { TEAM_FIELDS } from "./teamIndex";
import { buildGroups, type Conf, type Div, type LeagueGroups } from "./teamGroups";
import type { BoardTeam } from "./teamBoard";
import { formerNames } from "./teamFormer";
import { latestHomes } from "./teamHome";
import type { NameSpan } from "./nameEras";

export interface TeamBoardData {
  teams: BoardTeam[];
  /** The logo addresses the teams point into (each address once). */
  logos: string[];
  /** Per league, every conference and division it ever had. A league with none has no entry. */
  groups: Record<string, { confs: Conf[]; divs: Div[] }>;
}

/**
 * Every franchise for the teams page, with what the browser needs to filter and draw the list: former names with the logo of their years, the
 * country and home of the latest season, and the conferences and divisions it has sat in. The franchise list (api.team_index) must load; the rest
 * is optional, and where a read fails the page just has no country, map, group or former-name logo, never a wrong one. All of it is read once,
 * at the time the page is kept, and sent to the browser, so a visit asks the server for nothing.
 */
export async function getTeamBoard(french: boolean): Promise<TeamBoardData> {
  const [index, brands, names, cities, placements, ...aligned] = await Promise.all([
    rows("team_index", `select=${TEAM_FIELDS.join(",")}&order=name,league,franchise_id`, teamIndexSchema),
    getBrands(),
    rows("franchise_names", "select=league,franchise_id,name,name_from,name_to&order=league,franchise_id,name_from.nullsfirst", franchiseNameSchema).catch(() => []),
    getCities().catch(() => []),
    getPlacements().catch(() => []),
    ...LEAGUE_CODES.map((lg) => getAlignment(lg).catch(() => [])),
  ]);
  const homes = latestHomes(placements, cities, french);
  const spans = new Map<string, NameSpan[]>();
  for (const n of names) {
    const k = `${n.league}|${n.franchise_id}`;
    spans.set(k, [...(spans.get(k) ?? []), { name: n.name, from: n.name_from, to: n.name_to }]);
  }
  const built = new Map<string, LeagueGroups>(LEAGUE_CODES.map((lg, i) => [lg, buildGroups(aligned[i])]));

  const logos: string[] = [];
  const at = new Map<string, number>();
  const logoIndex = (url: string | null): number => {
    if (!url) return -1;
    let i = at.get(url);
    if (i === undefined) { i = logos.length; logos.push(url); at.set(url, i); }
    return i;
  };
  const dot = (n: number | null) => (n == null ? null : Math.round(n * 1000) / 1000);

  // A rival or predecessor league (the AFL, the AAFC) is no league of the list: its clubs are listed under their parent league, which links to them.
  const teams: BoardTeam[] = index.filter((t) => !(t.league in PARENT)).map((t) => {
    const home = homes.get(`${t.league}|${t.franchise_id}`);
    return {
      lg: t.league, f: t.franchise_id, name: t.name,
      former: formerNames(t.former_names, spans.get(`${t.league}|${t.franchise_id}`) ?? [], t.first_season, t.last_season, brands, t.franchise_id).map((x) => [x.name, logoIndex(x.logo)] as [string, number]),
      first: t.first_season, last: t.last_season, seasons: t.seasons, titles: t.titles, share: t.share, active: t.active,
      // The logo a club wears now, or the one it wore in its last season when it is gone (the same as before).
      logo: logoIndex(logoFor(brands, t.franchise_id, t.active ? undefined : (t.last_season ?? undefined))),
      cc: home?.cc ?? null, lat: dot(home?.lat ?? null), lon: dot(home?.lon ?? null), place: home ? `${home.name}, ${home.region}` : null,
      places: built.get(t.league)?.places.get(t.franchise_id) ?? [],
    };
  });
  const groups: TeamBoardData["groups"] = {};
  for (const [lg, g] of built) if (g.confs.length || g.divs.length) groups[lg] = { confs: g.confs, divs: g.divs };
  return { teams, logos, groups };
}

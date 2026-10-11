import type { MetadataRoute } from "next";
import { getSummary, getTeamIndex, getTeamSeasonIndex } from "@/lib/data";
import { LEAGUES, SITE_URL } from "@/lib/leagues";
import { getPaths } from "@/lib/teamSlugs";
import { leadersPath } from "@/lib/leaderStats";
import { seasonPath } from "@/lib/slug";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ seasons, totals }, teams, teamSeasons, paths] = await Promise.all([getSummary(), getTeamIndex(), getTeamSeasonIndex(), getPaths()]);
  const held = new Set(seasons.filter((s) => s.games > 0).map((s) => `${s.league}|${s.year}`));
  const lastModified = new Date(totals.refreshed_at);
  const url = (path: string) => `${SITE_URL}${path}`;
  return [
    { url: url("/"), lastModified },
    ...LEAGUES.map((l) => ({ url: url(`/${l.code}`), lastModified })),
    ...LEAGUES.map((l) => ({ url: url(`/${l.code}/alignment`), lastModified })),
    ...LEAGUES.map((l) => ({ url: url(`/${l.code}/all-time`), lastModified })),
    ...seasons.map((s) => ({ url: url(seasonPath(s.league, s.year)), lastModified })),
    ...seasons.filter((s) => s.games > 0).map((s) => ({ url: url(leadersPath(s.league, s.year)), lastModified })),
    ...teams.map((t) => ({ url: url(paths.team(t.league, t.franchise_id)), lastModified })),
    // A team's season page exists wherever the season holds games and the team has a record.
    ...teamSeasons.filter((t) => t.w != null && held.has(`${t.league}|${t.year}`)).map((t) => ({ url: url(paths.teamSeason(t.league, t.franchise_id, t.year)), lastModified })),
    ...["/about", "/sources", "/quality", "/logos"].map((p) => ({ url: url(p), lastModified })),
  ];
}

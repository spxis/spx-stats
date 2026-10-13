import type { MetadataRoute } from "next";
import { getCityData } from "@/lib/cityData";
import { getSummary, getTeamIndex, getTeamSeasonIndex } from "@/lib/data";
import { LEAGUES, SITE_URL } from "@/lib/leagues";
import { getPaths } from "@/lib/teamSlugs";
import { leadersPath } from "@/lib/leaderStats";
import { scoresPath } from "@/lib/scores";
import { withGaps } from "@/lib/coverage";
import { seasonPath } from "@/lib/slug";

export const revalidate = 3600;

const url = (path: string) => `${SITE_URL}${path}`;

// The sitemap is built at deploy time, so a failed read of the archive leaves that part out instead of failing the build.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [summary, teams, teamSeasons, paths, cityData] = await Promise.allSettled([getSummary(), getTeamIndex(), getTeamSeasonIndex(), getPaths(), getCityData()]);
  const seasons = summary.status === "fulfilled" ? summary.value.seasons : [];
  const lastModified = summary.status === "fulfilled" ? new Date(summary.value.totals.refreshed_at) : new Date();
  const held = new Set(seasons.filter((s) => s.games > 0).map((s) => `${s.league}|${s.year}`));
  const teamUrls = teams.status === "fulfilled" && paths.status === "fulfilled" ? teams.value.map((t) => ({ url: url(paths.value.team(t.league, t.franchise_id)), lastModified })) : [];
  // A team's season page exists wherever the season holds games and the team has a record.
  const teamSeasonUrls =
    teamSeasons.status === "fulfilled" && paths.status === "fulfilled"
      ? teamSeasons.value.filter((t) => t.w != null && held.has(`${t.league}|${t.year}`)).map((t) => ({ url: url(paths.value.teamSeason(t.league, t.franchise_id, t.year)), lastModified }))
      : [];
  // A city page exists for each city with a club season in it.
  const cityUrls = cityData.status === "fulfilled" ? [...new Set(cityData.value.stays.map((s) => s.city))].sort().map((c) => ({ url: url(`/city/${c}`), lastModified })) : [];
  return [
    { url: url("/"), lastModified },
    ...LEAGUES.map((l) => ({ url: url(`/${l.code}`), lastModified })),
    ...LEAGUES.map((l) => ({ url: url(`/${l.code}/alignment`), lastModified })),
    ...LEAGUES.map((l) => ({ url: url(`/${l.code}/all-time`), lastModified })),
    ...LEAGUES.map((l) => ({ url: url(scoresPath(l.code)), lastModified })),
    ...withGaps(seasons).map((s) => ({ url: url(seasonPath(s.league, s.year)), lastModified })),
    ...seasons.filter((s) => s.games > 0).map((s) => ({ url: url(leadersPath(s.league, s.year)), lastModified })),
    ...teamUrls,
    ...teamSeasonUrls,
    ...cityUrls,
    ...["/about", "/teams", "/teams/lineage", "/teams/coaches", "/cities", "/venues", "/players", "/terms", "/privacy","/sources", "/quality", "/logos"].map((p) => ({ url: url(p), lastModified })),
  ];
}

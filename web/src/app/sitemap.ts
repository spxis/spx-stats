import type { MetadataRoute } from "next";
import { getSummary, getTeamIndex, getTeamSeasonIndex } from "@/lib/data";
import { LEAGUES, SITE_URL } from "@/lib/leagues";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ seasons, totals }, teams, teamSeasons] = await Promise.all([getSummary(), getTeamIndex(), getTeamSeasonIndex()]);
  const held = new Set(seasons.filter((s) => s.games > 0).map((s) => `${s.league}|${s.year}`));
  const lastModified = new Date(totals.refreshed_at);
  const url = (path: string) => `${SITE_URL}${path}`;
  return [
    { url: url("/"), lastModified },
    ...LEAGUES.map((l) => ({ url: url(`/${l.code}`), lastModified })),
    ...LEAGUES.map((l) => ({ url: url(`/${l.code}/alignment`), lastModified })),
    ...seasons.map((s) => ({ url: url(`/${s.league}/${s.year}`), lastModified })),
    ...teams.map((t) => ({ url: url(`/${t.league}/team/${t.franchise_id}`), lastModified })),
    // A team's season page exists wherever the season holds games and the team has a record.
    ...teamSeasons.filter((t) => t.w != null && held.has(`${t.league}|${t.year}`)).map((t) => ({ url: url(`/${t.league}/${t.year}/team/${t.franchise_id}`), lastModified })),
    ...["/sources", "/quality", "/logos"].map((p) => ({ url: url(p), lastModified })),
  ];
}

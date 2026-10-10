import type { MetadataRoute } from "next";
import { getSummary, getTeamIndex } from "@/lib/data";
import { LEAGUES, SITE_URL } from "@/lib/leagues";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ seasons, totals }, teams] = await Promise.all([getSummary(), getTeamIndex()]);
  const lastModified = new Date(totals.refreshed_at);
  const url = (path: string) => `${SITE_URL}${path}`;
  return [
    { url: url("/"), lastModified },
    ...LEAGUES.map((l) => ({ url: url(`/${l.code}`), lastModified })),
    ...seasons.map((s) => ({ url: url(`/${s.league}/${s.year}`), lastModified })),
    ...teams.map((t) => ({ url: url(`/${t.league}/team/${t.franchise_id}`), lastModified })),
    ...["/sources", "/quality", "/logos"].map((p) => ({ url: url(p), lastModified })),
  ];
}

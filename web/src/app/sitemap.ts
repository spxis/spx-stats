import type { MetadataRoute } from "next";
import { getCityData } from "@/lib/cityData";
import { getLeagueCounts } from "@/lib/countryData";
import { getSummary, getTeamIndex, getTeamSeasonIndex } from "@/lib/data";
import { ALL_LEAGUES, SITE_URL } from "@/lib/leagues";
import { getPaths } from "@/lib/teamSlugs";
import { getVenueSlugs } from "@/lib/venueData";
import { leadersPath } from "@/lib/leaderStats";
import { scoresPath } from "@/lib/scores";
import { withGaps } from "@/lib/coverage";
import { seasonPath } from "@/lib/slug";
import { getMatchPairs, getSoccerTeams, getTournaments } from "@/lib/soccer";
import { h2hPath, pairKey } from "@/lib/soccerH2H";
import { soccerTeamPath, tournamentPath } from "@/lib/soccerPath";
import { getMlsClubs, getMlsSeasons } from "@/lib/mls";
import { MLS_PATH, mlsClubPath, mlsSeasonPath } from "@/lib/mlsPath";

export const revalidate = 86400;

const url = (path: string) => `${SITE_URL}${path}`;

// The sitemap is built at deploy time, so a failed read of the archive leaves that part out instead of failing the build.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [summary, teams, teamSeasons, paths, cityData, venues, soccer, soccerTeams, countryData, mlsSeasons, mlsClubs, matchPairs] = await Promise.allSettled([getSummary(), getTeamIndex(), getTeamSeasonIndex(), getPaths(), getCityData(), getVenueSlugs(), getTournaments(), getSoccerTeams(), getLeagueCounts(), getMlsSeasons(), getMlsClubs(), getMatchPairs()]);
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
  // A venue page exists for each home venue of the /venues list.
  const venueUrls = venues.status === "fulfilled" ? [...venues.value].sort().map((s) => ({ url: url(`/venue/${s}`), lastModified })) : [];
  // World Cup pages exist once the archive holds a tournament; a failed read leaves them out.
  // A head-to-head page exists for each pair of national teams that have met in a World Cup, men's or women's (lib/soccerH2H.ts).
  const slugById = soccerTeams.status === "fulfilled" ? new Map(soccerTeams.value.map((t) => [t.team_id, t.slug])) : new Map<string, string>();
  const h2hUrls = matchPairs.status === "fulfilled"
    ? [...new Set(matchPairs.value.map((m) => pairKey(m.home_team_id, m.away_team_id)))].flatMap((k) => {
        const [x, y] = k.split("|").map((id) => slugById.get(id));
        return x && y ? [{ url: url(h2hPath(x, y)), lastModified }] : [];
      })
    : [];
  const soccerUrls = [
    ...(soccer.status === "fulfilled" && soccer.value.length ? ["/soccer", "/worldcup", "/worldcup/teams", ...soccer.value.map((t) => tournamentPath(t.year))].map((p) => ({ url: url(p), lastModified })) : []),
    ...(soccerTeams.status === "fulfilled" ? soccerTeams.value.filter((t) => t.tournaments > 0).map((t) => ({ url: url(soccerTeamPath(t.slug)), lastModified })) : []),
    ...h2hUrls,
  ];
  // MLS pages exist once the archive holds a season.
  const mlsUrls = mlsSeasons.status === "fulfilled" && mlsSeasons.value.length
    ? [MLS_PATH, ...mlsSeasons.value.map((x) => mlsSeasonPath(x.year)), ...(mlsClubs.status === "fulfilled" ? mlsClubs.value.map((c) => mlsClubPath(c.slug)) : [])].map((p) => ({ url: url(p), lastModified }))
    : [];
  // A country page exists for each country with a player on record (migration 068's views; none while they are missing).
  const countryUrls = countryData.status === "fulfilled" && countryData.value ? [...new Set(countryData.value.map((r) => r.country).filter((c) => c !== "ZZ"))].sort().map((c) => ({ url: url(`/country/${c}`), lastModified })) : [];
  const worldUrls = countryData.status === "fulfilled" && countryData.value ? [...new Set(countryData.value.map((r) => r.league))].map((l) => ({ url: url(`/${l}/world`), lastModified })) : [];
  return [
    { url: url("/"), lastModified },
    ...ALL_LEAGUES.map((l) => ({ url: url(`/${l.code}`), lastModified })),
    ...ALL_LEAGUES.map((l) => ({ url: url(`/${l.code}/alignment`), lastModified })),
    ...ALL_LEAGUES.map((l) => ({ url: url(`/${l.code}/all-time`), lastModified })),
    ...ALL_LEAGUES.map((l) => ({ url: url(scoresPath(l.code)), lastModified })),
    ...withGaps(seasons).map((s) => ({ url: url(seasonPath(s.league, s.year)), lastModified })),
    ...seasons.filter((s) => s.games > 0).map((s) => ({ url: url(leadersPath(s.league, s.year)), lastModified })),
    ...teamUrls,
    ...teamSeasonUrls,
    ...cityUrls,
    ...venueUrls,
    ...soccerUrls,
    ...mlsUrls,
    ...countryUrls,
    ...worldUrls,
    ...["/about", "/teams", "/teams/lineage", "/teams/coaches", "/cities", "/venues", "/countries", "/players", "/terms", "/privacy","/sources", "/quality", "/logos"].map((p) => ({ url: url(p), lastModified })),
  ];
}

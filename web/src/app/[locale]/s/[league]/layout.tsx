import { NcaafCredit } from "@/components/NcaafCredit";
import { SportMark } from "@/components/SportMark";
import { TeamData } from "@/components/TeamData";
import { RELATED_LEAGUES, type LeagueCode } from "@/lib/leagues";

/**
 * Every page of a league carries its mark (the header swoosh's centre takes the league's colour, components/SportMark.tsx) and the team addresses and logo fits of
 * that league and its relatives, a rival league's clubs being today's franchises (components/TeamData.tsx); a page that draws other leagues' teams too wraps itself with those.
 */
export default async function LeagueLayout({ children, params }: { children: React.ReactNode; params: Promise<{ league: string }> }) {
  const { league } = await params;
  return <SportMark sport={league}><TeamData leagues={[league, ...(RELATED_LEAGUES[league as LeagueCode] ?? [])]}>{children}</TeamData>{league === "ncaaf" ? <NcaafCredit /> : null}</SportMark>;
}

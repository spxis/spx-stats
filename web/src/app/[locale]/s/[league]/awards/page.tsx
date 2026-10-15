import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { LeagueAwards } from "@/components/LeagueAwards";
import { awardGridPagePath } from "@/lib/awardGrid";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, leagueInfo } from "@/lib/leagues";
import { leagueAwardGrid } from "@/lib/leagueTables";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";

export const revalidate = 86400;

// Nothing is drawn at build time: each address is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

type Props = PageProps<"/[locale]/s/[league]/awards">;

/**
 * Every award of a league, season by season, on a page of its own: the grid the league page cuts to its newest seasons (its "Show all" is a link here
 * where script is off). The same grid, with every season in it.
 */
export const generateMetadata = guardMeta(async ({ params }: Props): Promise<Metadata> => {
  const { league } = await params;
  const info = isLeague(league) ? leagueInfo(league) : null;
  if (!info) return {};
  const { say, plural, locale } = await currentSpeaker();
  const grid = await leagueAwardGrid(league);
  return pageMeta({
    title: `${say("awards.bySeason")} · ${info.name} (${info.short})`,
    description: say("awards.bySeasonNote", { winners: plural("count.awardWinners", grid.winners), seasons: plural("count.seasons", grid.seasons.length) }),
    path: awardGridPagePath(league), locale,
  });
});

export default guard(async function AwardsPage({ params }: Props) {
  const { league: lg } = await params;
  if (!isLeague(lg)) notFound();
  const info = leagueInfo(lg)!;
  const { say } = await currentSpeaker();
  const grid = await leagueAwardGrid(lg);
  if (!grid.seasons.length) notFound();
  return (
    <>
      <AccentStyle league={lg} />
      <section className="head fade">
        <span className="eyebrow"><Link href={`/${lg}`}>{info.short}</Link></span>
        <p className="note"><Link href={`/${lg}`}>{say("team.backToTeam", { name: info.name })}</Link></p>
      </section>
      <LeagueAwards lg={lg} full />
    </>
  );
});

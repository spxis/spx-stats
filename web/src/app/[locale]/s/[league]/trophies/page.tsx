import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { TrophyBoards, TrophyCards } from "@/components/TrophyBlocks";
import { trophiesPath } from "@/lib/awardTrophy";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, leagueInfo } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getLeagueTrophyRows, getTrophyList } from "@/lib/trophyData";

export const revalidate = 86400;

// Nothing is drawn at build time: each address is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

type Props = PageProps<"/[locale]/s/[league]/trophies">;

/** Every trophy of one league as cards, and who won the most in it: the league's side of the site-wide /trophies. */
export const generateMetadata = guardMeta(async ({ params }: Props): Promise<Metadata> => {
  const { league } = await params;
  const info = isLeague(league) ? leagueInfo(league) : null;
  if (!info) return {};
  const { say, plural, locale } = await currentSpeaker();
  const [list, rows] = await Promise.all([getTrophyList(), getLeagueTrophyRows(league)]);
  const n = list.filter((t) => t.league === league).length;
  return pageMeta({
    title: say("trophies.leagueTitle", { league: info.short }),
    description: say("trophies.leagueMetaDesc", { league: info.short, trophies: plural("count.trophies", n), winners: plural("count.winners", rows.length) }),
    path: trophiesPath(league), locale,
  });
});

export default guard(async function LeagueTrophiesPage({ params }: Props) {
  const { league: lg } = await params;
  if (!isLeague(lg)) notFound();
  const info = leagueInfo(lg)!;
  const { say, plural } = await currentSpeaker();
  const [list, rows] = await Promise.all([getTrophyList(), getLeagueTrophyRows(lg)]);
  const mine = list.filter((t) => t.league === lg);
  if (!mine.length) notFound();
  return (
    <>
      <AccentStyle league={lg} />
      <section className="head fade">
        <span className="eyebrow"><Link href={`/${lg}`}>{info.short}</Link></span>
        <h1>{say("trophies.leagueTitle", { league: info.short })}</h1>
        <p className="lede">{say("trophies.leagueLede", { league: info.name, trophies: plural("count.trophies", mine.length), winners: plural("count.winners", rows.length) })}</p>
        <p className="note"><Link href={`/${lg}`}>{say("team.backToTeam", { name: info.name })}</Link> · <Link href={trophiesPath()}>{say("trophies.allLink")}</Link></p>
      </section>
      <section className="section">
        <TrophyCards infos={mine} rows={rows} />
      </section>
      <TrophyBoards rows={rows} />
    </>
  );
});

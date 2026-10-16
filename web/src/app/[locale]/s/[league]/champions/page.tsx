import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { ChampionsTable } from "@/components/ChampionsTable";
import { champPagePath } from "@/lib/champLines";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, leagueInfo } from "@/lib/leagues";
import { leagueChampLines } from "@/lib/leagueTables";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";

export const revalidate = 2592000;

// Nothing is drawn at build time: each address is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

type Props = PageProps<"/[locale]/s/[league]/champions">;

/**
 * Every champion of a league on a page of its own: the list the league page cuts to its newest seasons (its "Show all" is a link here where script is
 * off). The same table, with every season in it.
 */
export const generateMetadata = guardMeta(async ({ params }: Props): Promise<Metadata> => {
  const { league } = await params;
  const info = isLeague(league) ? leagueInfo(league) : null;
  if (!info) return {};
  const { say, plural, locale } = await currentSpeaker();
  const { lines } = await leagueChampLines(league);
  return pageMeta({ title: `${say("league.champions")} · ${info.name} (${info.short})`, description: plural("count.champions", lines.length), path: champPagePath(league), locale });
});

export default guard(async function ChampionsPage({ params }: Props) {
  const { league: lg } = await params;
  if (!isLeague(lg)) notFound();
  const info = leagueInfo(lg)!;
  const { say, plural } = await currentSpeaker();
  const { lines, logos } = await leagueChampLines(lg);
  if (!lines.length) notFound();
  return (
    <>
      <AccentStyle league={lg} />
      <section className="head fade">
        <span className="eyebrow"><Link href={`/${lg}`}>{info.short}</Link></span>
        <h1>{say("league.champions")}</h1>
        <p className="note">{plural("count.champions", lines.length)}</p>
        <p className="note"><Link href={`/${lg}`}>{say("team.backToTeam", { name: info.name })}</Link></p>
      </section>
      <section className="section">
        <div className="tablebox"><ChampionsTable lg={lg} head={lines} logos={logos} total={lines.length} /></div>
      </section>
    </>
  );
});

import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { EventCards, decadeName, listName } from "@/components/AllStar";
import { Credits } from "@/components/Credits";
import { getAllStar, getClubs } from "@/lib/allStar";
import { allStarPath, decadeOf, decadePath, parseDecade } from "@/lib/allStarView";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, leagueInfo } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getPlayerPaths } from "@/lib/playerLinks";
import "@/components/allstar.css";

export const revalidate = 2592000;

// Nothing is drawn at build time: each address is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

type Props = PageProps<"/[locale]/s/[league]/all-star/decade/[decade]">;

export const generateMetadata = guardMeta(async ({ params }: Props): Promise<Metadata> => {
  const { league, decade } = await params;
  const d = parseDecade(decade);
  const info = isLeague(league) ? leagueInfo(league) : null;
  if (!info || d == null) return {};
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: decadeName(say, league, info.short, d), description: say("allstar.metaDecade", { league: info.short, decade: `${d}s` }), path: decadePath(league, d), locale });
});

/** The All-Star Games of one decade, a card each: the older decades of the league's list, which keeps the newest ones on its own page. */
export default guard(async function AllStarDecadePage({ params }: Props) {
  const { league: lg, decade } = await params;
  const d = parseDecade(decade);
  if (!isLeague(lg) || d == null) notFound();
  const info = leagueInfo(lg)!;
  const { say, dt } = await currentSpeaker();
  const [data, player, clubs] = await Promise.all([getAllStar(lg), getPlayerPaths(), getClubs(lg)]);
  const events = data.events.filter((e) => decadeOf(e.year) === d).sort((a, b) => b.year - a.year || b.event_no - a.event_no);
  if (!events.length) notFound();
  const decades = [...new Set(data.events.map((e) => decadeOf(e.year)))].sort((a, b) => b - a);
  return (
    <>
      <AccentStyle league={lg} />
      <section className="head fade">
        <span className="eyebrow"><Link href={allStarPath(lg)}>{listName(say, lg, info.short)}</Link></span>
        <h1>{decadeName(say, lg, info.short, d)}</h1>
        <p className="asyears">
          {decades.map((x) => <Link key={x} href={decadePath(lg, x)} aria-current={x === d ? "page" : undefined}>{x}s</Link>)}
        </p>
        <p className="note"><Link href={allStarPath(lg)}>{say("allstar.back", { league: info.short })}</Link></p>
      </section>
      <section className="section">
        <EventCards lg={lg} events={events} data={data} clubs={clubs} say={say} dt={dt} player={player} />
      </section>
      <p className="note"><Credits say={say} use={["wikipedia"]} /></p>
    </>
  );
});

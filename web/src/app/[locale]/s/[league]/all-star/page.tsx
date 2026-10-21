import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { EventCards, listName } from "@/components/AllStar";
import { Credits } from "@/components/Credits";
import { getAllStar, getClubs } from "@/lib/allStar";
import { allStarPath, decadePath, listSplit } from "@/lib/allStarView";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, leagueInfo } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getPlayerPaths } from "@/lib/playerLinks";

export const revalidate = 2592000;

// Nothing is drawn at build time: each address is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

type Props = PageProps<"/[locale]/s/[league]/all-star">;

export const generateMetadata = guardMeta(async ({ params }: Props): Promise<Metadata> => {
  const { league } = await params;
  const info = isLeague(league) ? leagueInfo(league) : null;
  if (!info) return {};
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: listName(say, league, info.short), description: say("allstar.metaList", { league: info.short }), path: allStarPath(league), locale });
});

/** Every All-Star Game of a league on one page, a card each: the year, the result as a scoreboard with the logos of the sides that are clubs, the venue and host club, the Most Valuable Player; each year leads to the game's own page. */
export default guard(async function AllStarListPage({ params }: Props) {
  const { league: lg } = await params;
  if (!isLeague(lg)) notFound();
  const info = leagueInfo(lg)!;
  const { say, plural, dt } = await currentSpeaker();
  const [data, player, clubs] = await Promise.all([getAllStar(lg), getPlayerPaths(), getClubs(lg)]);
  if (!data.events.length) notFound();
  const { shown, older } = listSplit(data.events);
  const played = data.events.filter((e) => e.status === "played").length;
  return (
    <>
      <AccentStyle league={lg} />
      <section className="head fade">
        <span className="eyebrow"><Link href={`/${lg}`}>{info.short}</Link></span>
        <h1>{listName(say, lg, info.short)}</h1>
        <p className="lede">{say("allstar.lede", { games: plural("allstar.count", played) })}</p>
        <p className="note"><Link href={`/${lg}`}>{say("team.backToTeam", { name: info.name })}</Link></p>
      </section>
      <section className="section">
        <EventCards lg={lg} events={shown} data={data} clubs={clubs} say={say} dt={dt} player={player} />
      </section>
      {older.length ? (
        <section className="section">
          <h2>{say("allstar.older")}</h2>
          <p className="asyears">{older.map((o) => <Link key={o.decade} href={decadePath(lg, o.decade)} title={say("allstar.olderCount", { decade: `${o.decade}s`, count: o.count })}>{o.decade}s</Link>)}</p>
        </section>
      ) : null}
      <p className="note"><Credits say={say} use={["wikipedia"]} /></p>
    </>
  );
});

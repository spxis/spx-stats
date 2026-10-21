import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { EventResult, MvpNames, VenueName, listName } from "@/components/AllStar";
import { Credits } from "@/components/Credits";
import { SortTable } from "@/components/SortTable";
import { getAllStar } from "@/lib/allStar";
import { allStarPath, partsOf, type AllStarEvent } from "@/lib/allStarView";
import { atUtc } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, leagueInfo } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getPlayerPaths } from "@/lib/playerLinks";
import { tableOf } from "@/lib/sort";

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

/** Every All-Star Game of a league on one page: when and where, the result, the Most Valuable Player; each year leads to the game's own page. */
export default guard(async function AllStarListPage({ params }: Props) {
  const { league: lg } = await params;
  if (!isLeague(lg)) notFound();
  const info = leagueInfo(lg)!;
  const { say, plural, dt } = await currentSpeaker();
  const [data, player] = await Promise.all([getAllStar(lg), getPlayerPaths()]);
  if (!data.events.length) notFound();
  const list = [...data.events].sort((a, b) => b.year - a.year || b.event_no - a.event_no);
  const played = list.filter((e) => e.status === "played").length;
  const table = tableOf<AllStarEvent>(list, [
    {
      key: "year", label: say("allstar.col.year"), num: true, cls: "seasoncell", get: (e) => e.year + e.event_no / 10,
      cell: (e) => <Link href={allStarPath(lg, e.year)}>{e.event_no > 1 ? `${e.year} (${e.event_no})` : e.year}</Link>,
    },
    { key: "date", label: say("col.date"), get: (e) => e.first_day, cell: (e) => (e.first_day ? dt.ymd(atUtc(e.first_day)) : "") },
    {
      key: "result", label: say("col.result"), nosort: true,
      cell: (e) => <EventResult ev={e} games={partsOf(data, e).games} say={say} />,
    },
    { key: "venue", label: say("col.venue"), cls: "team", get: (e) => e.venue_name, cell: (e) => <VenueName name={e.venue_name} wid={e.venue_wikidata_id} /> },
    { key: "city", label: say("col.location"), get: (e) => e.city_text },
    { key: "host", label: say("allstar.col.host"), get: (e) => e.host_name },
    {
      key: "mvp", label: say("allstar.col.mvp"), get: (e) => partsOf(data, e).mvps[0]?.name,
      cell: (e) => <MvpNames mvps={partsOf(data, e).mvps} lg={lg} player={player} />,
    },
  ], (e) => `${e.year}:${e.event_no}`);
  return (
    <>
      <AccentStyle league={lg} />
      <section className="head fade">
        <span className="eyebrow"><Link href={`/${lg}`}>{info.short}</Link></span>
        <h1>{listName(say, lg, info.short)}</h1>
        <p className="lede">{say("allstar.lede", { games: plural("allstar.count", played) })}</p>
        <p className="note"><Link href={`/${lg}`}>{say("team.backToTeam", { name: info.name })}</Link></p>
      </section>
      <section className="section scroll">
        <div className="tablebox"><SortTable {...table} param="sort_allstar" def="year.desc" /></div>
      </section>
      <p className="note"><Credits say={say} use={["wikipedia"]} /></p>
    </>
  );
});

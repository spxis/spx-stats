import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SeasonBars } from "@/components/SeasonBars";
import { SortTable } from "@/components/SortTable";
import { AccentStyle } from "@/components/AccentStyle";
import { Badge, TeamLink } from "@/components/ui";
import { withCoverage } from "@/lib/coverage";
import { getSummary } from "@/lib/data";
import { fmt } from "@/lib/format";
import { isLeague, LEAGUE_CODES, LEAGUES, SRC } from "@/lib/leagues";
import { pageMeta } from "@/lib/meta";
import { tableOf } from "@/lib/sort";

export const revalidate = 3600;
export const dynamicParams = false;
export const generateStaticParams = () => LEAGUE_CODES.map((league) => ({ league }));

export async function generateMetadata({ params }: PageProps<"/[league]">): Promise<Metadata> {
  const { league } = await params;
  const info = LEAGUES.find((l) => l.code === league);
  if (!info) return {};
  const { seasons } = await getSummary();
  const list = seasons.filter((x) => x.league === league);
  const champs = list.filter((x) => x.champion).length;
  return pageMeta({
    title: `${info.name} (${info.short})`,
    description: `${info.short} seasons, standings, champions and awards: ${list.length} seasons held, ${champs} champions on record.`,
    path: `/${league}`,
  });
}

export default async function LeaguePage({ params }: PageProps<"/[league]">) {
  const { league: lg } = await params;
  if (!isLeague(lg)) notFound();
  const info = LEAGUES.find((l) => l.code === lg)!;
  const s = await getSummary();
  const list = withCoverage(s.seasons).filter((x) => x.league === lg).sort((a, b) => a.year - b.year);
  const withGames = list.filter((x) => x.games > 0);
  const champs = list.filter((x) => x.champion).reverse();
  const champions = tableOf(champs, [
    { key: "season", label: "Season", num: true, cls: "seasoncell", get: (c) => c.year, cell: (c) => <Link href={`/${lg}/${c.year}`} prefetch={false}>{c.label}</Link> },
    { key: "champion", label: "Champion", cls: "team", get: (c) => c.champion, cell: (c) => <TeamLink lg={lg} f={c.champion_franchise} name={c.champion} /> },
    { key: "final", label: "Final", cls: "note", get: (c) => c.champion_note, cell: (c) => c.champion_note || "" },
    { key: "source", label: "Source", get: (c) => SRC[c.champion_source ?? ""] || c.champion_source, cell: (c) => <Badge src={c.champion_source} /> },
  ], (c) => c.year);
  return (
    <>
      <AccentStyle league={lg} />
      <section className="head fade">
        <span className="eyebrow">{info.short}</span>
        <h1>{info.name}</h1>
        <p className="lede">{`${list.length} seasons held, ${withGames.length} with games. ${champs.length} champions on record.`}</p>
      </section>
      <section className="section">
        <h2>Seasons</h2>
        <div className="seasonlist">
          {list.map((x) => (
            <Link key={x.year} prefetch={false} href={`/${lg}/${x.year}`} className={x.share >= 0.98 ? "full" : undefined}
              title={x.games ? `${fmt(x.finals)} of ${fmt(x.games)} with a result` : "Awards only"}>
              {x.label}
            </Link>
          ))}
        </div>
      </section>
      {withGames.length ? (
        <section className="section">
          <h2>Games and results by season</h2>
          <div className="legend">
            <span><i style={{ background: "var(--accent)" }} />With a result</span>
            <span><i style={{ background: "var(--accent)", opacity: 0.22 }} />Held, no result</span>
          </div>
          <SeasonBars lg={lg} list={withGames.map((x) => ({ year: x.year, label: x.label, games: x.games, finals: x.finals, champion: x.champion }))} />
        </section>
      ) : null}
      <section className="section">
        <h2>Champions</h2>
        {champs.length ? (
          <div className="tablebox"><SortTable {...champions} def="season.desc" /></div>
        ) : <p className="note">No champions recorded yet.</p>}
      </section>
    </>
  );
}

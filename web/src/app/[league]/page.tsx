import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SeasonBars } from "@/components/SeasonBars";
import { LeagueAwards } from "@/components/LeagueAwards";
import { SortTable } from "@/components/SortTable";
import { AccentStyle } from "@/components/AccentStyle";
import { TeamLogo } from "@/components/TeamLogo";
import { ChampionNote } from "@/components/ChampionNote";
import { ChampionRow } from "@/components/ChampionRow";
import { Badge, NoSeason, TeamLink } from "@/components/ui";
import { leagueSat } from "@/lib/noSeason";
import { withCoverage } from "@/lib/coverage";
import { logoFor } from "@/lib/brand";
import { championRow } from "@/lib/champions";
import { getBrands, getSummary } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LEAGUE_CODES, LEAGUES, srcName } from "@/lib/leagues";
import { pageMeta } from "@/lib/meta";
import { tableOf } from "@/lib/sort";
import { seasonPath } from "@/lib/slug";
import { franchiseOfName, getPaths } from "@/lib/teamSlugs";
import { guard, guardMeta } from "@/lib/loadGuard";

export const revalidate = 3600;
export const dynamicParams = false;
export const generateStaticParams = () => LEAGUE_CODES.map((league) => ({ league }));

export const generateMetadata = guardMeta(async ({ params }: PageProps<"/[league]">): Promise<Metadata> => {
  const { league } = await params;
  const info = LEAGUES.find((l) => l.code === league);
  if (!info) return {};
  const { say, plural, locale } = await currentSpeaker();
  const { seasons } = await getSummary();
  const list = seasons.filter((x) => x.league === league);
  const champs = list.filter((x) => x.champion).length;
  return pageMeta({
    title: `${info.name} (${info.short})`,
    description: say("league.metaDesc", { league: info.short, seasons: plural("count.seasons", list.length), champions: plural("count.champions", champs) }),
    path: `/${league}`,
    locale,
  });
});

export default guard(async function LeaguePage({ params }: PageProps<"/[league]">) {
  const { league: lg } = await params;
  if (!isLeague(lg)) notFound();
  const info = LEAGUES.find((l) => l.code === lg)!;
  const { say, plural, fmt } = await currentSpeaker();
  const [s, brands, paths] = await Promise.all([getSummary(), getBrands(), getPaths()]);
  const list = withCoverage(s.seasons).filter((x) => x.league === lg).sort((a, b) => a.year - b.year);
  const withGames = list.filter((x) => x.games > 0);
  const champs = await Promise.all(list.filter((x) => x.champion).reverse().map(async (x) =>
    x.champion_franchise != null ? x : { ...x, champion_franchise: await franchiseOfName(lg, x.champion) }));
  const champions = tableOf(champs, [
    { key: "season", label: say("col.season"), num: true, cls: "seasoncell", get: (c) => c.year, cell: (c) => <Link href={seasonPath(lg, c.year)} prefetch={false}>{c.label}</Link> },
    { key: "champion", label: say("col.champion"), cls: "team", get: (c) => c.champion, cell: (c) => <><TeamLogo url={logoFor(brands, c.champion_franchise, c.year)} /><TeamLink lg={lg} f={c.champion_franchise} name={c.champion} /></> },
    { key: "final", label: say("col.final"), cls: "note", get: (c) => c.champion_note, cell: (c) => <ChampionNote lg={lg} year={c.year} champ={c.champion_franchise} note={c.champion_note} /> },
    { key: "source", label: say("col.source"), get: (c) => srcName(say, c.champion_source), cell: (c) => <Badge src={c.champion_source} /> },
  ], (c) => c.year);
  return (
    <>
      <AccentStyle league={lg} />
      <section className="head fade">
        <span className="eyebrow">{info.short}</span>
        <h1>{info.name}</h1>
        <p className="lede">{say("league.lede", { seasons: plural("count.seasons", list.filter((x) => !leagueSat(x)).length), withGames: withGames.length, champions: plural("count.champions", champs.length) })}</p>
        <p className="note"><Link href={`/${lg}/scores`}>{say("scores.link")}</Link></p>
        <p className="note"><Link href={`/${lg}/all-time`}>{say("allTime.link")}</Link></p>
        <p className="note"><Link href={`/${lg}/alignment`}>{say("league.alignmentLink")}</Link></p>
      </section>
      <section className="section">
        <h2>{say("league.seasons")}</h2>
        <div className="seasonlist">
          {list.map((x) => leagueSat(x) ? <NoSeason key={x.year} compact>{x.label}</NoSeason> : (
            <Link key={x.year} prefetch={false} href={seasonPath(lg, x.year)} className={x.share >= 0.98 ? "full" : undefined}
              title={x.games ? say("league.seasonTip", { finals: fmt(x.finals), games: fmt(x.games) }) : say("league.awardsOnly")}>
              {x.label}
            </Link>
          ))}
        </div>
      </section>
      {withGames.length ? (
        <section className="section">
          <h2>{say("league.barsTitle")}</h2>
          <div className="legend">
            <span><i style={{ background: "var(--accent)" }} />{say("league.withResult")}</span>
            <span><i style={{ background: "var(--accent)", opacity: 0.22 }} />{say("league.heldNoResult")}</span>
          </div>
          <SeasonBars lg={lg} list={list.filter((x) => x.games > 0 || leagueSat(x)).map((x) => ({ year: x.year, label: x.label, games: x.games, finals: x.finals, champion: x.champion, none: leagueSat(x) }))} />
        </section>
      ) : null}
      <section className="section">
        <h2>{say("league.champions")}</h2>
        {champs.length ? (
          <>
            <ChampionRow lg={lg} boxes={championRow(list, lg)} brands={brands} paths={paths} withGames={new Set(withGames.map((x) => x.year))} />
            <div className="tablebox"><SortTable {...champions} def="season.desc" /></div>
          </>
        ) :<p className="note">{say("league.noChampions")}</p>}
      </section>
      <LeagueAwards lg={lg} />
    </>
  );
});

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeagueSeasons } from "@/components/LeagueSeasons";
import { SeasonBars } from "@/components/SeasonBars";
import { SeasonSync } from "@/components/SeasonSync";
import { LeagueAwards } from "@/components/LeagueAwards";
import { SortTable } from "@/components/SortTable";
import { AccentStyle } from "@/components/AccentStyle";
import { TeamLabel } from "@/components/TeamLabel";
import { ChampionNote } from "@/components/ChampionNote";
import { ChampionRow } from "@/components/ChampionRow";
import { TrophyBanner } from "@/components/TrophyBanner";
import { Badge } from "@/components/ui";
import { leagueSat } from "@/lib/noSeason";
import { withCoverage } from "@/lib/coverage";
import { logoFor } from "@/lib/brand";
import { championRow } from "@/lib/champions";
import { getCupTitles } from "@/lib/cupData";
import { getBrands, getSummary } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LEAGUE_CODES, leagueInfo, srcName } from "@/lib/leagues";
import { otherLeagues } from "@/lib/otherLeagues";
import { pageMeta } from "@/lib/meta";
import { tableOf } from "@/lib/sort";
import { seasonPath } from "@/lib/slug";
import { franchiseOfName, getPaths } from "@/lib/teamSlugs";
import { guard, guardMeta } from "@/lib/loadGuard";

export const revalidate = 86400;
export const dynamicParams = false;
export const generateStaticParams = () => LEAGUE_CODES.map((league) => ({ league }));

export const generateMetadata = guardMeta(async ({ params }: PageProps<"/[locale]/s/[league]">): Promise<Metadata> => {
  const { league } = await params;
  const info = leagueInfo(league);
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

export default guard(async function LeaguePage({ params }: PageProps<"/[locale]/s/[league]">) {
  const { league: lg } = await params;
  if (!isLeague(lg)) notFound();
  const info = leagueInfo(lg)!;
  const { say, plural, fmt } = await currentSpeaker();
  const [s, brands, paths] = await Promise.all([getSummary(), getBrands(), getPaths()]);
  const list = withCoverage(s.seasons).filter((x) => x.league === lg).sort((a, b) => a.year - b.year);
  const withGames = list.filter((x) => x.games > 0);
  const champs = await Promise.all(list.filter((x) => x.champion).reverse().map(async (x) =>
    x.champion_franchise != null ? x : { ...x, champion_franchise: await franchiseOfName(lg, x.champion) }));
  const champions = tableOf(champs, [
    { key: "season", label: say("col.season"), num: true, cls: "seasoncell", get: (c) => c.year, cell: (c) => <Link href={seasonPath(lg, c.year)} prefetch={false}>{c.label}</Link> },
    { key: "champion", label: say("col.champion"), cls: "team", get: (c) => c.champion, cell: (c) => <TeamLabel lg={lg} f={c.champion_franchise} name={c.champion} logo={logoFor(brands, c.champion_franchise, c.year)} /> },
    { key: "final", label: say("col.final"), cls: "note", get: (c) => c.champion_note, cell: (c) => <ChampionNote lg={lg} year={c.year} champ={c.champion_franchise} note={c.champion_note} /> },
    { key: "source", label: say("col.source"), get: (c) => srcName(say, c.champion_source), cell: (c) => <Badge src={c.champion_source} /> },
  ], (c) => c.year);
  // The NHL's Stanley Cup was won before the NHL existed (1893-1917) by clubs of other leagues: listed under the champions, not as NHL seasons (docs/stanley-cup-pre-nhl.md).
  const cup = lg === "nhl" ? await getCupTitles() : [];
  const cupRows = tableOf([...cup].reverse(), [
    { key: "year", label: say("col.season"), num: true, cls: "seasoncell", get: (c) => c.year },
    { key: "champion", label: say("col.champion"), cls: "team", get: (c) => c.team, cell: (c) => <TeamLabel lg={lg} f={c.franchise} name={c.team} logo={logoFor(brands, c.franchise, c.year)} /> },
    { key: "league", label: say("col.league"), get: (c) => c.league ?? "" },
    { key: "wins", label: say("cup.wins"), num: true, get: (c) => c.wins },
  ], (c) => `${c.year}-${c.club}`);
  // The league's rival and predecessor leagues (the NFL's AFL and AAFC): their years, seasons and champions, each kept apart from this league's own.
  const others = otherLeagues(lg, s.seasons);
  const boxes = championRow(list, lg);
  const latest = boxes.find((b) => b.kind === "recent");
  const most = boxes.find((b) => b.kind === "most");
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
        {info.closed ? null : <p className="note"><Link href={`/${lg}/world`}>{say("country.leagueNavLink")}</Link></p>}
      </section>
      {latest ? (
        <TrophyBanner lg={lg}>
          <span className="cup">{say("trophy.latest")}</span>
          <span className="who"><TeamLabel lg={lg} f={latest.f} name={latest.name} year={withGames.some((x) => x.year === latest.year) ? latest.year : undefined} logo={logoFor(brands, latest.f, latest.year)} size={40} shape="circle" /></span>
          <span className="how">
            <Link href={seasonPath(lg, latest.year)} prefetch={false}>{say("season.title", { label: latest.label })}</Link>
            {most ? ` · ${say("trophy.mostTitles", { team: most.name, count: plural("count.championships", most.n) })}` : ""}
          </span>
        </TrophyBanner>
      ) : null}
      <SeasonSync>
        <section className="section">
          <h2>{say("league.seasons")}</h2>
          <LeagueSeasons league={lg}
            seasons={list.map((x) => ({ league: x.league, year: x.year, label: x.label, games: x.games, finals: x.finals, share: x.share, champion: x.champion }))}
            chips={list.map((x) => ({
              year: x.year, label: x.label, href: seasonPath(lg, x.year), full: x.share >= 0.98, none: leagueSat(x),
              title: x.games ? say("league.seasonTip", { finals: fmt(x.finals), games: fmt(x.games) }) : x.teams ? say("season.noSchedule") : say("league.awardsOnly"),
            }))} />
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
      </SeasonSync>
      {others.length ? (
        <section className="section">
          <h2>{say("league.otherLeagues")}</h2>
          <p className="note">{say("league.otherNote", { league: info.short })}</p>
          <ul className="otherleagues">
            {others.map((o) => (
              <li key={o.code}>
                <Link href={`/${o.code}`}>{o.name} ({o.short})</Link>
                {" · "}{o.first === o.last ? o.first : `${o.first}–${o.last}`}
                {" · "}{plural("count.seasons", o.seasons)}
                {" · "}{plural("count.champions", o.champions)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="section">
        <h2>{say("league.champions")}</h2>
        {champs.length ? (
          <>
            <ChampionRow lg={lg} boxes={boxes} brands={brands} paths={paths} withGames={new Set(withGames.map((x) => x.year))} />
            <div className="tablebox"><SortTable {...champions} def="season.desc" /></div>
          </>
        ) :<p className="note">{say("league.noChampions")}</p>}
      </section>
      {cup.length ? (
        <section className="section">
          <h2>{say("cup.name")} ({say("cup.before")})</h2>
          <p className="note">{say("cup.note", { first: String(cup[0].year), last: String(cup[cup.length - 1].year) })}</p>
          <div className="tablebox"><SortTable {...cupRows} def="year.desc" /></div>
        </section>
      ) : null}
      <LeagueAwards lg={lg} />
    </>
  );
});

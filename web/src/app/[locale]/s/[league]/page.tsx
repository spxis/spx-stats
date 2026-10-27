import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { LeagueSeasons } from "@/components/LeagueSeasons";
import { LeagueSeasonRows } from "@/components/LeagueSeasonRows";
import { SeasonBarsLazy } from "@/components/SeasonBarsLazy";
import { SeasonSync } from "@/components/SeasonSync";
import { LeagueAwards } from "@/components/LeagueAwards";
import { LeagueChampions } from "@/components/LeagueChampions";
import { SortTable } from "@/components/SortTable";
import { AccentStyle } from "@/components/AccentStyle";
import { TeamLabel } from "@/components/TeamLabel";
import { TrophyBanner } from "@/components/TrophyBanner";
import { leagueSat } from "@/lib/noSeason";
import { withCoverage } from "@/lib/coverage";
import { trophiesPath, CHAMPIONSHIP_CODE, trophyPath } from "@/lib/awardTrophy";
import { logoFor } from "@/lib/brand";
import { championRow } from "@/lib/champions";
import { getAllStar } from "@/lib/allStar";
import { orElse } from "@/lib/api/soften";
import { allStarPath } from "@/lib/allStarView";
import { getCupTitles } from "@/lib/cupData";
import { getBrands, getSummary } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LEAGUE_CODES, leagueInfo } from "@/lib/leagues";
import { leagueSeasonRows } from "@/lib/leagueSeasonRows";
import { FamilyNav } from "@/components/FamilyNav";
import { familyOf } from "@/lib/leagueFamilies";
import { familyOtherLeagues } from "@/lib/otherLeagues";
import { pageMeta } from "@/lib/meta";
import { tableOf } from "@/lib/sort";
import { seasonPath } from "@/lib/slug";
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
  const { say, plural } = await currentSpeaker();
  const [s, brands, allStarGames] = await Promise.all([getSummary(), getBrands(), orElse(getAllStar(lg).then((d) => d.events.length), 0)]);
  const list = withCoverage(s.seasons).filter((x) => x.league === lg).sort((a, b) => a.year - b.year);
  const withGames = list.filter((x) => x.games > 0);
  const champs = list.filter((x) => x.champion);
  // The NHL's Stanley Cup was won before the NHL existed (1893-1917) by clubs of other leagues: listed under the champions, not as NHL seasons (docs/stanley-cup-pre-nhl.md).
  const cup = lg === "nhl" ? await getCupTitles() : [];
  const cupRows = tableOf([...cup].reverse(), [
    { key: "year", label: say("col.season"), num: true, cls: "seasoncell", get: (c) => c.year },
    { key: "champion", label: say("col.champion"), cls: "team", get: (c) => c.team, cell: (c) => <TeamLabel lg={lg} f={c.franchise} name={c.team} logo={logoFor(brands, c.franchise, c.year)} /> },
    { key: "league", label: say("col.league"), get: (c) => c.league ?? "" },
    { key: "wins", label: say("cup.wins"), num: true, get: (c) => c.wins },
  ], (c) => `${c.year}-${c.club}`);
  // Family siblings (PWHL on the NHL page) plus rival and predecessor leagues, each kept apart from this league's own.
  const others = familyOtherLeagues(lg, s.seasons);
  const fam = familyOf(lg);
  const familySeasons = fam
    ? withCoverage(s.seasons).filter((x) => fam.members.includes(x.league)).sort((a, b) => a.year - b.year)
    : list;
  const boxes = championRow(list, lg);
  const latest = boxes.find((b) => b.kind === "recent");
  const most = boxes.find((b) => b.kind === "most");
  return (
    <>
      <AccentStyle league={lg} />
      <section className="head fade">
        <span className="eyebrow">{info.short}</span>
        <h1>{info.name}</h1>
        <FamilyNav code={lg} />
        <p className="lede">{say("league.lede", { seasons: plural("count.seasons", list.filter((x) => !leagueSat(x)).length), withGames: withGames.length, champions: plural("count.champions", champs.length) })}</p>
        {lg === "na" ? <p className="note">{say("league.naNote")}</p> : null}
        <nav className="quicklinks">
          <Link href={`/${lg}/scores`}>{say("nav.scores")}</Link>
          <Link href={`/${lg}/all-time`}>{say("allTime.title")}</Link>
          <Link href={`/${lg}/alignment`}>{say("align.title")}</Link>
          {allStarGames ? <Link href={allStarPath(lg)}>{say("allstar.leagueLink")}</Link> : null}
          <Link href={trophiesPath(lg)}>{say("trophies.title")}</Link>
          {info.closed ? null : <Link href={`/${lg}/world`}>{say("country.mapList")}</Link>}
        </nav>
      </section>
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
      {latest ? (
        <TrophyBanner lg={lg}>
          <span className="cup">{CHAMPIONSHIP_CODE[lg] ? <Link href={trophyPath(CHAMPIONSHIP_CODE[lg])} prefetch={false}>{say("trophy.latest")}</Link> : say("trophy.latest")}</span>
          <span className="who"><TeamLabel lg={lg} f={latest.f} name={latest.name} year={withGames.some((x) => x.year === latest.year) ? latest.year : undefined} logo={logoFor(brands, latest.f, latest.year)} size={40} shape="circle" /></span>
          <span className="how">
            <Link href={seasonPath(lg, latest.year)} prefetch={false}>{say("season.title", { label: latest.label })}</Link>
            {most ? ` · ${say("trophy.mostTitles", { team: most.name, count: plural("count.championships", most.n) })}` : ""}
          </span>
        </TrophyBanner>
      ) : null}
      <SeasonSync>
        <LeagueSeasonRows league={lg} rows={leagueSeasonRows(list)}>
          <section className="section">
            <h2>{say("league.seasons")}</h2>
            <LeagueSeasons family={fam} familySeasons={familySeasons.map((x) => ({
              league: x.league, year: x.year, label: x.label, games: x.games, finals: x.finals, share: x.share, champion: x.champion,
            }))} />
          </section>
          {withGames.length ? (
            <section className="section">
              <h2>{say("league.barsTitle")}</h2>
              <div className="legend">
                <span><i style={{ background: "var(--accent)" }} />{say("league.withResult")}</span>
                <span><i style={{ background: "var(--accent)", opacity: 0.22 }} />{say("league.heldNoResult")}</span>
              </div>
              <SeasonBarsLazy lg={lg} />
            </section>
          ) : null}
        </LeagueSeasonRows>
      </SeasonSync>
      <section className="section">
        <h2>{say("league.champions")}</h2>
        <LeagueChampions lg={lg} />
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

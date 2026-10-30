import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { CountryAreaLazy } from "@/components/CountryAreaLazy";
import { Credits } from "@/components/Credits";
import { LeagueWorld, type LeagueWorldData } from "@/components/LeagueWorld";
import { WorldStackTable, WorldTeamsTable } from "@/components/WorldTables";
import { getLeagueCounts, getLeagueFranchises, getSeasonCounts } from "@/lib/countryData";
import { coolCards, isKnown } from "@/lib/countryModel";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LG, hasPlayers } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { pctText } from "@/lib/people-format";
import { getPlayerPaths } from "@/lib/playerLinks";
import { worldTables } from "@/lib/worldData";
import { CountryCards } from "@/components/CountryCards";
import "@/components/country.css";

// A kept page: the range of seasons is chosen in the browser, so the address never carries a query this page reads.
export const revalidate = 2592000;
export const generateStaticParams = () => [];

export const generateMetadata = guardMeta(async ({ params }: PageProps<"/[locale]/s/[league]/world">): Promise<Metadata> => {
  const { league } = await params;
  if (!isLeague(league)) return {};
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("country.worldTitle", { league: LG[league] }), description: say("country.worldMetaDesc", { league: LG[league] }), path: `/${league}/world`, locale });
});

export default guard(async function LeagueWorldPage({ params }: PageProps<"/[locale]/s/[league]/world">) {
  const { league: lg } = await params;
  if (!isLeague(lg)) notFound();
  if (!hasPlayers(lg)) notFound();
  const { say, plural, fmt, locale } = await currentSpeaker();
  const [seasonRows, leagueRows, franchiseRows] = await Promise.all([getSeasonCounts(lg), getLeagueCounts(lg), getLeagueFranchises(lg)]);
  const head = (
    <>
      <AccentStyle league={lg} />
      <section className="head fade">
        <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link></span>
        <h1>{say("country.worldTitle", { league: LG[lg] })}</h1>
        <p className="lede">{say("country.worldLede", { league: LG[lg] })}</p>
        <p className="note"><Link href="/countries">{say("country.allLink")}</Link></p>
      </section>
    </>
  );
  if (!seasonRows?.length || !leagueRows?.length) {
    return <>{head}<p className="note">{say("country.notLoaded")}</p></>;
  }

  const known = leagueRows[0].league_known, all = leagueRows[0].league_players;
  const countries = [...new Set(seasonRows.map((r) => r.country))];
  const at = new Map(countries.map((c, i) => [c, i]));
  const years = seasonRows.map((r) => r.year);
  const paths = await getPlayerPaths();
  const data: LeagueWorldData = {
    league: lg,
    countries,
    rows: seasonRows.flatMap((r) => [r.year, at.get(r.country)!, r.players]),
    seasons: [...new Map(seasonRows.map((r) => [r.year, [r.year, r.season_players, r.season_known] as [number, number, number]])).values()],
    allTime: leagueRows.filter((r) => isKnown(r.country)).map((r) => ({
      code: r.country, players: r.players, first: r.first_year, firstName: r.first_name,
      firstHref: r.first_person_id != null && r.first_name ? paths(r.first_person_id, r.first_name, lg) : null,
    })),
  };
  const { stack, flags, teams } = await worldTables(lg, seasonRows, leagueRows, franchiseRows);
  const cards = coolCards(seasonRows, leagueRows);
  const tablesPath = `/${lg}/world/tables`;

  return (
    <>
      {head}
      {known < all * 0.5 ? <p className="note cnote-cov">{say("country.coverageLow", { known: plural("count.players", known), total: fmt(all), pct: pctText(known / Math.max(all, 1), locale, 0) })}</p> : <p className="note">{say("country.coverage", { known: fmt(known), total: fmt(all) })}</p>}
      <LeagueWorld data={data} flags={flags} min={Math.min(...years)} max={Math.max(...years)} />
      {cards.length ? <CountryCards cards={cards} title={say("country.cardsTitle")} /> : null}
      <section className="section">
        <h2>{say("country.areaTitle")}</h2>
        <p className="note">{say("country.areaLeagueNote", { league: LG[lg] })}</p>
        <CountryAreaLazy stack={stack} league={lg} label={say("country.areaAria", { name: LG[lg] })} tableLabel={say("country.showTable")} />
        <details className="ctable">
          <summary>{say("country.showTable")}</summary>
          <WorldStackTable stack={stack} league={lg} label={say("country.areaAria", { name: LG[lg] })} hrefAll={`${tablesPath}#seasons`} />
        </details>
      </section>
      {teams.lines.length ? (
        <section className="section">
          <h2>{say("country.byTeam")}</h2>
          <p className="note">{say("country.byTeamNote")}</p>
          <WorldTeamsTable lg={lg} wire={teams} flags={flags} hrefAll={`${tablesPath}#teams`} label={say("country.byTeam")} />
        </section>
      ) : null}
      <p className="note">{say("country.noteSource")} <Credits say={say} use={["maps", "flags"]} /></p>
    </>
  );
});

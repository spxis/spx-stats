import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { CountryArea } from "@/components/CountryArea";
import { Credits } from "@/components/Credits";
import { FlagIcon } from "@/components/FlagIcon";
import { LeagueWorld, type LeagueWorldData } from "@/components/LeagueWorld";
import { SortTable } from "@/components/SortTable";
import { TeamLabel } from "@/components/TeamLabel";
import { logoFor } from "@/lib/brand";
import { getBrands } from "@/lib/data";
import { getLeagueCounts, getLeagueFranchises, getSeasonCounts } from "@/lib/countryData";
import { flagCodes } from "@/lib/flagCodes";
import { coolCards, isKnown, stackSeries, tally } from "@/lib/countryModel";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LG } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { countryName, pctText } from "@/lib/people-format";
import { getPlayerPaths } from "@/lib/playerLinks";
import { tableOf } from "@/lib/sort";
import { getLeagueClubs } from "@/lib/teamSlugs";
import { CountryCards } from "@/components/CountryCards";
import "@/components/country.css";

// A kept page: the range of seasons is chosen in the browser, so the address never carries a query this page reads.
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
  const { say, plural, fmt, locale } = await currentSpeaker();
  const [seasonRows, leagueRows, franchiseRows, brands] = await Promise.all([getSeasonCounts(lg), getLeagueCounts(lg), getLeagueFranchises(lg), getBrands()]);
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
  const best = tally(leagueRows.map((r) => [r.country, r.players] as [string, number])).list.slice(0, 6).map((c) => c.code);
  const stack = stackSeries(seasonRows, best);
  const flags = flagCodes(tally(leagueRows.map((r) => [r.country, r.players] as [string, number])).list.map((c) => c.code));
  const cards = coolCards(seasonRows, leagueRows);

  // by team: everyone who was on the club, by country
  const clubs = new Map((await getLeagueClubs(lg)).map((c) => [c.f, c.name]));
  const perClub = new Map<number, [string, number][]>();
  for (const r of franchiseRows ?? []) (perClub.get(r.franchise_id) ?? perClub.set(r.franchise_id, []).get(r.franchise_id)!).push([r.country, r.players]);
  const teams = [...perClub].flatMap(([f, list]) => {
    const t = tally(list);
    return t.known ? [{ f, name: clubs.get(f) ?? `#${f}`, t }] : [];
  });
  const teamTable = tableOf(teams, [
    { key: "team", label: say("col.team"), cls: "team", get: (x) => x.name, cell: (x) => <TeamLabel lg={lg} f={x.f} name={x.name} logo={logoFor(brands, x.f)} /> },
    { key: "players", label: say("country.colPlayers"), num: true, get: (x) => x.t.total, cell: (x) => fmt(x.t.total) },
    { key: "countries", label: say("country.colCountries"), num: true, get: (x) => x.t.list.length, cell: (x) => fmt(x.t.list.length) },
    {
      key: "top", label: say("country.colTop"), get: (x) => countryName(x.t.list[0].code, locale),
      cell: (x) => <span className="cflagname">{flags[x.t.list[0].code] ? <FlagIcon code={x.t.list[0].code} /> : null}{countryName(x.t.list[0].code, locale)}</span>,
    },
    { key: "topshare", label: say("country.colTopShare"), num: true, get: (x) => x.t.list[0].n / x.t.known, cell: (x) => pctText(x.t.list[0].n / x.t.known, locale, 0) },
    {
      key: "second", label: say("country.colSecond"), get: (x) => (x.t.list[1] ? countryName(x.t.list[1].code, locale) : null),
      cell: (x) => (x.t.list[1] ? <span className="cflagname">{countryName(x.t.list[1].code, locale)} <span className="note">{fmt(x.t.list[1].n)}</span></span> : ""),
    },
  ], (x) => x.f);

  return (
    <>
      {head}
      {known < all * 0.5 ? <p className="note cnote-cov">{say("country.coverageLow", { known: plural("count.players", known), total: fmt(all), pct: pctText(known / Math.max(all, 1), locale, 0) })}</p> : <p className="note">{say("country.coverage", { known: fmt(known), total: fmt(all) })}</p>}
      <LeagueWorld data={data} flags={flags} min={Math.min(...years)} max={Math.max(...years)} />
      {cards.length ? <CountryCards cards={cards} title={say("country.cardsTitle")} /> : null}
      <section className="section">
        <h2>{say("country.areaTitle")}</h2>
        <p className="note">{say("country.areaLeagueNote", { league: LG[lg] })}</p>
        <CountryArea stack={stack} league={lg} label={say("country.areaAria", { name: LG[lg] })} tableLabel={say("country.showTable")} />
      </section>
      {teams.length ? (
        <section className="section">
          <h2>{say("country.byTeam")}</h2>
          <p className="note">{say("country.byTeamNote")}</p>
          <div className="tablebox"><SortTable {...teamTable} param="sort_teams" def="players.desc" label={say("country.byTeam")} /></div>
        </section>
      ) : null}
      <p className="note">{say("country.noteSource")} <Credits say={say} use={["maps", "flags"]} /></p>
    </>
  );
});

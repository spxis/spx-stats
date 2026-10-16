import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound, permanentRedirect } from "next/navigation";
import { Credits } from "@/components/Credits";
import { Flag } from "@/components/Flag";
import { ShareLines } from "@/components/ShareLines";
import { SortTable } from "@/components/SortTable";
import { Figures } from "@/components/ui";
import { getLeagueCounts, getSeasonCounts } from "@/lib/countryData";
import { share, shareSeries } from "@/lib/countryModel";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LEAGUE_CODES, LG, seasonLabel } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { countryName, joinList, pctText } from "@/lib/people-format";
import { getPlayerPaths } from "@/lib/playerLinks";
import { playerOrder, readPlayers } from "@/lib/playerIndex";
import { tableOf } from "@/lib/sort";
import "@/components/country.css";

// Nothing is drawn at build time: each country is drawn on its first visit, then kept and revalidated like the rest.
export const revalidate = 2592000;
export const generateStaticParams = () => [];

const CODE = /^[A-Za-z]{2}$/;
const TOP = 10;

export const generateMetadata = guardMeta(async ({ params }: PageProps<"/[locale]/s/country/[code]">): Promise<Metadata> => {
  const { code } = await params;
  if (!CODE.test(code)) return {};
  const { say, locale } = await currentSpeaker();
  const name = countryName(code, locale);
  return pageMeta({ title: say("country.countryTitle", { name }), description: say("country.countryMetaDesc", { name }), path: `/country/${code.toUpperCase()}`, locale });
});

export default guard(async function CountryPage({ params }: PageProps<"/[locale]/s/country/[code]">) {
  const { code: raw } = await params;
  if (!CODE.test(raw)) notFound();
  const code = raw.toUpperCase();
  if (raw !== code) permanentRedirect(`/country/${code}`);
  const { say, plural, fmt, locale } = await currentSpeaker();
  const [leagueRows, seasonRows] = await Promise.all([getLeagueCounts(undefined, code), getSeasonCounts(undefined, code)]);
  const name = countryName(code, locale);
  if (!leagueRows?.length) {
    return (
      <>
        <section className="head fade"><h1 className="cityname">{name}<Flag code={code} /></h1><p className="lede">{leagueRows ? say("country.countryNone", { name }) : say("country.notLoaded")}</p></section>
        <p className="note"><Link href="/countries">{say("country.allLink")}</Link></p>
      </>
    );
  }
  const leagues = LEAGUE_CODES.filter((l) => leagueRows.some((r) => r.league === l));
  const paths = await getPlayerPaths();
  const total = leagueRows.reduce((a, r) => a + r.players, 0);
  const first = Math.min(...leagueRows.map((r) => r.first_year));

  const byLeague = tableOf(leagues.map((l) => leagueRows.find((r) => r.league === l)!), [
    { key: "league", label: say("col.league"), get: (r) => LG[r.league as keyof typeof LG], cell: (r) => <Link href={`/${r.league}/world`} prefetch={false}>{LG[r.league as keyof typeof LG]}</Link> },
    { key: "players", label: say("country.colPlayers"), num: true, get: (r) => r.players, cell: (r) => fmt(r.players) },
    { key: "share", label: say("country.colShare"), title: say("country.shareTitle"), num: true, get: (r) => share(r.players, r.league_known), cell: (r) => pctText(share(r.players, r.league_known), locale) },
    { key: "first", label: say("country.colFirst"), cls: "seasoncell", num: true, get: (r) => r.first_year, cell: (r) => seasonLabel(r.league, r.first_year) },
    {
      key: "player", label: say("country.colFirstPlayer"), cls: "team", get: (r) => r.first_name,
      cell: (r) => (r.first_name && r.first_person_id != null ? <Link href={paths(r.first_person_id, r.first_name, r.league)} prefetch={false}>{r.first_name}</Link> : r.first_name ?? ""),
    },
    { key: "last", label: say("country.colLast"), cls: "seasoncell", num: true, get: (r) => r.last_year, cell: (r) => seasonLabel(r.league, r.last_year) },
  ], (r) => r.league);

  const series = leagues.map((l) => ({ league: l, points: shareSeries(seasonRows ?? [], l, code, "decade") })).filter((s) => s.points.length);
  const order = playerOrder([{ key: "awards", dir: "desc" }, { key: "seasons", dir: "desc" }]);
  const tops = await Promise.all(leagues.map(async (l) => ({ l, list: (await readPlayers({ league: l, words: [], nat: code }, order, { offset: 0, limit: TOP }).catch(() => null))?.rows ?? [] })));

  return (
    <>
      <section className="head fade">
        <span className="eyebrow"><Link href="/countries">{say("country.pageTitle")}</Link></span>
        <h1 className="cityname">{name}<Flag code={code} /></h1>
        <p className="lede">{say("country.countryLede", { name, players: plural("count.players", total), leagues: joinList(leagues.map((l) => LG[l]), locale), from: String(first) })}</p>
        <p className="note"><Link href={`/players?nat=${code}`}>{say("country.allPlayers", { name })}</Link></p>
      </section>
      <Figures items={[[say("country.figPlayersAll"), total], [say("col.league"), leagues.length], [say("country.colFirst"), String(first)]]} />
      <section className="section">
        <h2>{say("country.byLeague")}</h2>
        <div className="tablebox"><SortTable {...byLeague} param="sort_leagues" def="players.desc" label={say("country.byLeague")} /></div>
        <p className="note">{say("country.firstNote")}</p>
      </section>
      {series.length ? (
        <section className="section">
          <h2>{say("country.trendCountryTitle", { name })}</h2>
          <p className="note">{say("country.trendNote")}</p>
          <ShareLines series={series} label={say("country.trendAria", { name })} tableLabel={say("country.showTable")} />
        </section>
      ) : null}
      {tops.filter((t) => t.list.length).map(({ l, list }) => (
        <section className="section" key={l}>
          <h2>{say("country.topPlayers", { league: LG[l] })}</h2>
          <ol className="cmap-list">
            {list.map((p) => (
              <li key={p.person_id}>
                <Link href={paths(p.person_id, p.name, l)} prefetch={false}>{p.name}</Link>
                <span className="n">{p.first_season != null ? `${p.first_season}–${p.last_season}` : ""}{p.award_count ? ` · ${plural("count.awards", p.award_count)}` : ""}</span>
              </li>
            ))}
          </ol>
          <p className="note"><Link href={`/players?league=${l}&nat=${code}`}>{say("country.morePlayers", { league: LG[l], name })}</Link></p>
        </section>
      ))}
      <p className="note">{say("country.noteSource")} <Credits say={say} use={["flags"]} /></p>
    </>
  );
});

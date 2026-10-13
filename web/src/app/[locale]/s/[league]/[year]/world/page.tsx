import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { CountryDonut, type Slice } from "@/components/CountryDonut";
import { CountryMap } from "@/components/CountryMap";
import { Credits } from "@/components/Credits";
import { FlagIcon } from "@/components/FlagIcon";
import { SortTable } from "@/components/SortTable";
import { Figures, TeamLink } from "@/components/ui";
import { flagsFor, getLeagueSeasonClubs, getSeasonCounts } from "@/lib/countryData";
import { tally, UNKNOWN, withOther } from "@/lib/countryModel";
import { getSeasonStandings } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { countryName, pctText } from "@/lib/people-format";
import { parseSeasonSeg, seasonPath } from "@/lib/slug";
import { tableOf } from "@/lib/sort";
import "@/components/country.css";

// A kept page, drawn on its first visit and revalidated like the rest.
export const generateStaticParams = () => [];

const MATRIX = 6;

export const generateMetadata = guardMeta(async ({ params }: PageProps<"/[locale]/s/[league]/[year]/world">): Promise<Metadata> => {
  const { league, year } = await params;
  const ys = isLeague(league) ? parseSeasonSeg(league, year) : null;
  if (!isLeague(league) || !ys) return {};
  const { say, locale } = await currentSpeaker();
  const season = seasonLabel(league, ys.y);
  return pageMeta({ title: say("country.seasonTitle", { league: LG[league], season }), description: say("country.seasonMetaDesc", { league: LG[league], season }), path: `${seasonPath(league, ys.y)}/world`, locale });
});

export default guard(async function SeasonWorldPage({ params }: PageProps<"/[locale]/s/[league]/[year]/world">) {
  const { league: lg, year } = await params;
  const ys = isLeague(lg) ? parseSeasonSeg(lg, year) : null;
  if (!isLeague(lg) || !ys) notFound();
  if (!ys.canonical) permanentRedirect(`${seasonPath(lg, ys.y)}/world`);
  const y = ys.y;
  const { say, plural, fmt, locale } = await currentSpeaker();
  const season = seasonLabel(lg, y);
  const [clubs, seasonRows] = await Promise.all([getLeagueSeasonClubs(lg, y), getSeasonCounts(lg, undefined, y)]);
  const head = (
    <>
      <AccentStyle league={lg} />
      <section className="head fade">
        <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link></span>
        <h1>{say("country.seasonTitle", { league: LG[lg], season })}</h1>
        <p className="lede">{say("country.seasonLede", { league: LG[lg], season })}</p>
        <p className="note"><Link href={seasonPath(lg, y)}>{say("country.seasonPage", { season })}</Link> · <Link href={`/${lg}/world`}>{say("country.leagueLink", { league: LG[lg] })}</Link> · <Link href="/countries">{say("country.allLink")}</Link></p>
      </section>
    </>
  );
  if (!clubs?.length || !seasonRows?.length) return <>{head}<p className="note">{say("country.notLoaded")}</p></>;

  const t = tally(seasonRows.map((r) => [r.country, r.players] as [string, number]));
  const { top, other } = withOther(t.list, 6);
  const slices: Slice[] = [
    ...top.map((c, i) => ({ code: c.code, n: c.n, slot: i })),
    ...(other ? [{ code: "other", n: other, kind: "other" as const }] : []),
    ...(t.unknown ? [{ code: UNKNOWN, n: t.unknown, kind: "unknown" as const }] : []),
  ];
  const flags = await flagsFor(t.list.map((c) => c.code));
  const counts = Object.fromEntries(t.list.map((c) => [c.code, c.n]));
  const names = new Map((await getSeasonStandings(lg, y).catch(() => [])).map((r) => [r.franchise_id, r.team]));

  const per = new Map<number, [string, number][]>();
  for (const r of clubs) (per.get(r.franchise_id) ?? per.set(r.franchise_id, []).get(r.franchise_id)!).push([r.country, r.players]);
  const rows = [...per].map(([f, list]) => ({ f, name: names.get(f) ?? `#${f}`, t: tally(list), by: new Map(list) }));
  const matrix = t.list.slice(0, MATRIX).map((c) => c.code);
  const table = tableOf(rows, [
    { key: "team", label: say("col.team"), cls: "team", get: (x) => x.name, cell: (x) => <TeamLink lg={lg} f={x.f} name={x.name} year={y} /> },
    { key: "players", label: say("country.colPlayers"), num: true, get: (x) => x.t.total, cell: (x) => fmt(x.t.total) },
    { key: "countries", label: say("country.colCountries"), num: true, get: (x) => x.t.list.length, cell: (x) => fmt(x.t.list.length) },
    ...matrix.map((code) => ({
      key: `c_${code.toLowerCase()}`, label: countryName(code, locale), num: true, title: countryName(code, locale),
      get: (x: (typeof rows)[number]) => x.by.get(code) ?? 0, cell: (x: (typeof rows)[number]) => fmt(x.by.get(code) ?? 0),
    })),
    {
      key: "top", label: say("country.colTop"), get: (x) => (x.t.list[0] ? countryName(x.t.list[0].code, locale) : null),
      cell: (x) => (x.t.list[0] ? <span className="cflagname">{flags[x.t.list[0].code] ? <FlagIcon svg={flags[x.t.list[0].code]} /> : null}{countryName(x.t.list[0].code, locale)}</span> : ""),
    },
  ], (x) => x.f);

  return (
    <>
      {head}
      <Figures items={[
        [say("country.figPlayers"), t.total],
        [say("country.figCountries"), t.list.length],
        [say("country.figKnown"), t.total ? pctText(t.known / t.total, locale, 0) : "—"],
      ]} />
      <section className="section">
        <div className="chartrow">
          <CountryDonut title={say("country.leagueDonut", { league: LG[lg], season })} slices={slices} flags={flags} centre={fmt(t.total)} centreSub={say("country.players")} hrefTpl={`/players?league=${lg}&nat={code}&from=${y}&to=${y}`} />
          <div>
            <h3>{say("country.mapHead")}</h3>
            <CountryMap counts={counts} flags={flags} hrefTpl={`/players?league=${lg}&nat={code}&from=${y}&to=${y}`} label={say("country.leagueMapLabel", { league: `${LG[lg]} ${season}` })} unit="players" />
          </div>
        </div>
      </section>
      <section className="section">
        <h2>{say("country.byTeamSeason", { season })}</h2>
        <p className="note">{say("country.byTeamSeasonNote", { n: plural("count.players", t.total) })}</p>
        <div className="tablebox"><SortTable {...table} param="sort_clubs" def="players.desc" label={say("country.byTeamSeason", { season })} /></div>
      </section>
      <p className="note">{say("country.noteSource")} <Credits say={say} use={["maps", "flags"]} /></p>
    </>
  );
});

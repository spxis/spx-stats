import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CityTimeline, type TimelineClub } from "@/components/CityTimeline";
import { CityTitles } from "@/components/CityTitles";
import { Flag } from "@/components/Flag";
import { MapViewer } from "@/components/MapViewer";
import { RankBars, type RankItem } from "@/components/RankBars";
import { SortTable } from "@/components/SortTable";
import { TeamLogo } from "@/components/TeamLogo";
import { MiniCup } from "@/components/TrophyIcon";
import { Figures } from "@/components/ui";
import { abbrFor } from "@/lib/abbr";
import { brandFor, logoFor, teamAccent } from "@/lib/brand";
import { getCityData, getCityPins } from "@/lib/cityData";
import { MIN_RANKED_SEASONS, rankOf, titlesByDecade, totalsOf, unitOf, unitTotals, type CityRef, type Rank, type RankKey, type Stay } from "@/lib/cityModel";
import { getAbbrs, getBrands } from "@/lib/data";
import { fmt3 } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LEAGUE_CODES, LG, seasonLabel } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { countryName } from "@/lib/people-format";
import { seasonPath } from "@/lib/slug";
import { tableOf } from "@/lib/sort";
import { getPaths } from "@/lib/teamSlugs";
import "@/components/alltime.css";
import "@/components/city.css";

// Nothing is drawn at build time: each city is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

const RANKS: RankKey[] = ["titles", "rate", "share"];
const RANK_LABEL = { titles: "city.rankTitles", rate: "city.rankRate", share: "city.rankShare" } as const;
const placeOf = (c: CityRef) => `${c.region.split("-")[1] ?? c.region}`;

export const generateMetadata = guardMeta(async ({ params }: PageProps<"/[locale]/s/city/[slug]">): Promise<Metadata> => {
  const { slug } = await params;
  const { say, plural, locale } = await currentSpeaker();
  const data = await getCityData();
  const c = data.byslug.get(slug);
  if (!c) return {};
  const t = totalsOf(data.stays.filter((s) => s.city === slug));
  const name = locale === "fr" && c.nameFr ? c.nameFr : c.name;
  return pageMeta({
    title: `${name}, ${placeOf(c)}`,
    description: say("city.metaDesc", { name, clubs: plural("count.clubs", t.clubs), titles: plural("count.championships", t.titles) }),
    path: `/city/${slug}`,
    locale,
  });
});

export default guard(async function CityPage({ params }: PageProps<"/[locale]/s/city/[slug]">) {
  const { slug } = await params;
  const { say, plural, fmt, locale } = await currentSpeaker();
  const data = await getCityData();
  const city = data.byslug.get(slug);
  if (!city) notFound();
  const [paths, brands] = await Promise.all([getPaths(), getBrands()]);
  const abbrs = Object.fromEntries(await Promise.all(LEAGUE_CODES.map(async (lg) => [lg, await getAbbrs(lg).catch(() => ({}))] as const)));
  const nameOf = (c: CityRef) => (locale === "fr" && c.nameFr ? c.nameFr : c.name);
  const metroName = city.metro ? (locale === "fr" && city.metroNameFr ? city.metroNameFr : city.metroName) : null;

  const here = data.stays.filter((s) => s.city === slug);
  const unit = unitOf(city);
  const members = data.cities.filter((c) => unitOf(c) === unit);
  const around = data.stays.filter((s) => s.city !== slug && members.some((m) => m.slug === s.city));
  const total = totalsOf(here);

  // How the city and its metro area stand among all the others.
  const perCity = new Map(data.cities.map((c) => [c.slug, totalsOf(data.stays.filter((s) => s.city === c.slug))]));
  for (const [k, v] of perCity) if (!v.clubs) perCity.delete(k);
  const perUnit = unitTotals(data.cities, data.stays);
  const ranks = (all: Map<string, typeof total>, key: string) => Object.fromEntries(RANKS.map((r) => [r, rankOf(all, key, r)])) as Record<RankKey, Rank | null>;
  const cityRanks = ranks(perCity, slug);
  const metroRanks = city.metro ? ranks(perUnit, unit) : null;
  const rankValue = (k: RankKey, v: number) => (k === "titles" ? fmt(v) : k === "rate" ? v.toFixed(1) : fmt3(v));
  const rankCell = (r: Rank | null, k: RankKey) => r ? <><b>{say("city.rankOf", { rank: fmt(r.rank), of: fmt(r.of) })}</b><span className="sub">{rankValue(k, r.value ?? 0)}</span></> : <span className="sub">{say("city.rankNone", { n: fmt(MIN_RANKED_SEASONS) })}</span>;

  const accent = (f: number) => teamAccent(brandFor(brands, f));
  const years = (s: Stay) => s.runs.map(([a, b]) => (a === b ? seasonLabel(s.league, a) : `${seasonLabel(s.league, a)}–${s.active && b === s.last && s.runs.at(-1)?.[1] === b ? say("teams.now") : seasonLabel(s.league, b)}`)).join(", ");
  const record = (s: Stay) => `${s.w}–${s.l}${s.t ? `–${s.t}` : ""}${s.otl ? `–${s.otl}` : ""}`;
  const clubLink = (s: Stay) => <Link href={paths.team(s.league, s.f)} prefetch={false}><TeamLogo url={logoFor(brands, s.f)} size={22} shape="square" />{s.name}</Link>;

  const built = tableOf(here, [
    { key: "club", label: say("col.team"), cls: "team", get: (s) => s.name, cell: clubLink },
    { key: "league", label: say("col.league"), get: (s) => LG[s.league as keyof typeof LG] },
    { key: "years", label: say("city.colYears"), cls: "seasoncell", get: (s) => s.first, cell: years },
    { key: "seasons", label: say("col.seasons"), num: true, get: (s) => s.seasons, cell: (s) => fmt(s.seasons) },
    { key: "titles", label: say("col.titles"), num: true, get: (s) => s.titles.length, cell: (s) => fmt(s.titles.length) },
    { key: "record", label: say("fig.record"), get: (s) => s.w, cell: (s) => (s.share == null ? "" : record(s)) },
    { key: "share", label: say("teams.colShare"), num: true, title: say("teams.shareTitle"), get: (s) => s.share, cell: (s) => (s.share == null ? "" : fmt3(s.share)) },
  ], (s) => `${s.league}-${s.f}`);
  const tableRows = built.rows.map((r, i) => ({ ...r, group: here[i].active ? "active" : "former" }));

  const wins = [...here].filter((s) => s.share != null).sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
  const shareItems: RankItem[] = wins.map((s, i) => {
    const a = accent(s.f);
    return {
      key: i, name: `${s.name} · ${LG[s.league as keyof typeof LG]}`, abbr: abbrFor(abbrs[s.league], s.f, s.last, s.name), href: paths.team(s.league, s.f), logo: logoFor(brands, s.f),
      tl: a.light, td: a.dark, value: s.share ?? 0, text: fmt3(s.share ?? 0), tip: `${record(s)} · ${plural("count.seasons", s.seasons)}`, gone: !s.active,
    };
  });

  const timeline: TimelineClub[] = here.map((s) => ({ key: `${s.league}-${s.f}`, league: s.league, f: s.f, name: s.name, seasons: s.rows }));

  const decades = titlesByDecade(here);
  const leagues = LEAGUE_CODES.filter((l) => here.some((s) => s.league === l));
  const decadeRows = decades.size
    ? Array.from({ length: (Math.max(...decades.keys()) - Math.min(...decades.keys())) / 10 + 1 }, (_, i) => { const d = Math.min(...decades.keys()) + 10 * i; return { decade: d, counts: decades.get(d) ?? {} }; })
    : [];
  const titleList = here.flatMap((s) => s.titles.map((y, i) => ({ s, y, team: s.titleTeams[i] }))).sort((a, b) => b.y - a.y || a.s.league.localeCompare(b.s.league));
  const byLeagueTitles = leagues.map((l) => ({ l, n: here.filter((s) => s.league === l).reduce((a, s) => a + s.titles.length, 0) })).filter((x) => x.n);

  const pins = await getCityPins([...here, ...around], data.placements, data.byslug, paths, say).catch(() => []);
  const members2 = members.filter((m) => m.slug !== slug).map((m) => ({ m, stays: around.filter((s) => s.city === m.slug) })).filter((x) => x.stays.length);

  return (
    <>
      <section className="head fade cityhead">
        <span className="eyebrow"><Link href="/cities">{say("cities.title")}</Link> · {placeOf(city)} · {countryName(city.country, locale)}</span>
        <h1 className="cityname">{nameOf(city)}<Flag code={city.country} /></h1>
        {metroName ? <p className="note">{say("city.metro", { name: metroName })}{members.length > 1 ? <> · {members.filter((m) => m.slug !== slug && perCity.has(m.slug)).map((m, i) => <span key={m.slug}>{i ? ", " : ""}<Link href={`/city/${m.slug}`} prefetch={false}>{nameOf(m)}</Link></span>)}</> : null}</p> : null}
        {total.clubs ? (
          <p className="lede">{say("city.lede", {
            name: nameOf(city), clubs: plural("count.clubs", total.clubs), leagues: String(total.leagues.length), seasons: plural("count.seasons", total.seasons),
            from: String(total.first), titles: plural("count.championships", total.titles),
          })}</p>
        ) : <p className="lede">{say("city.noClubs", { name: nameOf(city) })}</p>}
      </section>

      {total.clubs ? (
        <>
          <Figures items={[[say("city.figClubs"), total.clubs], [say("city.figActive"), total.active], [say("fig.seasons"), total.seasons], [say("col.titles"), total.titles], [say("fig.share"), total.share == null ? "—" : fmt3(total.share)]]} />

          <section className="section">
            <h2>{say("city.rankHead", { name: nameOf(city) })}</h2>
            <div className="scroll">
              <table className="cityrank">
                <thead><tr><th scope="col">{say("city.rankMeasure")}</th><th scope="col">{say("city.rankCity")}</th>{metroRanks ? <th scope="col">{say("city.rankMetro", { name: metroName ?? "" })}</th> : null}</tr></thead>
                <tbody>
                  {RANKS.map((k) => (
                    <tr key={k}>
                      <th scope="row">{say(RANK_LABEL[k])}</th>
                      <td>{rankCell(cityRanks[k], k)}</td>
                      {metroRanks ? <td>{rankCell(metroRanks[k], k)}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">{say("city.rankMethod", { n: fmt(MIN_RANKED_SEASONS) })}</p>
          </section>

          <section className="section">
            <h2>{say("city.clubsHead")}</h2>
            <div className="scroll cityclubs"><SortTable columns={built.columns} rows={tableRows} def="years.asc" label={say("city.clubsHead")} groups={[{ id: "active", title: say("city.groupActive") }, { id: "former", title: say("city.groupFormer") }]} /></div>
            <p className="note">{say("city.clubsNote")}</p>
          </section>

          {pins.length ? (
            <section className="section">
              <h2>{say("city.mapHead")}</h2>
              <MapViewer tight pins={pins} title={say("city.mapTitle", { name: nameOf(city) })} total={pins.length} note={say("city.mapNote", { n: fmt(pins.length) })} />
            </section>
          ) : null}

          <section className="section">
            <h2>{say("city.timelineHead")}</h2>
            <p className="note">{say("city.timelineNote")}</p>
            <CityTimeline clubs={timeline} />
          </section>

          {total.titles ? (
            <section className="section">
              <h2>{say("city.titlesHead")}</h2>
              <div className="citysplit">
                <ul className="citybysport" aria-label={say("city.titlesBySport")}>
                  {byLeagueTitles.map(({ l, n }) => <li key={l} style={{ "--lg": `var(--${l})` } as React.CSSProperties}><b>{LG[l as keyof typeof LG]}</b><i style={{ width: `${(100 * n) / Math.max(...byLeagueTitles.map((x) => x.n))}%` }} /><span>{fmt(n)}</span></li>)}
                </ul>
                <CityTitles decades={decadeRows} leagues={byLeagueTitles.map((x) => x.l)} />
              </div>
              <div className="seasonlist citytitlelist">
                {titleList.map(({ s, y, team }) => (
                  <Link key={`${s.league}-${s.f}-${y}`} className="full" href={seasonPath(s.league, y)} prefetch={false} title={`${LG[s.league as keyof typeof LG]} ${seasonLabel(s.league, y)} · ${team}`}>
                    <MiniCup league={s.league} />{seasonLabel(s.league, y)} {LG[s.league as keyof typeof LG]} · {team}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {shareItems.length ? (
            <section className="section">
              <h2>{say("city.shareHead")}</h2>
              <p className="note">{say("city.shareNote")}</p>
              <RankBars items={shareItems} centre={0.5} limit={12} more={say("city.shareMore", { n: fmt(shareItems.length) })} label={say("city.shareHead")} />
            </section>
          ) : null}
        </>
      ) : null}

      {members2.length ? (
        <section className="section">
          <h2>{say("city.aroundHead", { name: metroName ?? nameOf(city) })}</h2>
          <ul className="cityaround">
            {members2.map(({ m, stays }) => (
              <li key={m.slug}>
                <Link href={`/city/${m.slug}`} prefetch={false}><b>{nameOf(m)}</b>, {placeOf(m)}</Link>
                <span>{[...new Map(stays.map((s) => [`${s.league}-${s.f}`, s])).values()].map((s, i) => <span key={`${s.league}-${s.f}`}>{i ? " · " : ""}<Link href={paths.team(s.league, s.f)} prefetch={false}>{s.name}</Link></span>)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
});

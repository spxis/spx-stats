import type { Metadata } from "next";
import Link from "next/link";
import { CountryCards } from "@/components/CountryCards";
import { CountryTrend } from "@/components/CountryTrend";
import { KDot } from "@/components/CountryDonut";
import { Credits } from "@/components/Credits";
import { FlagIcon } from "@/components/FlagIcon";
import { SortTable } from "@/components/SortTable";
import { getLeagueCounts, getSeasonCounts } from "@/lib/countryData";
import { flagCodes } from "@/lib/flagCodes";
import { coolCards, isKnown, shareSeries, tally, versus } from "@/lib/countryModel";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LEAGUE_CODES, LG, seasonLabel } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { countryName, joinList, pctText } from "@/lib/people-format";
import { getPlayerPaths } from "@/lib/playerLinks";
import { tableOf } from "@/lib/sort";
import "@/components/country.css";

// A kept page: the table sorts and the trend picks its country in the browser, so the address never carries a query this page reads.

export const generateMetadata = guardMeta(async (): Promise<Metadata> => {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("country.pageTitle"), description: say("country.pageMetaDesc"), path: "/countries", locale });
});

const BAR_COUNTRIES = 7;
const TREND_COUNTRIES = 14;

export default guard(async function CountriesPage() {
  const { say, plural, fmt, locale } = await currentSpeaker();
  const [leagueRows, seasonRows] = await Promise.all([getLeagueCounts(), getSeasonCounts()]);
  const head = (
    <section className="head fade">
      <h1>{say("country.pageTitle")}</h1>
      <p className="lede">{say("country.pageLede")}</p>
    </section>
  );
  if (!leagueRows?.length || !seasonRows?.length) return <>{head}<p className="note">{say("country.notLoaded")}</p></>;

  const leagues = LEAGUE_CODES.filter((l) => leagueRows.some((r) => r.league === l));
  const cover = leagues.map((l) => { const r = leagueRows.find((x) => x.league === l)!; return { league: l, all: r.league_players, known: r.league_known, countries: leagueRows.filter((x) => x.league === l && isKnown(x.country)).length }; });
  const overall = tally(leagueRows.map((r) => [r.country, r.players] as [string, number]));
  const barCodes = overall.list.slice(0, BAR_COUNTRIES).map((c) => c.code);
  const flags = flagCodes(overall.list.map((c) => c.code));
  const cards = coolCards(seasonRows, leagueRows);
  const rows = versus(leagueRows);

  // a sentence that shows what the page is for: the best-covered league and its two biggest countries after the first
  const best = [...cover].sort((a, b) => b.known - a.known)[0];
  const inBest = leagueRows.filter((r) => r.league === best.league && isKnown(r.country)).sort((a, b) => b.players - a.players);
  const sample = inBest.length >= 3 ? say("country.sample", {
    league: LG[best.league], n1: fmt(inBest[1].players), c1: countryName(inBest[1].country, locale), n2: fmt(inBest[2].players), c2: countryName(inBest[2].country, locale),
  }) : null;

  const lead = (code: string) => (
    <span className="cflagname">{flags[code] ? <FlagIcon code={code} /> : null}<Link href={`/country/${code}`} prefetch={false}>{countryName(code, locale)}</Link></span>
  );
  const table = tableOf(rows, [
    { key: "country", label: say("col.country"), cls: "team", get: (r) => countryName(r.code, locale), cell: (r) => lead(r.code) },
    { key: "total", label: say("country.colTotal"), num: true, get: (r) => r.total, cell: (r) => fmt(r.total) },
    ...leagues.map((l) => ({
      key: l, label: LG[l], num: true, title: say("country.versusCellTitle", { league: LG[l] }),
      get: (r: (typeof rows)[number]) => r.byLeague[l]?.n ?? 0,
      cell: (r: (typeof rows)[number]) => { const c = r.byLeague[l]; return c ? <>{fmt(c.n)} <span className="note">{pctText(c.share, locale)}</span></> : "–"; },
    })),
  ], (r) => r.code);

  const paths = await getPlayerPaths();
  const firsts = leagueRows.filter((r) => isKnown(r.country));
  const firstTable = tableOf(firsts, [
    { key: "country", label: say("col.country"), cls: "team", get: (r) => countryName(r.country, locale), cell: (r) => lead(r.country) },
    { key: "league", label: say("col.league"), get: (r) => LG[r.league as keyof typeof LG], cell: (r) => <Link href={`/${r.league}/world`} prefetch={false}>{LG[r.league as keyof typeof LG]}</Link> },
    { key: "year", label: say("country.colFirst"), cls: "seasoncell", num: true, get: (r) => r.first_year, cell: (r) => seasonLabel(r.league, r.first_year) },
    {
      key: "player", label: say("country.colFirstPlayer"), cls: "team", get: (r) => r.first_name,
      cell: (r) => (r.first_name && r.first_person_id != null ? <Link href={paths(r.first_person_id, r.first_name, r.league)} prefetch={false}>{r.first_name}</Link> : r.first_name ?? ""),
    },
    { key: "players", label: say("country.colPlayers"), num: true, get: (r) => r.players, cell: (r) => fmt(r.players) },
  ], (r) => `${r.league}-${r.country}`);

  const trend: Record<string, ReturnType<typeof series>> = {};
  function series(code: string) {
    return leagues.map((l) => ({ league: l, points: shareSeries(seasonRows!, l, code, "decade") })).filter((s) => s.points.length);
  }
  for (const c of overall.list.slice(0, TREND_COUNTRIES)) trend[c.code] = series(c.code);
  const initial = (overall.list.find((c) => c.code !== "US") ?? overall.list[0]).code;
  const low = cover.filter((c) => c.known < c.all * 0.5);

  return (
    <>
      {head}
      {sample ? <p className="lede">{sample}</p> : null}
      {low.length ? <p className="note cnote-cov">{say("country.coverageSome", { leagues: joinList(low.map((c) => `${LG[c.league]} (${pctText(c.known / Math.max(c.all, 1), locale, 0)})`), locale) })}</p> : null}
      <CountryCards cards={cards} title={say("country.cardsTitle")} />

      <section className="section">
        <h2>{say("country.barsTitle")}</h2>
        <p className="note">{say("country.barsNote")}</p>
        <div className="cbars">
          {cover.map((c) => {
            const mine = leagueRows.filter((r) => r.league === c.league);
            const parts = barCodes.map((code, i) => ({ code, slot: i, n: mine.find((r) => r.country === code)?.players ?? 0 }));
            const rest = c.known - parts.reduce((a, p) => a + p.n, 0);
            const unknown = c.all - c.known;
            const w = (n: number) => `${(100 * n) / Math.max(c.all, 1)}%`;
            return (
              <div className="cbar" key={c.league}>
                <b>{LG[c.league]}</b>
                <div className="track" role="img" aria-label={`${LG[c.league]}: ${parts.filter((p) => p.n).map((p) => `${countryName(p.code, locale)} ${pctText(p.n / Math.max(c.all, 1), locale, 0)}`).join(", ")}`}>
                  {parts.filter((p) => p.n).map((p) => <i key={p.code} style={{ width: w(p.n), background: `var(--k${p.slot})` }} title={`${countryName(p.code, locale)}: ${fmt(p.n)}`} />)}
                  {rest > 0 ? <i style={{ width: w(rest), background: "var(--kother)" }} title={`${say("country.other")}: ${fmt(rest)}`} /> : null}
                  {unknown > 0 ? <i className="k-unknown" style={{ width: w(unknown), background: "repeating-linear-gradient(135deg, var(--kunk) 0 3px, transparent 3px 6px)" }} title={`${say("country.unknown")}: ${fmt(unknown)}`} /> : null}
                </div>
                <span className="cov">{say("country.barCoverage", { known: fmt(c.known), total: fmt(c.all), countries: plural("count.countries", c.countries) })}</span>
              </div>
            );
          })}
        </div>
        <div className="legend">
          {barCodes.map((code, i) => <span key={code}><KDot s={{ code, n: 0, slot: i }} />{flags[code] ? <FlagIcon code={code} /> : null}{countryName(code, locale)}</span>)}
          <span><KDot s={{ code: "other", n: 0, kind: "other" }} />{say("country.other")}</span>
          <span><KDot s={{ code: "ZZ", n: 0, kind: "unknown" }} />{say("country.unknown")}</span>
        </div>
      </section>

      <section className="section">
        <h2>{say("country.versusTitle")}</h2>
        <p className="note">{say("country.versusNote")}</p>
        <div className="tablebox"><SortTable {...table} param="sort_countries" def="total.desc" label={say("country.versusTitle")} /></div>
      </section>

      <section className="section">
        <h2>{say("country.trendTitle")}</h2>
        <p className="note">{say("country.trendNote")}</p>
        <CountryTrend data={trend} flags={flags} initial={initial} />
      </section>

      <section className="section">
        <h2>{say("country.firstsTitle")}</h2>
        <p className="note">{say("country.firstsNote")}</p>
        <div className="tablebox"><SortTable {...firstTable} param="sort_firsts" def="year.asc" label={say("country.firstsTitle")} /></div>
      </section>

      <p className="note">{say("country.noteSource")} <Credits say={say} use={["maps", "flags"]} /></p>
    </>
  );
});

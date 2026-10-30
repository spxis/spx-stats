import type { Metadata } from "next";
import { CountriesFirsts, CountriesVersus } from "@/components/CountriesTables";
import { CountryCards } from "@/components/CountryCards";
import { CountryMixBars } from "@/components/CountryMixBars";
import { CountryTrend } from "@/components/CountryTrend";
import { Credits } from "@/components/Credits";
import { countriesFirstsPath, countriesVersusPath } from "@/lib/countryLines";
import { firstsWire, getCountriesData, TREND_COUNTRIES, versusWire, trendInitial } from "@/lib/countriesData";
import { coolCards, isKnown } from "@/lib/countryModel";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LG } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { countryName, joinList, pctText } from "@/lib/people-format";
import "@/components/country.css";

// A kept page: the tables sort and the trend picks its country in the browser, so the address never carries a query this page reads.
// The two long tables send a short line a row and draw their first rows (the others appear on "Show all", or on /countries/versus and /countries/firsts), and the
// trend loads its decades when the reader gets near (/countries/rows/trend).

export const revalidate = 86400;
export const generateMetadata = guardMeta(async (): Promise<Metadata> => {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("country.pageTitle"), description: say("country.pageMetaDesc"), path: "/countries", locale });
});

export default guard(async function CountriesPage() {
  const { say, locale, fmt } = await currentSpeaker();
  const d = await getCountriesData();
  const head = (
    <section className="head fade">
      <h1>{say("country.pageTitle")}</h1>
      <p className="lede">{say("country.pageLede")}</p>
    </section>
  );
  if (!d) return <>{head}<p className="note">{say("country.notLoaded")}</p></>;
  const { leagueRows, seasonRows, cover, flags, bars, barCodes, overall } = d;
  const cards = coolCards(seasonRows, leagueRows);

  // a sentence that shows what the page is for: the best-covered league and its two biggest countries after the first
  const best = [...cover].sort((a, b) => b.known - a.known)[0];
  const inBest = leagueRows.filter((r) => r.league === best.league && isKnown(r.country)).sort((a, b) => b.players - a.players);
  const sample = inBest.length >= 3 ? say("country.sample", {
    league: LG[best.league as keyof typeof LG], n1: fmt(inBest[1].players), c1: countryName(inBest[1].country, locale), n2: fmt(inBest[2].players), c2: countryName(inBest[2].country, locale),
  }) : null;
  const low = cover.filter((c) => c.known < c.all * 0.5);

  return (
    <>
      {head}
      {sample ? <p className="lede">{sample}</p> : null}
      {low.length ? <p className="note cnote-cov">{say("country.coverageSome", { leagues: joinList(low.map((c) => `${LG[c.league as keyof typeof LG]} (${pctText(c.known / Math.max(c.all, 1), locale, 0)})`), locale) })}</p> : null}
      <CountryCards cards={cards} title={say("country.cardsTitle")} />

      <section className="section">
        <h2>{say("country.barsTitle")}</h2>
        <p className="note">{say("country.barsNote")}</p>
        <CountryMixBars bars={bars} codes={barCodes} flags={flags} />
      </section>

      <section className="section">
        <h2>{say("country.versusTitle")}</h2>
        <p className="note">{say("country.versusNote")}</p>
        <CountriesVersus wire={versusWire(d)} flags={flags} hrefAll={countriesVersusPath} label={say("country.versusTitle")} />
      </section>

      <section className="section">
        <h2>{say("country.trendTitle")}</h2>
        <p className="note">{say("country.trendNote")}</p>
        <CountryTrend codes={overall.list.slice(0, TREND_COUNTRIES).map((c) => c.code)} flags={flags} initial={trendInitial(d)} />
      </section>

      <section className="section">
        <h2>{say("country.firstsTitle")}</h2>
        <p className="note">{say("country.firstsNote")}</p>
        <CountriesFirsts wire={await firstsWire(d)} flags={flags} hrefAll={countriesFirstsPath} label={say("country.firstsTitle")} />
      </section>

      <p className="note">{say("country.noteSource")} <Credits say={say} use={["maps", "flags"]} /></p>
    </>
  );
});

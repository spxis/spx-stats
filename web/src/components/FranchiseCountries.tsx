import Link from "next/link";
import { CountryArea } from "@/components/CountryArea";
import { CountryDonut, type Slice } from "@/components/CountryDonut";
import { CountryMapDialog } from "@/components/CountryMapDialog";
import { CountryRanker } from "@/components/CountryRanker";
import { Credits } from "@/components/Credits";
import { flagsFor, getFranchiseCountries, getFranchiseSeasons } from "@/lib/countryData";
import { MIN_PLAYERS, rankCountries, stackSeries, tally, UNKNOWN, withOther, type RankKind } from "@/lib/countryModel";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { STAT_GROUP_ORDER } from "@/lib/playerStats";
import "@/components/country.css";

const KEEP = 6;

/**
 * "Where the players come from" on a franchise's page (migration 067's views; the section is left out while they are missing): a donut of everyone
 * who played for the club by country, a world map of the same, the countries over the seasons as a stacked area, and the country ranker over all its
 * seasons. A country in the map links to its page (every league's players from there).
 */
export async function FranchiseCountries({ lg, f, name }: { lg: string; f: number; name: string }) {
  const [seasons, rows] = await Promise.all([getFranchiseSeasons(lg, f), getFranchiseCountries(lg, f)]);
  if (!seasons?.length || !rows?.length) return null;
  const everyone = rows.filter((r) => r.stat_group === "all");
  const t = tally(everyone.map((r) => [r.country, r.players] as [string, number]));
  if (t.known < 0.1 * t.total) return null;
  const limited = t.known < 0.5 * t.total;
  const { say, plural, fmt } = await currentSpeaker();
  const { top, other } = withOther(t.list, KEEP);
  const slices: Slice[] = [
    ...top.map((c, i) => ({ code: c.code, n: c.n, slot: i })),
    ...(other ? [{ code: "other", n: other, kind: "other" as const }] : []),
    ...(t.unknown ? [{ code: UNKNOWN, n: t.unknown, kind: "unknown" as const }] : []),
  ];
  const keep = top.map((c) => c.code);
  const stack = stackSeries(seasons, keep);
  const flags = await flagsFor(t.list.map((c) => c.code));
  const counts = Object.fromEntries(t.list.map((c) => [c.code, c.n]));
  const tpl = "/country/{code}";
  const href = (code: string) => `/country/${code}`;

  const ranked = (limited ? [] : STAT_GROUP_ORDER).filter((k) => rows.some((r) => r.stat_group === k)).map((k) => ({
    k: k as RankKind,
    result: rankCountries(k as RankKind, rows.filter((r) => r.stat_group === k).map((r) => ({ code: r.country, players: r.players, stats: r.stats }))),
  }));
  const rankedRows = ranked.filter((r) => r.result.rows.length);
  const title = say("country.franchiseMapTitle", { name });
  return (
    <section className="section" id="countries">
      <h2>{say("country.teamTitle")}</h2>
      <p className="note">{say("country.franchiseLede", { known: plural("count.players", t.known), total: fmt(t.total), countries: plural("count.countries", t.list.length) })}</p>
      <div className="chartrow">
        <CountryDonut title={say("country.franchiseDonut")} slices={slices} flags={flags} centre={fmt(t.total)} centreSub={say("country.players")} hrefTpl={tpl} />
        <div>
          <h3>{say("country.mapHead")}</h3>
          <CountryMapDialog counts={counts} flags={flags} hrefTpl={tpl} title={title} caption={say("country.mapCaption")} unit="players" />
        </div>
      </div>
      <h3>{say("country.areaTitle")}</h3>
      <p className="note">{say("country.areaNote")}</p>
      <CountryArea stack={stack} league={lg} label={say("country.areaAria", { name })} tableLabel={say("country.showTable")} />
      {limited ? <p className="note cnote-cov">{say("country.lowRoster", { known: fmt(t.known), total: fmt(t.total) })}</p> : null}
      {rankedRows.length ? (
        <>
          <h3>{say("country.rankHead")}</h3>
          <p className="note">{say("country.rankNoteAll", { n: fmt(MIN_PLAYERS) })}</p>
          {rankedRows.map(({ k, result }) => <CountryRanker key={k} kind={k} result={result} hrefFor={href} min={MIN_PLAYERS} />)}
        </>
      ) : null}
      <p className="note">{say("country.noteSource")} <Credits say={say} use={["maps"]} /></p>
      {t.unknown ? <p className="note">{say("country.unknownNote", { n: plural("count.players", t.unknown) })}</p> : null}
      <p className="note"><Link href={`/${lg}/world`} prefetch={false}>{say("country.leagueLink", { league: lg.toUpperCase() })}</Link> · <Link href="/countries" prefetch={false}>{say("country.allLink")}</Link></p>
    </section>
  );
}

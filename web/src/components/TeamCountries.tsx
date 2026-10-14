import Link from "next/link";
import { Flag } from "@/components/Flag";
import { CountryDonut, type Slice } from "@/components/CountryDonut";
import { CountryMapDialog } from "@/components/CountryMapDialog";
import { CountryRanker } from "@/components/CountryRanker";
import { Credits } from "@/components/Credits";
import { queryHref } from "@/components/ViewTabs";
import { getClubSeasonCountries, getSeasonCounts } from "@/lib/countryData";
import { flagCodes } from "@/lib/flagCodes";
import { MIN_PLAYERS, rankCountries, sumStats, tally, UNKNOWN, withOther, type RankKind } from "@/lib/countryModel";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { countryName, pctText } from "@/lib/people-format";
import { getRoster, type RosterPlayer } from "@/lib/roster";
import { STAT_GROUP_ORDER } from "@/lib/playerStats";
import "@/components/country.css";

const KEEP = 6;

/**
 * "Where the players come from" on a club's season page: a donut of the roster by country, a world map of the counts (a country opens the roster
 * filtered to it), the club's share of each country against the league's that season, and the country ranker (which country's players did best for the club).
 * The roster is the players with statistics for the club, as the roster table; for a league with none, the counts come from api.country_team_season
 * (migration 068), and the section is left out while that view is missing.
 */
export async function TeamCountries({ lg, year, season, teamSeasonId, path, sp }: {
  lg: string; year: number; season: string; teamSeasonId: number; path: string; sp: Record<string, string | string[] | undefined>;
}) {
  const roster = await getRoster(teamSeasonId);
  let counts: [string, number][];
  if (roster.length) counts = roster.map((p) => [p.nat ?? UNKNOWN, 1] as [string, number]);
  else {
    const club = await getClubSeasonCountries(teamSeasonId);
    if (!club?.length) return null;
    counts = club.map((r) => [r.country, r.players] as [string, number]);
  }
  const t = tally(counts);
  // With the country known for under a tenth of the players there is nothing to draw (the league page says how far the archive has got); under half, only the donut and the map.
  if (t.known < 0.1 * t.total) return null;
  const limited = t.known < 0.5 * t.total;
  const { say, plural, fmt, locale } = await currentSpeaker();
  const tpl = `${queryHref(path, sp, { nat: "XXCODEXX" })}#roster`.replace("XXCODEXX", "{code}");
  const href = (code: string) => tpl.replace("{code}", code);
  const { top, other } = withOther(t.list, KEEP);
  const slices: Slice[] = [
    ...top.map((c, i) => ({ code: c.code, n: c.n, slot: i })),
    ...(other ? [{ code: "other", n: other, kind: "other" as const }] : []),
    ...(t.unknown ? [{ code: UNKNOWN, n: t.unknown, kind: "unknown" as const }] : []),
  ];

  // The league that season, for the comparison; left out while the views are missing.
  const league = limited ? null : await getSeasonCounts(lg, undefined, year);
  const leagueKnown = league?.[0]?.season_known ?? 0;
  const against = leagueKnown ? t.list.slice(0, 5).map((c) => ({ code: c.code, mine: c.n / t.known, theirs: (league!.find((r) => r.country === c.code)?.players ?? 0) / leagueKnown })) : [];
  const top100 = Math.max(0.01, ...against.flatMap((r) => [r.mine, r.theirs]));

  const flags = flagCodes(t.list.map((c) => c.code));
  const countsRecord = Object.fromEntries(t.list.map((c) => [c.code, c.n]));
  const pc = (v: number) => pctText(v, locale);

  const kinds = STAT_GROUP_ORDER.filter((k) => roster.some((p) => p.kind === k));
  const ranked = (limited ? [] : kinds).map((k) => {
    const mine = roster.filter((p) => p.kind === k);
    const by = new Map<string, RosterPlayer[]>();
    for (const p of mine) if (p.nat) (by.get(p.nat) ?? by.set(p.nat, []).get(p.nat)!).push(p);
    return { k: k as RankKind, result: rankCountries(k as RankKind, [...by].map(([code, ps]) => ({ code, players: ps.length, stats: sumStats(ps.map((p) => p.stats)) }))) };
  });

  const rankedRows = ranked.filter((r) => r.result.rows.length);
  const mapTitle = say("country.teamMapTitle", { season });
  return (
    <section className="section" id="countries">
      <h2>{say("country.teamTitle")}</h2>
      <p className="note">{say("country.teamLede", { known: plural("count.players", t.known), total: fmt(t.total), countries: plural("count.countries", t.list.length) })}</p>
      <div className="chartrow">
        <CountryDonut title={say("country.rosterDonut", { season })} slices={slices} flags={flags} centre={fmt(t.total)} centreSub={say("country.players")} hrefTpl={roster.length ? tpl : undefined} />
        <div>
          <h3>{say("country.mapHead")}</h3>
          <CountryMapDialog counts={countsRecord} flags={flags} hrefTpl={roster.length ? tpl : undefined} title={mapTitle} caption={say("country.mapCaption")} unit="players" />
        </div>
      </div>
      {against.length ? (
        <>
          <h3>{say("country.againstTitle", { league: lg.toUpperCase(), season })}</h3>
          <p className="note">{say("country.againstNote")}</p>
          <ul className="ccmp" aria-label={say("country.againstTitle", { league: lg.toUpperCase(), season })}>
            {against.map((r) => (
              <li key={r.code}>
                <span className="cflagname"><Flag code={r.code} />{countryName(r.code, locale)}</span>
                <span className="bars" aria-hidden="true">
                  <i className="mine" style={{ width: `${(100 * r.mine) / top100}%` }} />
                  <i className="theirs" style={{ width: `${(100 * r.theirs) / top100}%` }} />
                </span>
                <span className="vals">{say("country.againstVals", { mine: pc(r.mine), theirs: pc(r.theirs) })}</span>
              </li>
            ))}
          </ul>
          <div className="legend"><span><i style={{ background: "var(--accent)" }} />{say("country.againstMine")}</span><span><i style={{ background: "var(--kother)" }} />{say("country.againstLeague", { league: lg.toUpperCase() })}</span></div>
        </>
      ) : null}
      {limited ? <p className="note cnote-cov">{say("country.lowRoster", { known: fmt(t.known), total: fmt(t.total) })}</p> : null}
      {rankedRows.length ? (
        <>
          <h3>{say("country.rankHead")}</h3>
          <p className="note">{say("country.rankNote", { n: fmt(MIN_PLAYERS) })}</p>
          {rankedRows.map(({ k, result }) => <CountryRanker key={k} kind={k} result={result} hrefFor={href} min={MIN_PLAYERS} />)}
        </>
      ) : null}
      <p className="note">{say("country.noteSource")} <Credits say={say} use={["maps"]} /></p>
      {t.unknown ? <p className="note">{say("country.unknownNote", { n: plural("count.players", t.unknown) })}</p> : null}
      <p className="note"><Link href="/countries" prefetch={false}>{say("country.allLink")}</Link></p>
    </section>
  );
}

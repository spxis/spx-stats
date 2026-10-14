import Link from "next/link";
import { ChipsMore } from "@/components/ChipsMore";
import { CountryDonut } from "@/components/CountryDonut";
import { CountryMapDialog } from "@/components/CountryMapDialog";
import { Credits } from "@/components/Credits";
import { Flag } from "@/components/Flag";
import { flagCodes } from "@/lib/flagCodes";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { countryName, pctText } from "@/lib/people-format";
import { against, chipSplit, coverage, slicesOf, type Tally } from "@/lib/playerCountryModel";
import "@/components/country.css";

/**
 * "Where the players come from" on /players: flag chips for the biggest countries under the choices made above (a chip sets `?nat=` and keeps the rest),
 * a donut of the players by country, a world map of the same counts that opens large and sends a pressed country to `?nat=`, and, for one league,
 * its mix against all the leagues' (or, when a range of years narrows it, against its own whole history). `t` counts the players the list shows
 * apart from the country, so the figures here never shrink to the one country chosen. Left out where the country is known for under a tenth of them.
 */
export async function PlayerCountries({ t, reference, league, chosen, href }: {
  t: Tally;
  /** What the bars are set against, and its figures; null for no bars. */
  reference: { kind: "leagues" | "league"; tally: Tally } | null;
  league: string; chosen: string;
  /** The address of the list with some choices changed (the page keeps the league, years, letter and search in it). */
  href: (changes: Record<string, string | null>) => string;
}) {
  const level = coverage(t);
  if (level === "none") return null;
  const { say, plural, fmt, locale } = await currentSpeaker();
  const tpl = `${href({ nat: "XXCODEXX" })}`.replace("XXCODEXX", "{code}");
  const flags = flagCodes(t.list.map((c) => c.code));
  const counts = Object.fromEntries(t.list.map((c) => [c.code, c.n]));
  const { shown, more } = chipSplit(t.list, chosen);
  const bars = level === "ok" && reference ? against(t, reference.tally) : [];
  const top = Math.max(0.01, ...bars.flatMap((r) => [r.mine, r.theirs]));
  const pc = (v: number) => pctText(v, locale);
  const lg = league.toUpperCase();
  const barsTitle = reference?.kind === "league" ? say("players.whereAgainstSelf", { league: lg }) : say("players.whereAgainstAll", { league: lg });
  const chip = (c: { code: string; n: number }) => {
    const on = c.code === chosen;
    const name = countryName(c.code, locale);
    return (
      <Link key={c.code} href={href({ nat: on ? null : c.code })} prefetch={false} aria-current={on ? "true" : undefined}
        title={`${name}: ${plural("count.players", c.n)}`}>
        <Flag code={c.code} shape="round" />{name}<span className="n">{fmt(c.n)}</span>
      </Link>
    );
  };
  return (
    <section className="section pcountries" id="countries">
      <h2>{say("country.teamTitle")}</h2>
      <p className="note">{say("country.teamLede", { known: plural("count.players", t.known), total: fmt(t.total), countries: plural("count.countries", t.list.length) })}</p>
      <nav className="pchips" aria-label={say("players.whereChips")}>
        <Link className="pall" href={href({ nat: null })} prefetch={false} aria-current={chosen ? undefined : "true"}>{say("players.countryClear")}</Link>
        {shown.map(chip)}
        {more.length ? (
          <ChipsMore label={say("players.whereMore", { n: fmt(more.length) })}>{more.map(chip)}</ChipsMore>
        ) : null}
      </nav>
      <div className="pc-row">
        <CountryDonut title={say("players.whereDonut")} slices={slicesOf(t)} flags={flags} centre={fmt(t.total)} centreSub={say("country.players")} hrefTpl={tpl} />
        <div>
          <h3>{say("country.mapHead")}</h3>
          <CountryMapDialog counts={counts} flags={flags} hrefTpl={tpl} title={say("players.whereDonut")} caption={say("country.mapCaption")} unit="players" wide />
        </div>
      </div>
      {bars.length ? (
        <>
          <h3>{barsTitle}</h3>
          <p className="note">{say(reference!.kind === "league" ? "players.whereAgainstSelfNote" : "players.whereAgainstAllNote", { league: lg })}</p>
          <ul className="ccmp" aria-label={barsTitle}>
            {bars.map((r) => (
              <li key={r.code}>
                <span className="cflagname"><Flag code={r.code} />{countryName(r.code, locale)}</span>
                <span className="bars" aria-hidden="true">
                  <i className="mine" style={{ width: `${(100 * r.mine) / top}%` }} />
                  <i className="theirs" style={{ width: `${(100 * r.theirs) / top}%` }} />
                </span>
                <span className="vals">{say("players.whereAgainstVals", { mine: pc(r.mine), theirs: pc(r.theirs) })}</span>
              </li>
            ))}
          </ul>
          <div className="legend">
            <span><i style={{ background: "var(--accent)" }} />{say("players.whereAgainstMine")}</span>
            <span><i style={{ background: "var(--kother)" }} />{reference!.kind === "league" ? say("players.whereAgainstLeagueAll", { league: lg }) : say("players.whereAgainstLeagues")}</span>
          </div>
        </>
      ) : null}
      {level === "low" ? <p className="note cnote-cov">{say("players.whereLow", { known: fmt(t.known), total: fmt(t.total) })}</p> : null}
      <p className="note">{say("country.noteSource")} <Credits say={say} use={["maps"]} /></p>
      {t.unknown ? <p className="note">{say("country.unknownNote", { n: plural("count.players", t.unknown) })}</p> : null}
      <p className="note"><Link href="/countries" prefetch={false}>{say("country.allLink")}</Link></p>
    </section>
  );
}

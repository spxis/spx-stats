import Link from "@/components/Link";
import { CountryChips } from "@/components/CountryChips";
import { CountryDonut } from "@/components/CountryDonut";
import { CountryMapDialog } from "@/components/CountryMapDialog";
import { Credits } from "@/components/Credits";
import { Flag } from "@/components/Flag";
import type { ChipCountry } from "@/lib/countryChips";
import { flagCodes, hasFlag } from "@/lib/flagCodes";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LOCALE_TAG } from "@/lib/locale";
import { countryName, pctText } from "@/lib/people-format";
import { against, chipSplit, coverage, slicesOf, type Tally } from "@/lib/playerCountryModel";
import "@/components/country.css";

/** How many countries the chip row names before "More countries": what one line holds at the page's width. */
export const CHIPS_SHOWN = 6;

/** The countries the "More countries" button holds (for the page's CountryScope, which lets the donut's "Other countries" open it). */
export const moreChips = (t: Tally, chosen: string): number => (coverage(t) === "none" ? 0 : chipSplit(t.list, chosen, CHIPS_SHOWN).more.length);

/**
 * The countries of /players in two parts that share one CountryScope on the page, so a country pointed at or chosen is lit in both:
 *   part "chips": the country filter, one row among the other filters: "All countries" and the biggest countries as flag chips (a chip sets `?nat=`
 *     and keeps the rest of the address), then "More countries" for the others; a chosen country outside the biggest takes the last chip's place.
 *   part "strip": under the list, a small donut of the players by country and a small world map side by side (the map opens large; a pressed country
 *     or slice sets `?nat=`), the league against all leagues (or against its own history, once years narrow it), and the notes on where the
 *     country comes from, small, at the foot of the page.
 * `t` counts the players the list shows apart from the country, so these figures never shrink to the one country chosen. Left out where the country is
 * known for under a tenth of them.
 */
export async function PlayerCountries({ part, t, reference, league, chosen, href }: {
  part: "chips" | "strip";
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

  if (part === "chips") {
    const { shown, more } = chipSplit(t.list, chosen, CHIPS_SHOWN);
    const byName = new Intl.Collator(LOCALE_TAG[locale], { sensitivity: "base" });
    const moreByName = [...more].sort((a, b) => byName.compare(countryName(a.code, locale), countryName(b.code, locale)));
    const chip = (c: { code: string; n: number }): ChipCountry => [c.code, countryName(c.code, locale), c.n, hasFlag(c.code) ? 1 : 0];
    return (
      <CountryChips shown={shown.map(chip)} more={moreByName.map(chip)} chosen={chosen} hrefTpl={href({ nat: "XXCODEXX" }).replace("XXCODEXX", "{code}")} clearHref={href({ nat: null })}
        allLabel={say("players.countryClear")} moreLabel={more.length ? say("players.whereMore", { n: fmt(more.length) }) : ""} />
    );
  }

  const tpl = `${href({ nat: "XXCODEXX" })}`.replace("XXCODEXX", "{code}");
  const flags = flagCodes(t.list.map((c) => c.code));
  const counts = Object.fromEntries(t.list.map((c) => [c.code, c.n]));
  const bars = level === "ok" && reference ? against(t, reference.tally) : [];
  const top = Math.max(0.01, ...bars.flatMap((r) => [r.mine, r.theirs]));
  const pc = (v: number) => pctText(v, locale);
  const lg = league.toUpperCase();
  const barsTitle = reference?.kind === "league" ? say("players.whereAgainstSelf", { league: lg }) : say("players.whereAgainstAll", { league: lg });
  return (
    <section className="pcountries" id="countries" aria-label={say("country.teamTitle")}>
      <div className="pstrip">
        <CountryDonut title={say("players.whereDonut")} slices={slicesOf(t)} flags={flags} centre={fmt(t.total)} centreSub={say("country.players")} hrefTpl={tpl} compact />
        <CountryMapDialog counts={counts} flags={flags} hrefTpl={tpl} title={say("players.whereDonut")} caption={say("country.mapCaption")} unit="players" />
      </div>
      {bars.length ? (
        <>
          <h3 className="psub">{barsTitle}</h3>
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
          <p className="note small">{say(reference!.kind === "league" ? "players.whereAgainstSelfNote" : "players.whereAgainstAllNote", { league: lg })}</p>
        </>
      ) : null}
      <p className="note small">
        {say("country.teamLede", { known: plural("count.players", t.known), total: fmt(t.total), countries: plural("count.countries", t.list.length) })}
        {level === "low" ? ` ${say("players.whereLow", { known: fmt(t.known), total: fmt(t.total) })}` : ""}
        {t.unknown ? ` ${say("country.unknownNote", { n: plural("count.players", t.unknown) })}` : ""}
      </p>
      <p className="note small">{say("country.noteSource")} <Credits say={say} use={["maps"]} /> · <Link href="/countries" prefetch={false}>{say("country.allLink")}</Link></p>
    </section>
  );
}

import { Flag } from "@/components/Flag";
import type { Card } from "@/lib/countryModel";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LG, seasonLabel } from "@/lib/leagues";
import { LOCALE_TAG } from "@/lib/locale";
import { countryName, pctText } from "@/lib/people-format";
import "@/components/country.css";

const TEXT = {
  mostCountries: "country.card.mostCountries",
  widest: "country.card.widest",
  mixed: "country.card.mixed",
  rise: "country.card.rise",
  single: "country.card.single",
  newest: "country.card.newest",
} as const;

/** A few curious facts, each a number and a sentence that names its league (countryModel.coolCards works them out from the same counts as the tables). */
export async function CountryCards({ cards, title }: { cards: Card[]; title: string }) {
  const { say, fmt, locale } = await currentSpeaker();
  const one = new Intl.NumberFormat(LOCALE_TAG[locale], { maximumFractionDigits: 1 });
  return (
    <section className="section">
      <h2>{title}</h2>
      <div className="ccards">
        {cards.map((c) => {
          const league = LG[c.league as keyof typeof LG] ?? c.league.toUpperCase();
          const country = c.country ? countryName(c.country, locale) : "";
          const n = Number(c.value);
          // the big figure, and the same number as the sentence writes it
          const big = c.id === "newest" ? seasonLabel(c.league, c.year ?? 0) : c.id === "mixed" ? pctText(n / 100, locale, 1) : c.id === "rise" ? `+${one.format(n)} ${say("country.pts")}` : fmt(n);
          const value = c.id === "mixed" || c.id === "rise" ? one.format(n) : fmt(n);
          return (
            <div className="ccard" key={`${c.id}-${c.league}`}>
              <span className="lg">{league}{c.country ? <> <Flag code={c.country} /></> : null}</span>
              <b>{big}</b>
              <span>{say(TEXT[c.id as keyof typeof TEXT], { league, country, value, season: c.year != null ? seasonLabel(c.league, c.year) : "" })}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
